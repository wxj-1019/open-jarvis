/**
 * #28 — subagent 子会话长期映射：把临时 deferred 队列里的历史事实迁入 durable registry
 */

import fsp from "fs/promises";
import path from "path";
import { SubagentRunStore } from "../../lib/subagent-run-store.js";
import { collectJsonlRecursive } from "./helpers.js";

// ── 同步纯逻辑工具 ──

/** 异步收集所有 agent 父会话 JSONL 路径 */
async function collectAgentParentSessionJsonlPaths(agentsDir) {
  let agents;
  try {
    agents = await fsp.readdir(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const agent of agents) {
    if (!agent.isDirectory()) continue;
    await collectJsonlRecursive(path.join(agentsDir, agent.name, "sessions"), out);
  }
  return out;
}

function mapSubagentRunStatus(streamStatus) {
  if (streamStatus === "done") return "resolved";
  if (streamStatus === "failed") return "failed";
  if (streamStatus === "aborted") return "aborted";
  return "pending";
}

function mapDeferredSubagentRunStatus(status) {
  if (status === "resolved") return "resolved";
  if (status === "failed") return "failed";
  if (status === "aborted") return "aborted";
  return "pending";
}

function summarizeDeferredSubagentTask(task) {
  if (typeof task?.result === "string" && task.result) return task.result;
  if (typeof task?.reason === "string" && task.reason) return task.reason;
  if (typeof task?.meta?.summary === "string" && task.meta.summary) return task.meta.summary;
  return null;
}

// ── 主迁移 ──

export async function migrate(ctx) {
  const { hanakoHome, agentsDir, log } = ctx;
  const store = new SubagentRunStore(path.join(hanakoHome, "subagent-runs.json"));
  let imported = 0;

  // ── 1. 从父会话 JSONL 提取 subagent 运行记录 ──
  for (const sessionPath of await collectAgentParentSessionJsonlPaths(agentsDir)) {
    let raw;
    try {
      raw = await fsp.readFile(sessionPath, "utf-8");
    } catch {
      continue;
    }

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = entry?.message;
      if (entry?.type !== "message" || msg?.role !== "toolResult" || msg?.toolName !== "subagent") continue;
      const details = msg.details || {};
      const taskId = typeof details.taskId === "string" ? details.taskId : null;
      const childSessionPath = typeof details.sessionPath === "string" && details.sessionPath ? details.sessionPath : null;
      if (!taskId || !childSessionPath) continue;

      store.upsert(taskId, {
        parentSessionPath: sessionPath,
        childSessionPath,
        status: mapSubagentRunStatus(details.streamStatus),
        summary: typeof details.summary === "string" && details.summary
          ? details.summary
          : (typeof details.taskTitle === "string" && details.taskTitle ? details.taskTitle : null),
        requestedAgentId: details.requestedAgentId || null,
        requestedAgentNameSnapshot: details.requestedAgentNameSnapshot || details.requestedAgentName || null,
        executorAgentId: details.executorAgentId || details.agentId || null,
        executorAgentNameSnapshot: details.executorAgentNameSnapshot || details.agentName || null,
        executorMetaVersion: details.executorMetaVersion || null,
      });
      imported++;
    }
  }

  // ── 2. 从 deferred-tasks.json 补充未完成的 subagent 运行 ──
  const deferredTasksPath = path.join(hanakoHome, ".ephemeral", "deferred-tasks.json");
  let deferredRaw;
  try {
    deferredRaw = await fsp.readFile(deferredTasksPath, "utf-8");
  } catch {
    deferredRaw = null;
  }

  if (deferredRaw) {
    try {
      const deferredTasks = JSON.parse(deferredRaw);
      for (const [taskId, task] of Object.entries(deferredTasks || {})) {
        if (task?.meta?.type !== "subagent") continue;
        const childSessionPath = typeof task.meta.sessionPath === "string" && task.meta.sessionPath
          ? task.meta.sessionPath
          : null;
        if (!childSessionPath) continue;

        store.upsert(taskId, {
          parentSessionPath: typeof task.sessionPath === "string" ? task.sessionPath : null,
          childSessionPath,
          status: mapDeferredSubagentRunStatus(task.status),
          summary: summarizeDeferredSubagentTask(task),
          reason: typeof task.reason === "string" ? task.reason : null,
          requestedAgentId: task.meta.requestedAgentId || null,
          requestedAgentNameSnapshot: task.meta.requestedAgentNameSnapshot || null,
          executorAgentId: task.meta.executorAgentId || null,
          executorAgentNameSnapshot: task.meta.executorAgentNameSnapshot || null,
          executorMetaVersion: task.meta.executorMetaVersion || null,
          createdAt: task.deferredAt ? new Date(task.deferredAt).toISOString() : null,
        });
        imported++;
      }
    } catch (err) {
      log?.(`[migrations] #28: deferred subagent run import skipped (${err.message})`);
    }
  }

  log?.(`[migrations] #28: durable subagent run registry backfilled (${imported})`);
}
