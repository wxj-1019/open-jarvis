/**
 * #15 — 旧 prompt snapshot 会话里无法证明 xhigh 支持的记录显式降级为 high
 *
 * 引入 xhigh thinking 后老 session 的 session-meta.json 可能残留 xhigh 标签，
 * 但该模型的 prompt snapshot 无法证明它是在 xhigh 模式下生成的。
 * 迁移只降级不安全记录，不碰已有 high / low 且无 prompt 快照的条目。
 */
import fsp from "fs/promises";
import path from "path";
import { normalizeThinkingLevelForModel } from "../session-thinking-level.js";
import { scanAgentDirs, atomicWriteJSON } from "./helpers.js";

export async function migrate(ctx) {
  const metaPaths = await collectAgentSessionMetaPaths(ctx.agentsDir);
  let filesPatched = 0;
  let entriesPatched = 0;

  for (const metaPath of metaPaths) {
    const patched = await repairSessionMetaThinkingLevels(metaPath, ctx.log);
    if (patched > 0) {
      filesPatched++;
      entriesPatched += patched;
    }
  }

  ctx.log?.(`[migrations] #15: legacy session sidecars repaired (files=${filesPatched}, entries=${entriesPatched})`);
}

// ── 元数据路径收集 ─────────────────────────────────────────────────────────────────

async function collectAgentSessionMetaPaths(agentsDir) {
  const agentDirs = await scanAgentDirs(agentsDir);

  const out = [];
  for (const dir of agentDirs) {
    const metaPath = path.join(agentsDir, dir.name, "sessions", "session-meta.json");
    try {
      const stat = await fsp.stat(metaPath);
      if (stat.isFile()) out.push(metaPath);
    } catch {
      // Most agents will not have a sidecar before their first persisted session.
    }
  }
  return out;
}

// ── 修复逻辑 ──────────────────────────────────────────────────────────────────────

async function repairSessionMetaThinkingLevels(metaPath, log) {
  let raw;
  try {
    raw = await fsp.readFile(metaPath, "utf-8");
  } catch {
    return 0;
  }

  let meta;
  try {
    meta = JSON.parse(raw);
  } catch (err) {
    log?.(`[migrations] #15: skipped unreadable session-meta ${metaPath}: ${err.message}`);
    return 0;
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 0;

  let patched = 0;
  for (const [sessionFile, entry] of Object.entries(meta)) {
    if (!shouldRepairLegacyPromptSnapshotThinkingLevel(entry)) continue;
    const nextThinkingLevel = normalizeThinkingLevelForModel(entry.thinkingLevel, legacySessionMetaModelRef(entry));
    if (nextThinkingLevel === entry.thinkingLevel) continue;
    meta[sessionFile] = {
      ...entry,
      thinkingLevel: nextThinkingLevel,
    };
    patched++;
  }

  if (patched === 0) return 0;

  await backupSessionMetaBeforeV15(metaPath, raw, log);
  await atomicWriteJSON(metaPath, meta);
  return patched;
}

// ── 纯逻辑判断 ────────────────────────────────────────────────────────────────────

function shouldRepairLegacyPromptSnapshotThinkingLevel(entry) {
  return entry
    && typeof entry === "object"
    && !Array.isArray(entry)
    && entry.thinkingLevel === "xhigh"
    && entry.promptSnapshot
    && typeof entry.promptSnapshot === "object"
    && !Array.isArray(entry.promptSnapshot);
}

function legacySessionMetaModelRef(entry) {
  const legacyModel = entry?.model;
  if (legacyModel && typeof legacyModel === "object" && !Array.isArray(legacyModel)) {
    const id = typeof legacyModel.id === "string" ? legacyModel.id : "";
    if (id) {
      return {
        id,
        provider: typeof legacyModel.provider === "string" ? legacyModel.provider : undefined,
        xhigh: legacyModel.xhigh === true,
      };
    }
  }
  if (typeof legacyModel === "string" && legacyModel.trim()) {
    const raw = legacyModel.trim();
    const slash = raw.indexOf("/");
    if (slash > 0 && slash < raw.length - 1) {
      return { provider: raw.slice(0, slash), id: raw.slice(slash + 1) };
    }
    return { id: raw };
  }

  const id = typeof entry?.modelId === "string" ? entry.modelId : "";
  if (!id) return null;
  return {
    id,
    provider: typeof entry.modelProvider === "string" ? entry.modelProvider : undefined,
  };
}

// ── 备份 ──────────────────────────────────────────────────────────────────────────

async function backupSessionMetaBeforeV15(metaPath, raw, log) {
  const backupPath = `${metaPath}.pre-v15.bak`;
  try {
    await fsp.writeFile(backupPath, raw, { encoding: "utf-8", flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") return;
    log?.(`[migrations] #15: failed to write session-meta backup ${backupPath}: ${err.message}`);
    throw err;
  }
}
