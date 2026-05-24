/**
 * plan-schema.js — 多步自主规划数据模型
 *
 * 定义 Plan 和 Step 的数据结构、状态机、验证函数和辅助工具。
 * 纯函数，无副作用，可被 PlanExecutor 和前端共用。
 */

/**
 * Plan 状态常量
 * pending → running → completed | failed
 */
export const PlanStatus = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
});

/**
 * Step 状态常量
 * pending → in_progress → completed | failed | skipped
 */
export const StepStatus = Object.freeze({
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
});

const VALID_PLAN_STATUSES = new Set(Object.values(PlanStatus));
const VALID_STEP_STATUSES = new Set(Object.values(StepStatus));

/**
 * 创建一个新的 Plan 实例
 * @param {string} goal - 目标描述
 * @param {Array<{id: string, content: string, dependencies?: string[]}>} steps - 步骤列表
 * @returns {object} Plan 对象
 */
export function createPlan(goal, steps = []) {
  const now = Date.now();
  return {
    goal: String(goal || ""),
    steps: steps.map((s, i) => ({
      id: s.id || `step-${i}`,
      content: String(s.content || ""),
      status: StepStatus.PENDING,
      dependencies: Array.isArray(s.dependencies) ? [...s.dependencies] : [],
      result: null,
      error: null,
    })),
    status: PlanStatus.PENDING,
    createdAt: now,
    completedAt: null,
  };
}

/**
 * 验证 Plan 对象的结构完整性
 * @param {object} plan
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== "object") {
    return { valid: false, errors: ["plan must be an object"] };
  }

  if (typeof plan.goal !== "string" || !plan.goal.trim()) {
    errors.push("plan.goal must be a non-empty string");
  }

  if (!Array.isArray(plan.steps)) {
    errors.push("plan.steps must be an array");
  } else if (plan.steps.length === 0) {
    errors.push("plan.steps must have at least one step");
  } else {
    const stepIds = new Set();
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const prefix = `plan.steps[${i}]`;

      if (!step || typeof step !== "object") {
        errors.push(`${prefix} must be an object`);
        continue;
      }

      if (typeof step.id !== "string" || !step.id.trim()) {
        errors.push(`${prefix}.id must be a non-empty string`);
      } else if (stepIds.has(step.id)) {
        errors.push(`${prefix}.id "${step.id}" is duplicated`);
      } else {
        stepIds.add(step.id);
      }

      if (typeof step.content !== "string" || !step.content.trim()) {
        errors.push(`${prefix}.content must be a non-empty string`);
      }

      if (!VALID_STEP_STATUSES.has(step.status)) {
        errors.push(`${prefix}.status "${step.status}" is invalid; must be one of: ${[...VALID_STEP_STATUSES].join(", ")}`);
      }

      if (!Array.isArray(step.dependencies)) {
        errors.push(`${prefix}.dependencies must be an array`);
      }
    }

    // 验证依赖引用是否存在
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      for (const depId of (step.dependencies || [])) {
        if (!stepIds.has(depId)) {
          errors.push(`plan.steps[${i}].dependencies references unknown step "${depId}"`);
        }
      }
    }
  }

  if (plan.status && !VALID_PLAN_STATUSES.has(plan.status)) {
    errors.push(`plan.status "${plan.status}" is invalid; must be one of: ${[...VALID_PLAN_STATUSES].join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 获取当前可执行的步骤（所有前置依赖均已完成）
 * @param {object} plan
 * @returns {object[]} 可执行步骤列表
 */
export function getExecutableSteps(plan) {
  if (!plan || !Array.isArray(plan.steps)) return [];

  const completedIds = new Set(
    plan.steps
      .filter(s => s.status === StepStatus.COMPLETED || s.status === StepStatus.SKIPPED)
      .map(s => s.id)
  );

  return plan.steps.filter(s => {
    if (s.status !== StepStatus.PENDING) return false;
    // 所有依赖都已完成或跳过
    return (s.dependencies || []).every(depId => completedIds.has(depId));
  });
}

/**
 * 判断 Plan 是否所有步骤都处于终态
 * @param {object} plan
 * @returns {boolean}
 */
export function isPlanFinished(plan) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return false;
  return plan.steps.every(s =>
    s.status === StepStatus.COMPLETED ||
    s.status === StepStatus.FAILED ||
    s.status === StepStatus.SKIPPED
  );
}

/**
 * 计算 Plan 进度摘要
 * @param {object} plan
 * @returns {{ total: number, completed: number, failed: number, pending: number, inProgress: number, skipped: number }}
 */
export function getPlanProgress(plan) {
  const counts = { total: 0, completed: 0, failed: 0, pending: 0, inProgress: 0, skipped: 0 };
  if (!plan || !Array.isArray(plan.steps)) return counts;

  counts.total = plan.steps.length;
  for (const s of plan.steps) {
    switch (s.status) {
      case StepStatus.COMPLETED: counts.completed++; break;
      case StepStatus.FAILED: counts.failed++; break;
      case StepStatus.PENDING: counts.pending++; break;
      case StepStatus.IN_PROGRESS: counts.inProgress++; break;
      case StepStatus.SKIPPED: counts.skipped++; break;
    }
  }
  return counts;
}

/**
 * 将 Plan 格式化为人类可读的文本摘要
 * @param {object} plan
 * @param {boolean} [isZh=true] - 是否中文
 * @returns {string}
 */
export function formatPlanSummary(plan, isZh = true) {
  if (!plan) return isZh ? "无计划" : "No plan";

  const progress = getPlanProgress(plan);
  const lines = [];

  lines.push(isZh
    ? `目标: ${plan.goal}`
    : `Goal: ${plan.goal}`);

  const statusLabel = {
    [PlanStatus.PENDING]: isZh ? "待执行" : "Pending",
    [PlanStatus.RUNNING]: isZh ? "执行中" : "Running",
    [PlanStatus.COMPLETED]: isZh ? "已完成" : "Completed",
    [PlanStatus.FAILED]: isZh ? "已失败" : "Failed",
  };
  lines.push(isZh
    ? `状态: ${statusLabel[plan.status] || plan.status} | 进度: ${progress.completed}/${progress.total}`
    : `Status: ${statusLabel[plan.status] || plan.status} | Progress: ${progress.completed}/${progress.total}`);

  for (const step of plan.steps) {
    const statusIcon = {
      [StepStatus.PENDING]: isZh ? "⏳" : "⏳",
      [StepStatus.IN_PROGRESS]: isZh ? "🔄" : "🔄",
      [StepStatus.COMPLETED]: isZh ? "✅" : "✅",
      [StepStatus.FAILED]: isZh ? "❌" : "❌",
      [StepStatus.SKIPPED]: isZh ? "⏭️" : "⏭️",
    };
    lines.push(`  ${statusIcon[step.status] || "  "} ${step.id}: ${step.content}`);
  }

  return lines.join("\n");
}
