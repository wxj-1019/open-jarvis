/**
 * plan-execute-tool.js — plan_execute Agent 工具
 *
 * 让 Agent 能主动调用计划执行：
 *   Agent 传入目标描述 → 工具立即返回 taskId（fire-and-forget）
 *   → 后台 PlanExecutor 编排执行 → 结果写入 DeferredResultStore
 *
 * 对齐 subagent-tool.js 的模式：fire-and-forget + DeferredResultStore + emitEvent 进度通知。
 */

import { Type } from "../pi-sdk/index.js";
import { PlanExecutor } from "./plan-executor.js";
import { formatPlanSummary } from "./plan-schema.js";

/**
 * @param {object} deps
 * @param {(prompt: string, opts: object) => Promise<object>} deps.executeIsolated
 * @param {() => import("../deferred-result-store.js").DeferredResultStore|null} deps.getDeferredStore
 * @param {() => string|null} deps.getSessionPath
 * @param {(event: object, sessionPath?: string|null) => void} [deps.emitEvent]
 * @param {string} [deps.agentDir]
 * @param {() => string|null} [deps.getParentCwd]
 * @param {string} [deps.currentAgentId]
 */
export function createPlanExecuteTool(deps) {
  // 并发计数器（对齐 subagent-tool.js 的 per-session concurrency）
  const activeBySession = new Map();
  const MAX_PER_SESSION = 4;  // plan_execute 本身开销大，限制比 subagent 更严

  function incActive(sp) {
    activeBySession.set(sp, (activeBySession.get(sp) || 0) + 1);
  }
  function decActive(sp) {
    const n = (activeBySession.get(sp) || 1) - 1;
    if (n <= 0) activeBySession.delete(sp);
    else activeBySession.set(sp, n);
  }

  return {
    name: "plan_execute",
    label: "Plan Execute",
    description:
      "Decompose a complex goal into sequential steps and execute them autonomously " +
      "using sub-agents. For multi-step, multi-file, long-running tasks. " +
      "Each step runs as an isolated sub-agent with file/shell/web access. " +
      "Results are delivered asynchronously. Use this instead of manual todo_write " +
      "for goals requiring automated orchestration.",
    parameters: Type.Object({
      goal: Type.String({
        minLength: 1,
        description:
          "The goal to achieve. A complete description of what needs to be done. " +
          "Example: 'Create a React dashboard with charts and API integration'",
      }),
      model: Type.String({
        description:
          "Optional model to use for step execution sub-agents. " +
          "If not specified, uses the current agent's default model.",
      }),
      maxSteps: Type.Number({
        description:
          "Maximum number of steps allowed in the plan (default 10, max 20). " +
          "Limits decomposition to prevent runaway plans.",
      }),
      maxParallel: Type.Number({
        description:
          "Maximum parallel sub-agents (1=serial, default 3). " +
          "Higher values speed up independent steps but consume more resources.",
      }),
    }),

    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const goal = String(params.goal || "").trim();
      if (!goal) {
        return {
          content: [{ type: "text", text: "Error: goal is required and must not be empty." }],
        };
      }

      const parentSessionPath = deps.getSessionPath?.() || null;
      const parentCwd = deps.getParentCwd?.() || undefined;

      // 并发检查
      const active = activeBySession.get(parentSessionPath) || 0;
      if (active >= MAX_PER_SESSION) {
        return {
          content: [{
            type: "text",
            text: `Cannot start plan_execute: max concurrent plans (${MAX_PER_SESSION}) reached for this session. ` +
                  "Wait for existing plans to complete or cancel them.",
          }],
        };
      }

      const store = deps.getDeferredStore?.();
      if (!store) {
        // DeferredResultStore 不可用时，同步退化为单步子 Agent（对齐 subagent-tool.js 的 fallback）
        return _syncFallback(deps, goal, parentCwd, parentSessionPath);
      }

      const taskId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const taskTitle = goal.slice(0, 80);

      // 在 DeferredResultStore 中注册占位
      store.defer(taskId, {
        sessionPath: parentSessionPath,
        meta: {
          type: "plan_execute",
          goal,
          taskTitle,
          parentSessionPath,
          createdAt: Date.now(),
        },
      });

      incActive(parentSessionPath);

      // 在后台启动 PlanExecutor
      const executor = new PlanExecutor({
        executeIsolated: deps.executeIsolated,
        getDeferredStore: deps.getDeferredStore,
        emitEvent: deps.emitEvent,
      });

      executor.execute(goal, {
        taskId,
        parentSessionPath,
        cwd: parentCwd,
        agentId: deps.currentAgentId,
        maxSteps: params.maxSteps,
        maxParallel: params.maxParallel,
        persistDir: deps.agentDir
          ? `${deps.agentDir}/plan-sessions`
          : undefined,
      }).then((plan) => {
        // executor 内部已通过 _finalize → getDeferredStore().resolve/fail 落盘
        // 这里发送最终状态通知
        const summary = formatPlanSummary(plan);
        deps.emitEvent?.({
          type: "block_update",
          taskId,
          patch: {
            streamStatus: "done",
            summary: summary.slice(0, 500),
            details: { taskId, goal, status: plan.status },
          },
        }, parentSessionPath);
      }).catch((err) => {
        store.fail(taskId, err.message || String(err));
        deps.emitEvent?.({
          type: "block_update",
          taskId,
          patch: {
            streamStatus: "failed",
            summary: `Plan execution failed: ${err.message || String(err)}`,
          },
        }, parentSessionPath);
      }).finally(() => {
        decActive(parentSessionPath);
      });

      return {
        content: [{
          type: "text",
          text: `Plan execution started.\n\n` +
                `Task ID: ${taskId}\n` +
                `Goal: ${goal}\n` +
                `Status: running\n\n` +
                `The plan will be decomposed into steps and executed autonomously. ` +
                `Results will be delivered when all steps complete. ` +
                `You can continue with other tasks in the meantime.`,
        }],
        details: {
          taskId,
          goal,
          status: "running",
        },
      };
    },
  };
}

/**
 * DeferredResultStore 不可用时的同步降级：
 * 用单步子 Agent 直接执行目标，不分解、不编排。
 */
async function _syncFallback(deps, goal, parentCwd, parentSessionPath) {
  try {
    const result = await deps.executeIsolated(goal, {
      agentId: deps.currentAgentId,
      cwd: parentCwd || undefined,
      parentSessionPath: parentSessionPath || null,
      subagentContext: true,
      emitEvents: false,
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });

    const text = result?.replyText || result?.text || "";
    if (result?.error) {
      return {
        content: [{ type: "text", text: `Plan execution failed: ${result.error}` }],
      };
    }
    return {
      content: [{ type: "text", text: text || "Plan executed (no output)." }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `Plan execution failed: ${err.message || String(err)}`,
      }],
    };
  }
}
