/**
 * #12 — 老 session 文件引用补齐到 sidecar
 *
 * 这次 StageFile 收口后，历史消息恢复需要能从 sidecar 查询文件生命周期。
 * 老 JSONL 里可能只有 toolResult.details.files / artifactFile / inline screenshot，
 * 因此迁移只做两件事：
 *   1. 扫描历史消息里的本地文件路径，注册到对应 session 的 .files.json；
 *   2. 把旧 browser inline screenshot 物化成 session-files 缓存图片并注册。
 *
 * 迁移不重写 JSONL。恢复时由 sessions route 按 fileId / filePath / deterministic screenshot
 * path 回填 block 的生命周期字段。
 */
import fsp from "fs/promises";
import path from "path";
import { SessionFileRegistry } from "../../lib/session-files/session-file-registry.js";
import { persistBrowserScreenshotFileSync } from "../../lib/session-files/browser-screenshot-file.js";
import { scanAgentDirs, fileExists, collectJsonlRecursive } from "./helpers.js";

export async function migrate(ctx) {
  const { hanakoHome, agentsDir, log } = ctx;
  if (!hanakoHome || !agentsDir) return;

  const registry = new SessionFileRegistry({
    managedCacheRoot: path.join(hanakoHome, "session-files"),
  });
  const sessionPaths = await collectLegacySessionJsonlPaths(agentsDir);
  let registered = 0;
  let materialized = 0;
  let skipped = 0;

  for (const sessionPath of sessionPaths) {
    let lines;
    try {
      const raw = await fsp.readFile(sessionPath, "utf-8");
      lines = raw.split("\n").filter(Boolean);
    } catch (err) {
      skipped++;
      log(`[migrations] #12: skipped unreadable session ${sessionPath} (${err.message})`);
      continue;
    }

    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        skipped++;
        continue;
      }
      const msg = entry?.message;
      if (entry?.type !== "message" || msg?.role !== "toolResult") continue;

      for (const ref of legacySessionFileRefs(msg)) {
        const ok = await registerLegacySessionFile({ registry, sessionPath, ref, hanakoHome, log });
        if (ok) registered++;
        else skipped++;
      }

      const screenshot = legacyBrowserScreenshot(msg);
      if (screenshot?.base64) {
        try {
          persistBrowserScreenshotFileSync({
            hanakoHome,
            sessionPath,
            base64: screenshot.base64,
            mimeType: screenshot.mimeType || "image/png",
            registerSessionFile: (record) => registry.registerFile(record),
          });
          materialized++;
        } catch (err) {
          skipped++;
          log(`[migrations] #12: skipped browser screenshot in ${sessionPath} (${err.message})`);
        }
      }
    }
  }

  log(`[migrations] #12: session file sidecars backfilled (files=${registered}, screenshots=${materialized}, skipped=${skipped})`);
}

// ── JSONL 收集 ────────────────────────────────────────────────────────────────────

async function collectLegacySessionJsonlPaths(agentsDir) {
  const agents = await scanAgentDirs(agentsDir);

  const out = [];
  for (const agent of agents) {
    const agentDir = path.join(agentsDir, agent.name);
    await collectJsonlRecursive(path.join(agentDir, "sessions"), out);
    await collectJsonlRecursive(path.join(agentDir, "subagent-sessions"), out);
  }
  return out;
}

// ── 文件引用提取（纯逻辑，无 I/O）───────────────────────────────────────────────

function legacySessionFileRefs(msg) {
  const details = msg?.details;
  if (!details || typeof details !== "object") return [];

  const refs = [];
  const toolName = msg.toolName;

  if (toolName === "stage_files" || toolName === "present_files") {
    if (Array.isArray(details.files)) {
      for (const file of details.files) {
        pushLegacyFileRef(refs, file, {
          origin: file?.origin || "stage_files",
          storageKind: file?.storageKind || "external",
        });
      }
    }
    pushLegacyFileRef(refs, details, {
      origin: details.origin || "stage_files",
      storageKind: details.storageKind || "external",
    });
  }

  if (toolName === "create_artifact") {
    const artifactFile = details.artifactFile || details.sessionFile || details.file;
    pushLegacyFileRef(refs, artifactFile, {
      origin: artifactFile?.origin || "agent_artifact",
      storageKind: artifactFile?.storageKind || "external",
      label: details.title,
    });
  }

  if (toolName === "install_skill") {
    pushLegacyFileRef(refs, details.installedFile || details.sourceFile || details, {
      origin: "skill_install_source",
      storageKind: "install_source",
      label: details.skillName,
    });
  }

  if (toolName === "install_plugin" || toolName === "plugin_install") {
    pushLegacyFileRef(refs, details.installedFile || details.sourceFile || details, {
      origin: "plugin_install_source",
      storageKind: "install_source",
      label: details.pluginName || details.name,
    });
  }

  if (details.card?.file || details.card?.sessionFile || details.card?.sourceFile) {
    pushLegacyFileRef(refs, details.card.file || details.card.sessionFile || details.card.sourceFile, {
      origin: "plugin_output",
      storageKind: "plugin_data",
      label: details.card.title,
    });
  }

  if (Array.isArray(details.media?.items)) {
    for (const item of details.media.items) {
      pushLegacyFileRef(refs, item, {
        origin: item.origin || "agent_output",
        storageKind: item.storageKind || "external",
      });
    }
  }

  return refs;
}

function pushLegacyFileRef(refs, candidate, defaults = {}) {
  if (!candidate || typeof candidate !== "object") return;
  const filePath = candidate.filePath || candidate.path || candidate.realPath || candidate.localPath;
  if (!filePath) return;
  refs.push({
    filePath,
    label: candidate.label || candidate.displayName || candidate.filename || candidate.name || defaults.label,
    origin: candidate.origin || defaults.origin || "unknown",
    storageKind: candidate.storageKind || defaults.storageKind || "external",
  });
}

// ── 文件注册（含异步 I/O）─────────────────────────────────────────────────────────

async function registerLegacySessionFile({ registry, sessionPath, ref, hanakoHome, log }) {
  if (!ref?.filePath || !path.isAbsolute(ref.filePath)) return false;
  if (!(await fileExists(ref.filePath))) return false;

  try {
    registry.registerFile({
      sessionPath,
      filePath: ref.filePath,
      label: ref.label || path.basename(ref.filePath),
      origin: ref.origin || "unknown",
      storageKind: await normalizeLegacyStorageKind(ref, hanakoHome),
    });
    return true;
  } catch (err) {
    log(`[migrations] #12: skipped file ${ref.filePath} in ${sessionPath} (${err.message})`);
    return false;
  }
}

async function normalizeLegacyStorageKind(ref, hanakoHome) {
  const storageKind = ref.storageKind || "external";
  if (storageKind !== "managed_cache") return storageKind;

  const managedRoot = path.join(hanakoHome, "session-files");
  const resolved = await normalizeExistingOrResolvedPathForMigration(ref.filePath);
  const root = await normalizeExistingOrResolvedPathForMigration(managedRoot);
  const rel = path.relative(root, resolved);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel))
    ? "managed_cache"
    : "external";
}

async function normalizeExistingOrResolvedPathForMigration(filePath) {
  const resolved = path.resolve(filePath);
  try {
    return await fsp.realpath(resolved);
  } catch {
    return resolved;
  }
}

// ── 浏览器截图提取（纯逻辑，无 I/O）───────────────────────────────────────────────

function legacyBrowserScreenshot(msg) {
  if (msg?.toolName !== "browser" || msg?.details?.action !== "screenshot") return null;
  if (msg.details?.screenshotFile || msg.details?.fileId || msg.details?.id) return null;

  const image = Array.isArray(msg.content)
    ? msg.content.find((block) => block?.type === "image" && block?.data)
    : null;
  const base64 = image?.data || msg.details?.thumbnail || msg.details?.base64;
  if (!base64) return null;
  return {
    base64,
    mimeType: image?.mimeType || msg.details?.mimeType || "image/png",
  };
}
