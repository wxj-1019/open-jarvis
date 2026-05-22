/**
 * #4 — subagent executor metadata 显式化，避免历史回放依赖目录推断
 *
 * 扫描所有 session JSONL 中的 subagent toolResult，显式写入 executor
 * metadata；同时为子会话补齐 sidecar 元数据，并修复 deferred-tasks.json
 * 中的执行者身份。
 */
import fsp from "fs/promises";
import path from "path";
import YAML from "js-yaml";
import {
  ensureDir,
  fileExists,
  readYAMLSafe,
  scanAgentDirs,
} from "./helpers.js";
import {
  getSubagentSessionMetaPath,
  mergeExecutorMetadata,
  normalizeExecutorMetadata,
  readSubagentSessionMetaSync,
} from "../../lib/subagent-executor-metadata.js";

export async function migrate(ctx) {
  const { agentsDir, hanakoHome, log } = ctx;
  const agentSnapshots = new Map();
  const childSessionCandidates = new Map();

  // ── 扫描 agent 目录（只包含有 config.yaml 的） ──
  const allDirs = await scanAgentDirs(agentsDir);
  const agentDirs = [];
  for (const d of allDirs) {
    if (await fileExists(path.join(agentsDir, d.name, "config.yaml"))) {
      agentDirs.push(d);
    }
  }

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = readYAMLSafe(cfgPath, YAML) || {};
    agentSnapshots.set(dir.name, cfg?.agent?.name || dir.name);
  }

  function ownerIdentityFor(agentId) {
    if (!agentId) return null;
    return normalizeExecutorMetadata({
      agentId,
      agentName: agentSnapshots.get(agentId) || agentId,
    });
  }

  function rememberChildSessionIdentity(sessionPath, identity, priority) {
    if (!sessionPath || !identity) return;
    const current = childSessionCandidates.get(sessionPath);
    if (!current || priority > current.priority) {
      childSessionCandidates.set(sessionPath, { identity, priority });
    }
  }

  function inferOwnerAgentId(sessionPath) {
    const rel = path.relative(agentsDir, sessionPath);
    if (rel.startsWith("..")) return null;
    return rel.split(path.sep)[0] || null;
  }

  // ── 遍历每个 agent 的主会话 JSONL ──
  for (const dir of agentDirs) {
    const agentId = dir.name;
    const sessionDir = path.join(agentsDir, agentId, "sessions");
    let sessionFiles = [];
    try {
      const names = await fsp.readdir(sessionDir);
      sessionFiles = names
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => path.join(sessionDir, name));
    } catch {
      sessionFiles = [];
    }

    for (const sessionFile of sessionFiles) {
      let changed = false;
      const outputLines = [];
      let raw = "";
      try {
        raw = await fsp.readFile(sessionFile, "utf-8");
      } catch {
        continue;
      }

      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;

        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          outputLines.push(line);
          continue;
        }

        const msg = entry?.message;
        if (entry?.type !== "message" || msg?.role !== "toolResult" || msg?.toolName !== "subagent" || !msg?.details) {
          outputLines.push(JSON.stringify(entry));
          continue;
        }

        const details = msg.details;
        const explicitIdentity = normalizeExecutorMetadata(details);
        const childSessionPath = details.sessionPath || null;
        const ownerIdentity = ownerIdentityFor(agentId);
        const inferredOwnerIdentity = childSessionPath
          ? ownerIdentityFor(inferOwnerAgentId(childSessionPath))
          : null;
        const identity = explicitIdentity || ownerIdentity || inferredOwnerIdentity;

        if (identity) {
          const before = JSON.stringify(details);
          mergeExecutorMetadata(details, identity);
          if (JSON.stringify(details) !== before) changed = true;
          if (childSessionPath) {
            rememberChildSessionIdentity(childSessionPath, identity, explicitIdentity ? 2 : 1);
          }
        }

        outputLines.push(JSON.stringify(entry));
      }

      if (changed) {
        await fsp.writeFile(sessionFile, outputLines.join("\n") + "\n", "utf-8");
        log(`[migrations] subagent executor metadata patched: ${sessionFile}`);
      }
    }
  }

  // ── 遍历每个 agent 的 subagent-sessions ──
  for (const dir of agentDirs) {
    const agentId = dir.name;
    const subagentDir = path.join(agentsDir, agentId, "subagent-sessions");
    let childFiles = [];
    try {
      const names = await fsp.readdir(subagentDir);
      childFiles = names
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => path.join(subagentDir, name));
    } catch {
      childFiles = [];
    }

    for (const childFile of childFiles) {
      if (!childSessionCandidates.has(childFile)) {
        const sessionMeta = readSubagentSessionMetaSync(childFile);
        const identity = sessionMeta || ownerIdentityFor(agentId);
        rememberChildSessionIdentity(childFile, identity, sessionMeta ? 3 : 0);
      }
    }
  }

  // ── 写入 sidecar 元数据 ──
  const sidecarWrites = new Map();
  for (const [childSessionPath, { identity }] of childSessionCandidates) {
    if (!identity) continue;
    const metaPath = getSubagentSessionMetaPath(childSessionPath);
    if (!metaPath) continue;
    let meta = sidecarWrites.get(metaPath);
    if (!meta) {
      try {
        const exists = await fileExists(metaPath);
        meta = exists
          ? JSON.parse(await fsp.readFile(metaPath, "utf-8"))
          : {};
      } catch {
        meta = {};
      }
      sidecarWrites.set(metaPath, meta);
    }

    const sessKey = path.basename(childSessionPath);
    meta[sessKey] = {
      ...meta[sessKey],
      ...identity,
    };
  }

  for (const [metaPath, meta] of sidecarWrites) {
    await ensureDir(path.dirname(metaPath));
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
    log(`[migrations] subagent session sidecar patched: ${metaPath}`);
  }

  // ── 修补 deferred-tasks.json ──
  const deferredTasksPath = path.join(hanakoHome, ".ephemeral", "deferred-tasks.json");
  try {
    if (!(await fileExists(deferredTasksPath))) return;
    const deferredTasks = JSON.parse(await fsp.readFile(deferredTasksPath, "utf-8"));
    let changed = false;
    for (const task of Object.values(deferredTasks)) {
      if (task?.meta?.type !== "subagent") continue;
      const sessionPath = task.meta.sessionPath || null;
      const candidate =
        normalizeExecutorMetadata(task.meta)
        || (sessionPath ? childSessionCandidates.get(sessionPath)?.identity || readSubagentSessionMetaSync(sessionPath) : null)
        || (sessionPath ? ownerIdentityFor(inferOwnerAgentId(sessionPath)) : null);
      if (!candidate) continue;
      const before = JSON.stringify(task.meta);
      mergeExecutorMetadata(task.meta, candidate);
      if (JSON.stringify(task.meta) !== before) changed = true;
    }
    if (changed) {
      await ensureDir(path.dirname(deferredTasksPath));
      await fsp.writeFile(deferredTasksPath, JSON.stringify(deferredTasks, null, 2) + "\n", "utf-8");
      log(`[migrations] subagent deferred metadata patched: ${deferredTasksPath}`);
    }
  } catch (err) {
    log(`[migrations] deferred task patch skipped: ${err.message}`);
  }
}
