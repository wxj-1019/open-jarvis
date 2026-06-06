/**
 * parallel-executor.test.js �?DAG 并行步骤执行器测�?
 *
 * 覆盖: executeParallel 核心逻辑、concurrency 限制、部分失败�?
 *       AbortSignal 取消、PlanExecutor 集成、向后兼�?
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeParallel } from "../../lib/planner/parallel-executor.js";
import { createPlan, StepStatus } from "../../lib/planner/plan-schema.js";
import { PlanExecutor } from "../../lib/planner/plan-executor.js";

// ============================================================================
// 1. executeParallel 核心逻辑
// ============================================================================

describe("executeParallel", () => {
  let steps;
  let plan;

  beforeEach(() => {
    plan = createPlan("test goal", [
      { id: "s0", content: "step 0" },
      { id: "s1", content: "step 1" },
      { id: "s2", content: "step 2" },
    ]);
    steps = plan.steps;
  });

  it("串行模式 (concurrency=1) 逐个执行", async () => {
    const fn = vi.fn(async (step) => {
      return `result: ${step.id}`;
    });

    await executeParallel(steps, fn, { concurrency: 1, plan });

    expect(fn).toHaveBeenCalledTimes(3);
    // 串行模式下所有步骤都应完�?
    for (const s of steps) {
      expect(s.status).toBe(StepStatus.COMPLETED);
      expect(s.result).toBe(`result: ${s.id}`);
    }
  });

  it("并行模式 (concurrency=3) 三个步骤同时执行", async () => {
    const order = [];
    const fn = vi.fn(async (step) => {
      order.push(step.id);
      // 每个步骤有不同延迟，确保并发
      await new Promise((r) => setTimeout(r, 10));
      return `result: ${step.id}`;
    });

    const start = Date.now();
    await executeParallel(steps, fn, { concurrency: 3, plan });
    const elapsed = Date.now() - start;

    expect(fn).toHaveBeenCalledTimes(3);
    // 并发执行总时间应小于 3*10=30ms（如果串行则需�?30ms+�?
    expect(elapsed).toBeLessThan(50);
    for (const s of steps) {
      expect(s.status).toBe(StepStatus.COMPLETED);
    }
  });

  it("concurrency 限制正确生效�?个步�?concurrency=2 分两批）", async () => {
    const inFlight = { count: 0, max: 0 };
    const fn = vi.fn(async () => {
      inFlight.count++;
      inFlight.max = Math.max(inFlight.max, inFlight.count);
      await new Promise((r) => setTimeout(r, 20));
      inFlight.count--;
      return "done";
    });

    await executeParallel(steps, fn, { concurrency: 2, plan });

    expect(inFlight.max).toBe(2); // 最多同�?2 个在执行
    for (const s of steps) {
      expect(s.status).toBe(StepStatus.COMPLETED);
    }
  });

  it("部分失败时其余继续执�?, async () => {
    const fn = vi.fn(async (step) => {
      if (step.id === "s1") throw new Error("step s1 failed");
      return `ok: ${step.id}`;
    });

    await executeParallel(steps, fn, { concurrency: 3, plan });

    expect(steps[0].status).toBe(StepStatus.COMPLETED);
    expect(steps[1].status).toBe(StepStatus.FAILED);
    expect(steps[1].error).toContain("step s1 failed");
    expect(steps[2].status).toBe(StepStatus.COMPLETED);
  });

  it("全部失败时所有步骤标�?FAILED", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });

    await executeParallel(steps, fn, { concurrency: 3, plan });

    for (const s of steps) {
      expect(s.status).toBe(StepStatus.FAILED);
      expect(s.error).toContain("boom");
    }
  });

  it("空步骤数组直接返�?, async () => {
    const fn = vi.fn();
    await executeParallel([], fn, { concurrency: 3, plan });
    expect(fn).not.toHaveBeenCalled();
  });

  it("非数组参数安全返�?, async () => {
    const fn = vi.fn();
    await executeParallel(null, fn, { concurrency: 3 });
    await executeParallel(undefined, fn, { concurrency: 3 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("执行前步骤状态设置为 IN_PROGRESS", async () => {
    const fn = vi.fn(async (step) => {
      // 在执行函数内部，check 自身和其他步骤的状�?
      expect(step.status).toBe(StepStatus.IN_PROGRESS);
      return "done";
    });

    await executeParallel([steps[0]], fn, { concurrency: 1, plan });
    expect(steps[0].status).toBe(StepStatus.COMPLETED);
  });

  it("onProgress 回调每个步骤完成后触�?, async () => {
    const progresses = [];
    const fn = vi.fn(async (step) => `result: ${step.id}`);

    await executeParallel(steps, fn, {
      concurrency: 3,
      plan,
      onProgress: (step) => progresses.push(step.id),
    });

    expect(progresses).toHaveLength(3);
    expect(progresses.sort()).toEqual(["s0", "s1", "s2"]);
  });

  it("AbortSignal 取消剩余批次", async () => {
    const controller = new AbortController();
    const fn = vi.fn(async (step) => {
      if (step.id === "s0") {
        controller.abort();
      }
      await new Promise((r) => setTimeout(r, 20));
      return "done";
    });

    // concurrency=1 分批执行：第一批完成后 signal �?abort
    await executeParallel(steps, fn, {
      concurrency: 1,
      plan,
      signal: controller.signal,
    });

    // s0 已执行，s1/s2 因并发限制在同一批也会执�?
    // 但第二批会检�?signal.aborted 并跳�?
    expect(fn).toHaveBeenCalledTimes(1); // 仅第一�?s0)执行
  });

  it("并发限制�?0 时自动提升到 1", async () => {
    const fn = vi.fn(async (step) => `result: ${step.id}`);

    await executeParallel(steps, fn, { concurrency: 0, plan });

    expect(fn).toHaveBeenCalled();
    for (const s of steps) {
      expect(s.status).toBe(StepStatus.COMPLETED);
    }
  });
});

// ============================================================================
// 2. PlanExecutor 集成 �?并行执行
// ============================================================================

describe("PlanExecutor 集成并行执行", () => {
  let executor;
  let mockExecuteIsolated;
  let mockStore;

  beforeEach(() => {
    mockStore = {
      resolve: vi.fn(),
      fail: vi.fn(),
      defer: vi.fn(),
    };

    mockExecuteIsolated = vi.fn();
  });

  function createExecutor(overrides = {}) {
    return new PlanExecutor({
      executeIsolated: mockExecuteIsolated,
      getDeferredStore: () => mockStore,
      emitEvent: vi.fn(),
      ...overrides,
    });
  }

  it("多步无依�?DAG 并行执行 (maxParallel=3)", async () => {
    // Decompose: 3 independent steps
    mockExecuteIsolated.mockResolvedValueOnce({
      replyText: JSON.stringify({
        steps: [
          { id: "step-0", content: "Task A", dependencies: [] },
          { id: "step-1", content: "Task B", dependencies: [] },
          { id: "step-2", content: "Task C", dependencies: [] },
        ],
      }),
    });

    // All 3 steps succeed
    mockExecuteIsolated
      .mockResolvedValueOnce({ replyText: "A done", stopReason: "stop" })
      .mockResolvedValueOnce({ replyText: "B done", stopReason: "stop" })
      .mockResolvedValueOnce({ replyText: "C done", stopReason: "stop" });

    executor = createExecutor({ maxParallel: 3 });
    const plan = await executor.execute("Three independent tasks");

    expect(plan.status).toBe(PlanExecutor.PlanStatus?.COMPLETED || "completed");
    expect(plan.steps).toHaveLength(3);
    for (const s of plan.steps) {
      expect(s.status).toBe(StepStatus.COMPLETED);
    }
    // 1 decompose + 3 steps = 4 calls
    expect(mockExecuteIsolated).toHaveBeenCalledTimes(4);
  });

  it("部分并行步骤失败触发重规�?, async () => {
    // Decompose: 2 independent steps
    mockExecuteIsolated.mockResolvedValueOnce({
      replyText: JSON.stringify({
        steps: [
          { id: "step-0", content: "Good step", dependencies: [] },
          { id: "step-1", content: "Bad step", dependencies: [] },
        ],
      }),
    });

    // Step 0 fails, Step 1 succeeds
    mockExecuteIsolated
      .mockResolvedValueOnce({ replyText: "", error: "Failed", stopReason: "error" }) // step-0
      .mockResolvedValueOnce({ replyText: "step-1 done", stopReason: "stop" }); // step-1

    // Re-plan
    mockExecuteIsolated.mockResolvedValueOnce({
      replyText: JSON.stringify({
        steps: [{ id: "step-r0", content: "Fix bad step", dependencies: [] }],
      }),
    });

    // Re-planned step succeeds
    mockExecuteIsolated.mockResolvedValueOnce({ replyText: "Fixed", stopReason: "stop" });

    executor = createExecutor({ maxParallel: 3 });
    const plan = await executor.execute("Mixed success/failure");

    expect(plan.steps.some((s) => s.status === StepStatus.FAILED)).toBe(true);
    expect(plan.steps.some((s) => s.id === "step-r0" && s.status === StepStatus.COMPLETED)).toBe(true);
    // decompose + step0 + step1 + replan + step-r0 = 5
    expect(mockExecuteIsolated).toHaveBeenCalledTimes(5);
  });

  it("向后兼容：maxParallel=1 串行行为不变", async () => {
    // Decompose: 2 steps with dependency
    mockExecuteIsolated.mockResolvedValueOnce({
      replyText: JSON.stringify({
        steps: [
          { id: "step-0", content: "First", dependencies: [] },
          { id: "step-1", content: "Second", dependencies: ["step-0"] },
        ],
      }),
    });

    mockExecuteIsolated
      .mockResolvedValueOnce({ replyText: "First done", stopReason: "stop" })
      .mockResolvedValueOnce({ replyText: "Second done", stopReason: "stop" });

    executor = createExecutor({ maxParallel: 1 }); // 默认串行
    const plan = await executor.execute("Serial test");

    expect(plan.steps[0].status).toBe(StepStatus.COMPLETED);
    expect(plan.steps[1].status).toBe(StepStatus.COMPLETED);
    // 单步依赖确保它们是串行执行的（step-1 依赖 step-0�?
    expect(mockExecuteIsolated).toHaveBeenCalledTimes(3);
  });

  it("execute() 参数 maxParallel 覆盖构造函数默认�?, async () => {
    mockExecuteIsolated.mockResolvedValueOnce({
      replyText: JSON.stringify({
        steps: [
          { id: "step-0", content: "Task", dependencies: [] },
        ],
      }),
    });
    mockExecuteIsolated.mockResolvedValueOnce({ replyText: "done", stopReason: "stop" });

    executor = createExecutor({ maxParallel: 1 }); // 构造函数默�?1
    const plan = await executor.execute("Test", { maxParallel: 5 });

    expect(plan.status).toBe(PlanExecutor.PlanStatus?.COMPLETED || "completed");
    // maxParallel �?params 覆盖�?5（不影响单步执行结果�?
  });
});

// ============================================================================
// 3. executeParallel �?PlanExecutor 上下文的独立测试
// ============================================================================

describe("executeParallel 独立边界测试", () => {
  it("DAG 拓扑分批发：依赖满足后逐步执行", async () => {
    const plan = createPlan("dag", [
      { id: "a", content: "A", dependencies: [] },
      { id: "b", content: "B", dependencies: [] },
      { id: "c", content: "C", dependencies: ["a", "b"] },
    ]);

    const execOrder = [];

    // 第一批：a, b 并行
    const batch1 = plan.steps.filter((s) => s.id === "a" || s.id === "b");
    await executeParallel(batch1, async (step) => {
      execOrder.push(step.id);
      return `done ${step.id}`;
    }, { concurrency: 3, plan });

    expect(plan.steps[0].status).toBe(StepStatus.COMPLETED); // a
    expect(plan.steps[1].status).toBe(StepStatus.COMPLETED); // b
    expect(plan.steps[2].status).toBe(StepStatus.PENDING); // c 未执�?

    // 第二批：c（依�?a,b 已完成）
    const batch2 = [plan.steps[2]];
    await executeParallel(batch2, async (step) => {
      execOrder.push(step.id);
      return `done ${step.id}`;
    }, { concurrency: 1, plan });

    expect(plan.steps[2].status).toBe(StepStatus.COMPLETED);
    expect(execOrder.join(",")).toBe("a,b,c");
  });
});
