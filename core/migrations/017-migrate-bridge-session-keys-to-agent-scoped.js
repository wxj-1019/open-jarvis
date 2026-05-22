/**
 * #17 — bridge sessionKey 补齐 agent 维度
 *
 * 旧格式：wx_dm_user / tg_dm_user
 * 新格式：wx_dm_user@hana / tg_dm_user@hana
 *
 * index 文件本身已经位于 per-agent 目录下，因此 agentId 的权威来源是目录名。
 * 微信 userId 可能自带 @（例如 openim），不能用 "包含 @" 判断是否已迁移，
 * 只能判断 key 是否以当前 owner agent 的 @agentId 结尾。
 */
import fsp from "fs/promises";
import path from "path";
import { SESSION_PREFIX_MAP } from "../../lib/bridge/session-key.js";
import { scanAgentDirs, fileExists, atomicWriteJSON } from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, log } = ctx;
  const agentDirs = await scanAgentDirs(agentsDir);

  let migrated = 0;
  let merged = 0;
  let collisions = 0;

  for (const dir of agentDirs) {
    const agentId = dir.name;
    const cfgPath = path.join(agentsDir, agentId, "config.yaml");
    if (!(await fileExists(cfgPath))) continue;

    const indexPath = path.join(agentsDir, agentId, "sessions", "bridge", "bridge-sessions.json");
    const result = await migrateOneBridgeSessionIndex(indexPath, agentId, log);
    migrated += result.migrated;
    merged += result.merged;
    collisions += result.collisions;
  }

  log?.(`[migrations] #17: bridge session keys scoped (migrated=${migrated}, merged=${merged}, collisions=${collisions})`);
}

// ── 单 index 文件迁移 ─────────────────────────────────────────────────────────────

async function migrateOneBridgeSessionIndex(indexPath, agentId, log) {
  let raw;
  try {
    raw = await fsp.readFile(indexPath, "utf-8");
  } catch {
    return { migrated: 0, merged: 0, collisions: 0 };
  }

  let index;
  try {
    index = JSON.parse(raw);
  } catch (err) {
    log?.(`[migrations] #17: skipped unreadable bridge index ${indexPath}: ${err.message}`);
    return { migrated: 0, merged: 0, collisions: 0 };
  }
  if (!index || typeof index !== "object" || Array.isArray(index)) {
    return { migrated: 0, merged: 0, collisions: 0 };
  }

  let changed = false;
  let migrated = 0;
  let merged = 0;
  let collisions = 0;

  for (const oldKey of Object.keys(index)) {
    const newKey = scopedBridgeSessionKey(oldKey, agentId);
    if (!newKey || newKey === oldKey) continue;

    const oldRaw = index[oldKey];
    const targetRaw = index[newKey];
    if (targetRaw === undefined) {
      index[newKey] = oldRaw;
      delete index[oldKey];
      migrated++;
      changed = true;
      continue;
    }

    const oldEntry = normalizeBridgeIndexEntryForMigration(oldRaw);
    const targetEntry = normalizeBridgeIndexEntryForMigration(targetRaw);
    if (oldEntry.file && targetEntry.file) {
      collisions++;
      continue;
    }

    index[newKey] = serializeBridgeIndexEntryForMigration(targetRaw, {
      ...oldEntry,
      ...targetEntry,
      file: targetEntry.file || oldEntry.file,
    });
    delete index[oldKey];
    merged++;
    changed = true;
  }

  if (changed) {
    await atomicWriteJSON(indexPath, index);
  }

  return { migrated, merged, collisions };
}

// ── Session key 工具 ──────────────────────────────────────────────────────────────

function scopedBridgeSessionKey(key, agentId) {
  if (!key || !agentId || String(key).endsWith(`@${agentId}`)) return null;
  if (!SESSION_PREFIX_MAP.some(([prefix]) => String(key).startsWith(prefix))) return null;
  return `${key}@${agentId}`;
}

function normalizeBridgeIndexEntryForMigration(raw) {
  if (!raw) return {};
  return typeof raw === "string" ? { file: raw } : { ...raw };
}

function serializeBridgeIndexEntryForMigration(previousRaw, entry) {
  if (typeof previousRaw === "string" && Object.keys(entry).length === 1 && typeof entry.file === "string") {
    return entry.file;
  }
  return entry;
}
