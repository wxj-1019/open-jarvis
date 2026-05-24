/**
 * plan-executor.js — 多步自主规划执行器
 *
 * Plan-and-Execute 循环：
 *   Phase 1: LLM 分解目标为步骤（无工具轻量子 Agent）
 *   Phase 2: 按 DAG 拓扑序逐步执行（子 Agent 有完整工具集）
 *   Phase 3: 步骤失败 → LLM 重新规划剩余步骤（最多 3 次）
 *   Phase 4: 全部完成后落盘到 DeferredResultStore
 *
 * 依赖注入模式（对齐 subagent-tool.js），所有外部能力通过 deps 传入。
 */

import {
  createPlan,
  getExecutableSteps,
  isPlanFinished,
  formatPlanSummary,
  PlanStatus,
  StepStatus,
} from "./plan-schema.js";
import { executeParallel } from "./parallel-executor.js";

// 步骤执行时的工具白名单（对齐 subagent-tool.js）
const EXECUTE_CUSTOM_TOOLS = ["web_search", "web_fetch", "todo_write", "browser"];
const EXECUTE_BUILTIN_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"];

const STEP_TIMEOUT_MS = 15 * 60 * 1000;    // 每步 15 分钟
const DECOMPOSE_TIMEOUT_MS = 3 * 60 * 1000; // 分解/重规划 3 分钟
const MAX_STEPS_DEFAULT = 10;
const MAX_REPLAN_ATTEMPTS = 3;

// ── 分解 Prompt ──

function buildDecomposePrompt(goal, maxSteps) {
  return [
    `You are a planning assistant. Your task is to decompose a goal into sequential execution steps for a coding agent.`,
    ``,
    `GOAL: ${goal}`,
    ``,
    `Output ONLY the following JSON (no markdown fences, no explanation before or after):`,
    `{`,
    `  "steps": [`,
    `    {"id": "step-0", "content": "Description of the first action", "dependencies": []},`,
    `    {"id": "step-1", "content": "Description of the next action", "dependencies": ["step-0"]}`,
    `  ]`,
    `}`,
    ``,
    `RULES:`,
    `- Each step.id MUST be unique, numbered sequentially from "step-0"`,
    `- "content" is a clear, single-action description for a coding agent with file/shell access`,
    `- "dependencies" lists step ids that MUST be completed before this step can start`,
    `- Empty dependencies array means the step can run immediately`,
    `- Keep steps atomic — one clear, verifiable action per step`,
    `- Maximum ${maxSteps} steps in total`,
    `- Output ONLY the JSON object — no prefixes, no markdown fences, no trailing text`,
  ].join("\n");
}

// ── 步骤执行 Prompt ──

function buildStepPrompt(step, plan) {
  const completed = plan.steps
    .filter(s => s.status === StepStatus.COMPLETED && s.result)
    .map(s => `- ${s.id}: ${s.content}\n  Summary: ${(s.result || "").slice(0, 300)}`);

  const remaining = plan.steps
    .filter(s => s.status === StepStatus.PENDING)
    .map(s => `- ${s.id}: ${s.content}`);

  return [
    `Execute ONE step of a multi-step plan. Focus ONLY on your assigned step.`,
    ``,
    `OVERALL GOAL: ${plan.goal}`,
    ``,
    `YOUR STEP: ${step.content}`,
    ``,
    completed.length > 0 ? `PREVIOUSLY COMPLETED (for context only):\n${completed.join("\n")}` : "",
    remaining.length > 0 ? `\nUPCOMING STEPS (do NOT execute these):\n${remaining.join("\n")}` : "",
    ``,
    `Complete your step and report the result.`,
  ].filter(Boolean).join("\n");
}

// ── 重规划 Prompt ──

function buildReplanPrompt(plan, failedStep, maxNewSteps, attempt) {
  const completed = plan.steps
    .filter(s => s.status === StepStatus.COMPLETED)
    .map(s => `- ${s.id}: ${s.content} (DONE)`);

  const pending = plan.steps
    .filter(s => s.status === StepStatus.PENDING)
    .map(s => `- ${s.id}: ${s.content}`);

  return [
    `A step in the plan execution has FAILED. Adjust the REMAINING steps to still achieve the goal.`,
    ``,
    `ORIGINAL GOAL: ${plan.goal}`,
    ``,
    `FAILED STEP:`,
    `  ID: ${failedStep.id}`,
    `  Content: ${failedStep.content}`,
    `  Error: ${failedStep.error || "Unknown error"}`,
    ``,
    `ATTEMPT: ${attempt} of ${MAX_REPLAN_ATTEMPTS}`,
    ``,
    completed.length > 0 ? `COMPLETED STEPS:\n${completed.join("\n")}` : "",
    pending.length > 0 ? `\nREMAINING STEPS (not started, should be replaced):\n${pending.join("\n")}` : "",
    ``,
    `Output ONLY the following JSON with your adjusted remaining steps:`,
    `{`,
    `  "steps": [`,
    `    {"id": "step-N", "content": "...", "dependencies": [...]}`,
    `  ]`,
    `}`,
    ``,
    `RULES:`,
    `- Only include steps that still need to be executed (not completed/failed ones)`,
    `- You MAY add new steps to work around the failure`,
    `- You MAY reorder or merge steps`,
    `- Dependencies MUST reference only step ids in YOUR output list`,
    `- Maximum ${maxNewSteps} additional steps`,
    `- Output ONLY the JSON object`,
  ].join("\n");
}

// ── PlanExecutor ──

export class PlanExecutor {
  /**
   * @param {object} deps
   * @param {(prompt: string, opts: object) => Promise<object>} deps.executeIsolated
   * @param {() => import("../../lib/deferred-result-store.js").DeferredResultStore|null} deps.getDeferredStore
   * @param {(event: object, sessionPath?: string|null) => void} [deps.emitEvent]
   * @param {number} [deps.maxParallel=1] - 最大并行子Agent数（1=串行，默认向后兼容）
   */
  constructor(deps) {
    this._deps = deps;
    this._maxParallel = deps.maxParallel || 1;
  }

  /**
   * 执行完整规划循环
   * @param {string} goal - 目标描述
   * @param {object} [params]
   * @param {string} [params.taskId] - DeferredResultStore 任务 ID
   * @param {string} [params.parentSessionPath] - 父会话路径
   * @param {string} [params.cwd] - 工作目录
   * @param {string} [params.agentId] - 目标 Agent ID（步骤将派发给此 Agent）
   * @param {string} [params.persistDir] - 子会话持久化目录
   * @param {number} [params.maxSteps] - 最大步骤数
   * @returns {Promise<object>} 最终 Plan 对象
   */
  async execute(goal, params = {}) {
    const maxSteps = Math.min(params.maxSteps || MAX_STEPS_DEFAULT, 20);
    const maxParallel = Math.max(1, params.maxParallel || this._maxParallel || 1);
    const taskId = params.taskId || `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const parentSessionPath = params.parentSessionPath || null;

    try {
      // ===== Phase 1: Decompose =====
      let steps;
      try {
        steps = await this._decomposeGoal(goal, maxSteps, params);
      } catch (decomposeErr) {
        // 分解失败时退化为单步计划
        steps = [{ id: "step-0", content: goal, dependencies: [] }];
      }

      const plan = createPlan(goal, steps);
      plan.status = PlanStatus.RUNNING;
      this._emitProgress(plan, taskId, parentSessionPath);

      // ===== Phase 2: Execute loop (DAG 并行) =====
      let replanCount = 0;

      while (!isPlanFinished(plan)) {
        const executable = getExecutableSteps(plan);

        if (executable.length === 0) {
          // 死锁检查：有计划中步骤但无法执行（依赖失败）
          const stuckSteps = plan.steps.filter(s => s.status === StepStatus.PENDING);
          if (stuckSteps.length > 0) {
            const blockedByFailed = stuckSteps.filter(s =>
              (s.dependencies || []).some(depId => {
                const dep = plan.steps.find(ps => ps.id === depId);
                return dep && dep.status === StepStatus.FAILED;
              })
            );
            for (const s of blockedByFailed) {
              s.status = StepStatus.SKIPPED;
              s.error = "Blocked by failed dependency";
            }
            // 如果所有阻塞的都被标记了，但还有 pending（循环依赖等），也标记跳过
            const stillStuck = plan.steps.filter(s => s.status === StepStatus.PENDING);
            for (const s of stillStuck) {
              s.status = StepStatus.SKIPPED;
              s.error = "Cannot execute: dependency deadlock";
            }
            continue;
          }
          break;
        }

        // 并行执行所有就绪步骤
        await executeParallel(executable, (step) => this._executeStep(step, plan, params), {
          concurrency: maxParallel,
          plan,
          onProgress: () => this._emitProgress(plan, taskId, parentSessionPath),
        });

        // 检查是否有步骤失败，触发重规划
        const failedInBatch = executable.filter(s => s.status === StepStatus.FAILED);
        if (failedInBatch.length > 0 && replanCount < MAX_REPLAN_ATTEMPTS) {
          // 每轮重规划只计数一次，而非每个失败步骤计数
          replanCount++;
          const failedStep = failedInBatch[0]; // 仅重规划第一个失败步骤
          try {
            const remainingCount = plan.steps.filter(
              s => s.status === StepStatus.PENDING
            ).length;
            const maxNew = Math.max(maxSteps - plan.steps.filter(
              s => s.status !== StepStatus.PENDING
            ).length, 1);
            const adjustedSteps = await this._replan(plan, failedStep, maxNew, replanCount, params);
            this._mergeReplanSteps(plan, adjustedSteps);
          } catch (_replanErr) {
            // 重规划失败，跳过剩余步骤
            for (const s of plan.steps) {
              if (s.status === StepStatus.PENDING) {
                s.status = StepStatus.SKIPPED;
                s.error = "Re-plan failed";
              }
            }
          }
        } else if (failedInBatch.length > 0) {
          // 超出重规划次数
          for (const s of plan.steps) {
            if (s.status === StepStatus.PENDING) {
              s.status = StepStatus.SKIPPED;
              s.error = `Max replan attempts (${MAX_REPLAN_ATTEMPTS}) exceeded`;
            }
          }
        }
      }

      // ===== Phase 4: Finalize =====
      plan.completedAt = Date.now();
      plan.status = plan.steps.some(s => s.status === StepStatus.FAILED)
        ? PlanStatus.FAILED
        : PlanStatus.COMPLETED;

      this._finalize(plan, taskId, parentSessionPath);
      return plan;

    } catch (fatalErr) {
      // 灾难性失败（如 executeIsolated 不可用）
      const store = this._deps.getDeferredStore?.();
      store?.fail?.(taskId, fatalErr.message || String(fatalErr));
      throw fatalErr;
    }
  }

  // ── 内部分解 ──

  async _decomposeGoal(goal, maxSteps, params) {
    const prompt = buildDecomposePrompt(goal, maxSteps);
    const signal = AbortSignal.timeout(DECOMPOSE_TIMEOUT_MS);

    const result = await this._deps.executeIsolated(prompt, {
      builtinFilter: [],
      toolFilter: [],
      parentSessionPath: params.parentSessionPath,
      cwd: params.cwd,
      signal,
      persist: params.persistDir || undefined,
    });

    const text = result?.replyText || result?.text || "";
    return this._parsePlanSteps(text, maxSteps);
  }

  // ── 步䦥执行 ──

  async _executeStep(step, plan, params) {
    const prompt = buildStepPrompt(step, plan);
    const signal = AbortSignal.timeout(STEP_TIMEOUT_MS);
    if (signal.unref) signal.unref();

    const result = await this._deps.executeIsolated(prompt, {
      agentId: params.agentId,
      cwd: params.cwd,
      parentSessionPath: params.parentSessionPath,
      subagentContext: true,
      emitEvents: true,
      toolFilter: EXECUTE_CUSTOM_TOOLS,
      builtinFilter: EXECUTE_BUILTIN_TOOLS,
      signal,
      persist: params.persistDir || undefined,
    });

    if (result?.error) {
      throw new Error(result.error);
    }

    const stopReason = result?.stopReason;
    if (stopReason && stopReason !== "stop" && stopReason !== "end_turn") {
      throw new Error(`Step execution stopped with reason: ${stopReason}`);
    }

    return result?.replyText || result?.text || "";
  }

  // ── 重规划 ──

  async _replan(plan, failedStep, maxNewSteps, attempt, params) {
    const prompt = buildReplanPrompt(plan, failedStep, maxNewSteps, attempt);
    const signal = AbortSignal.timeout(DECOMPOSE_TIMEOUT_MS);

    const result = await this._deps.executeIsolated(prompt, {
      builtinFilter: [],
      toolFilter: [],
      parentSessionPath: params.parentSessionPath,
      cwd: params.cwd,
      signal,
      persist: params.persistDir || undefined,
    });

    const text = result?.replyText || result?.text || "";
    return this._parsePlanSteps(text, maxNewSteps);
  }

  // ── JSON 解析 ──

  /**
   * 从 LLM 文本响应中提取步骤数组
   */
  _parsePlanSteps(text, maxSteps) {
    let jsonStr = (text || "").trim();

    // 1. 尝试从 markdown 代码块中提取
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    // 2. 尝试定位 JSON 对象
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      // 3. 最后尝试：逐行扫描 JSON 模式
      const lines = (text || "").split(/\r?\n/);
      const jsonLines = [];
      let inJson = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) inJson = true;
        if (inJson) jsonLines.push(line);
        if ((trimmed.endsWith("}") || trimmed.endsWith("]")) && inJson && jsonLines.length > 1) {
          break;
        }
      }
      if (jsonLines.length > 0) {
        try {
          parsed = JSON.parse(jsonLines.join("\n"));
        } catch (_) {
          throw new Error("Failed to parse decomposition JSON from LLM response");
        }
      } else {
        throw new Error("No valid JSON found in decomposition response");
      }
    }

    if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error("Decomposition returned no valid steps array");
    }

    return parsed.steps.slice(0, maxSteps).map((s, i) => ({
      id: s.id || `step-${i}`,
      content: String(s.content || ""),
      dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
    }));
  }

  // ── 重规划步骤合并 ──

  _mergeReplanSteps(plan, adjustedSteps) {
    // 移除所有 PENDING 状态的步骤
    plan.steps = plan.steps.filter(s => s.status !== StepStatus.PENDING);

    // 追加调整后的步骤
    let nextIdx = plan.steps.length;
    for (const s of adjustedSteps) {
      plan.steps.push({
        id: s.id || `step-${nextIdx}`,
        content: String(s.content || ""),
        status: StepStatus.PENDING,
        dependencies: (s.dependencies || []).map(d => {
          // 尝试映射到已存在步骤的 ID
          const found = plan.steps.find(ps => ps.id === d);
          if (!found) {
            // 依赖不存在，记录警告并跳过该依赖
            log?.warn?.(`Re-plan step depends on non-existent ID: ${d}, skipping dependency`);
            return null;
          }
          return found.id;
        }).filter(Boolean), // 移除 null 依赖
        result: null,
        error: null,
      });
      nextIdx++;
    }
  }

  // ── 进度发射 ──

  _emitProgress(plan, taskId, parentSessionPath) {
    this._deps.emitEvent?.({
      type: "block_update",
      taskId,
      patch: {
        summary: formatPlanSummary(plan).slice(0, 500),
        streamStatus: "running",
        details: {
          goal: plan.goal,
          status: plan.status,
          steps: plan.steps.map(s => ({
            id: s.id,
            content: s.content,
            status: s.status,
            result: s.result ? s.result.slice(0, 200) : null,
            error: s.error,
          })),
        },
      },
    }, parentSessionPath);
  }

  // ── 终结落盘 ──

  _finalize(plan, taskId, parentSessionPath) {
    const summary = formatPlanSummary(plan);
    const store = this._deps.getDeferredStore?.();

    if (plan.status === PlanStatus.COMPLETED) {
      store?.resolve?.(taskId, summary);
    } else {
      const failedSteps = plan.steps.filter(s => s.status === StepStatus.FAILED);
      const reason = failedSteps.length > 0
        ? failedSteps.map(s => `${s.id}: ${s.error || "failed"}`).join("; ")
        : "Plan did not complete successfully";
      store?.fail?.(taskId, reason);
    }

    this._deps.emitEvent?.({
      type: "block_update",
      taskId,
      patch: {
        summary: summary.slice(0, 500),
        streamStatus: plan.status === PlanStatus.COMPLETED ? "done" : "failed",
        details: {
          goal: plan.goal,
          status: plan.status,
          steps: plan.steps.map(s => ({
            id: s.id,
            content: s.content.slice(0, 100),
            status: s.status,
            hasResult: !!s.result,
            error: s.error,
          })),
        },
      },
    }, parentSessionPath);
  }
}
