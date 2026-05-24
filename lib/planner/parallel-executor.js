/**
 * parallel-executor.js — DAG 并行步骤执行器
 *
 * 将 PlanExecutor 中 getExecutableSteps() 返回的所有就绪步骤
 * 通过 Promise.allSettled() 并发执行，替代原有的逐个串行模式。
 *
 * 注意：依赖排序由调用方（PlanExecutor.getExecutableSteps）保证，
 * 本执行器假设传入的所有步骤的依赖都已满足。
 *
 * 纯函数模块，不依赖 PlanExecutor 内部状态。
 */

import { StepStatus } from "./plan-schema.js";

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_SERIAL = 1;

/**
 * 并发执行多个就绪步骤
 *
 * @param {object[]} executableSteps - getExecutableSteps() 返回的就绪步骤数组
 * @param {(step: object, plan: object) => Promise<string>} executeStepFn - 单步执行函数
 * @param {object} options
 * @param {number} [options.concurrency=1] - 最大并发数（1=串行）
 * @param {object} [options.plan] - Plan 对象（传给 executeStepFn）
 * @param {(step: object) => void} [options.onProgress] - 单步完成回调
 * @param {AbortSignal} [options.signal] - 取消信号
 * @returns {Promise<void>} 所有步骤执行完毕后 resolve（不论成败）
 */
export async function executeParallel(executableSteps, executeStepFn, options = {}) {
  const {
    concurrency = DEFAULT_SERIAL,
    plan = null,
    onProgress = () => {},
    signal = null,
  } = options;

  if (!Array.isArray(executableSteps) || executableSteps.length === 0) {
    return;
  }

  const limit = Math.max(1, concurrency || 1);

  // 分批执行，每批最多 limit 个并发
  for (let i = 0; i < executableSteps.length; i += limit) {
    if (signal?.aborted) break;

    const batch = executableSteps.slice(i, i + limit);
    const tasks = batch.map((step) =>
      _executeOneStep(step, plan, executeStepFn, signal, onProgress),
    );

    await Promise.allSettled(tasks);
  }
}

// ── 单步执行包装 ──

/**
 * 执行单个步骤：设置状态 → 调用执行函数 → 更新结果
 * 内部使用，不直接抛出异常（已在内部 catch 并标记 FAILED）
 *
 * @param {object} step - 步骤对象（会被直接修改）
 * @param {object} plan
 * @param {(step: object, plan: object) => Promise<string>} executeStepFn
 * @param {AbortSignal|null} signal
 * @param {(step: object) => void} onProgress
 */
async function _executeOneStep(step, plan, executeStepFn, signal, onProgress) {
  step.status = StepStatus.IN_PROGRESS;

  try {
    if (signal?.aborted) {
      step.status = StepStatus.SKIPPED;
      step.error = "Cancelled by abort signal";
      onProgress(step);
      return;
    }

    const result = await executeStepFn(step, plan);
    step.result = result;
    step.status = StepStatus.COMPLETED;
    onProgress(step);
  } catch (err) {
    step.error = err.message || String(err);
    step.status = StepStatus.FAILED;
    onProgress(step);
  }
}
