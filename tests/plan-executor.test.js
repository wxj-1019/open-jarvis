/**
 * plan-executor.test.js — 多步自主规划测试
 *
 * 覆盖: plan-schema 数据模型验证 + PlanExecutor 编排循环 + plan_execute 工具
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlan,
  validatePlan,
  getExecutableSteps,
  isPlanFinished,
  getPlanProgress,
  formatPlanSummary,
  PlanStatus,
  StepStatus,
} from "../lib/planner/plan-schema.js";
import { PlanExecutor } from "../lib/planner/plan-executor.js";
import { createPlanExecuteTool } from "../lib/planner/plan-execute-tool.js";

// ============================================================================
// 1. Plan Schema 数据模型
// ============================================================================

describe("Plan Schema", () => {
  describe("createPlan", () => {
    it("创建有效的 Plan 对象", () => {
      const plan = createPlan("test goal", [
        { id: "step-0", content: "do A", dependencies: [] },
        { id: "step-1", content: "do B", dependencies: ["step-0"] },
      ]);

      expect(plan.goal).toBe("test goal");
      expect(plan.steps).toHaveLength(2);
      expect(plan.status).toBe(PlanStatus.PENDING);
      expect(plan.createdAt).toBeTypeOf("number");
      expect(plan.completedAt).toBeNull();
    });

    it("自动分配缺失的 step id", () => {
      const plan = createPlan("goal", [
        { content: "step 1" },
        { content: "step 2" },
      ]);

      expect(plan.steps[0].id).toBe("step-0");
      expect(plan.steps[1].id).toBe("step-1");
    });

    it("所有步骤初始状态为 PENDING", () => {
      const plan = createPlan("goal", [
        { id: "s1", content: "a" },
        { id: "s2", content: "b" },
      ]);

      for (const step of plan.steps) {
        expect(step.status).toBe(StepStatus.PENDING);
        expect(step.result).toBeNull();
        expect(step.error).toBeNull();
      }
    });
  });

  describe("validatePlan", () => {
    it("有效 plan 通过验证", () => {
      const plan = createPlan("test", [
        { id: "step-0", content: "do it" },
      ]);
      const result = validatePlan(plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("非 object 参数报错", () => {
      const result = validatePlan(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("plan must be an object");
    });

    it("空 goal 报错", () => {
      const plan = createPlan("", [{ id: "s0", content: "x" }]);
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("goal"))).toBe(true);
    });

    it("无 steps 报错", () => {
      const plan = { goal: "x", steps: [], status: "pending" };
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("steps"))).toBe(true);
    });

    it("重复 step id 报错", () => {
      const plan = createPlan("goal", [
        { id: "dup", content: "a" },
        { id: "dup", content: "b" },
      ]);
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("duplicated"))).toBe(true);
    });

    it("无效 status 报错", () => {
      const plan = createPlan("goal", [{ id: "s0", content: "x" }]);
      plan.status = "invalid_status";
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
    });

    it("未知依赖引用报错", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a", dependencies: ["nonexistent"] },
      ]);
      const result = validatePlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("unknown step"))).toBe(true);
    });
  });

  describe("getExecutableSteps", () => {
    it("无依赖步骤全部可执行", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a" },
        { id: "s1", content: "b" },
        { id: "s2", content: "c" },
      ]);

      const executable = getExecutableSteps(plan);
      expect(executable).toHaveLength(3);
    });

    it("有依赖时只返回就绪步骤", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a", dependencies: [] },
        { id: "s1", content: "b", dependencies: ["s0"] },
        { id: "s2", content: "c", dependencies: ["s0", "s1"] },
      ]);

      const executable = getExecutableSteps(plan);
      expect(executable).toHaveLength(1);
      expect(executable[0].id).toBe("s0");
    });

    it("依赖完成后下一步可执行", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a", dependencies: [] },
        { id: "s1", content: "b", dependencies: ["s0"] },
      ]);

      plan.steps[0].status = StepStatus.COMPLETED;

      const executable = getExecutableSteps(plan);
      expect(executable).toHaveLength(1);
      expect(executable[0].id).toBe("s1");
    });

    it("依赖跳过也解锁下一步", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a", dependencies: [] },
        { id: "s1", content: "b", dependencies: ["s0"] },
      ]);

      plan.steps[0].status = StepStatus.SKIPPED;

      const executable = getExecutableSteps(plan);
      expect(executable).toHaveLength(1);
      expect(executable[0].id).toBe("s1");
    });

    it("依赖失败不解锁下一步", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a", dependencies: [] },
        { id: "s1", content: "b", dependencies: ["s0"] },
      ]);

      plan.steps[0].status = StepStatus.FAILED;

      const executable = getExecutableSteps(plan);
      expect(executable).toHaveLength(0);
    });

    it("进行中和已完成的步骤不返回", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a" },
        { id: "s1", content: "b" },
        { id: "s2", content: "c" },
      ]);

      plan.steps[0].status = StepStatus.IN_PROGRESS;
      plan.steps[1].status = StepStatus.COMPLETED;

      const executable = getExecutableSteps(plan);
      expect(executable).toHaveLength(1);
      expect(executable[0].id).toBe("s2");
    });
  });

  describe("isPlanFinished", () => {
    it("所有步骤完成时返回 true", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a" },
        { id: "s1", content: "b" },
      ]);

      plan.steps[0].status = StepStatus.COMPLETED;
      plan.steps[1].status = StepStatus.COMPLETED;
      expect(isPlanFinished(plan)).toBe(true);

      plan.steps[1].status = StepStatus.FAILED;
      expect(isPlanFinished(plan)).toBe(true);

      plan.steps[1].status = StepStatus.SKIPPED;
      expect(isPlanFinished(plan)).toBe(true);
    });

    it("有待处理步骤时返回 false", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a" },
        { id: "s1", content: "b" },
      ]);

      plan.steps[0].status = StepStatus.COMPLETED;
      expect(isPlanFinished(plan)).toBe(false);
    });

    it("空步骤列表返回 false", () => {
      expect(isPlanFinished({ steps: [] })).toBe(false);
      expect(isPlanFinished(null)).toBe(false);
    });
  });

  describe("getPlanProgress", () => {
    it("正确统计各状态数量", () => {
      const plan = createPlan("goal", [
        { id: "s0", content: "a" },
        { id: "s1", content: "b" },
        { id: "s2", content: "c" },
        { id: "s3", content: "d" },
        { id: "s4", content: "e" },
      ]);

      plan.steps[0].status = StepStatus.COMPLETED;
      plan.steps[1].status = StepStatus.IN_PROGRESS;
      plan.steps[2].status = StepStatus.FAILED;
      plan.steps[3].status = StepStatus.SKIPPED;
      // s4 stays PENDING

      const progress = getPlanProgress(plan);
      expect(progress.total).toBe(5);
      expect(progress.completed).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.failed).toBe(1);
      expect(progress.skipped).toBe(1);
      expect(progress.pending).toBe(1);
    });
  });

  describe("formatPlanSummary", () => {
    it("生成中文摘要", () => {
      const plan = createPlan("写一个 Web 应用", [
        { id: "step-0", content: "创建项目" },
        { id: "step-1", content: "添加路由" },
      ]);

      plan.status = PlanStatus.RUNNING;
      plan.steps[0].status = StepStatus.COMPLETED;

      const summary = formatPlanSummary(plan, true);
      expect(summary).toContain("写一个 Web 应用");
      expect(summary).toContain("执行中");
      expect(summary).toContain("1/2");
    });

    it("生成英文摘要", () => {
      const plan = createPlan("Build a web app", [
        { id: "step-0", content: "Create project" },
      ]);

      plan.status = PlanStatus.COMPLETED;
      plan.steps[0].status = StepStatus.COMPLETED;

      const summary = formatPlanSummary(plan, false);
      expect(summary).toContain("Build a web app");
      expect(summary).toContain("Completed");
      expect(summary).toContain("1/1");
    });
  });
});

// ============================================================================
// 2. PlanExecutor 编排循环
// ============================================================================

describe("PlanExecutor", () => {
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

  describe("_parsePlanSteps (JSON 解析)", () => {
    beforeEach(() => {
      executor = createExecutor();
    });

    it("解析纯 JSON", () => {
      const json = JSON.stringify({
        steps: [
          { id: "step-0", content: "Read file", dependencies: [] },
          { id: "step-1", content: "Write file", dependencies: ["step-0"] },
        ],
      });

      const steps = executor._parsePlanSteps(json, 10);
      expect(steps).toHaveLength(2);
      expect(steps[0].id).toBe("step-0");
      expect(steps[1].dependencies).toEqual(["step-0"]);
    });

    it("解析 markdown 代码块中的 JSON", () => {
      const text = [
        "Here is the plan:",
        "```json",
        JSON.stringify({
          steps: [{ id: "step-0", content: "Do it", dependencies: [] }],
        }),
        "```",
        "Let me know if this works.",
      ].join("\n");

      const steps = executor._parsePlanSteps(text, 10);
      expect(steps).toHaveLength(1);
      expect(steps[0].content).toBe("Do it");
    });

    it("从混合文本中提取 JSON 对象", () => {
      const text = `Okay, I'll break it down.
{
  "steps": [
    {"id": "step-0", "content": "Setup project", "dependencies": []},
    {"id": "step-1", "content": "Implement feature", "dependencies": ["step-0"]}
  ]
}
Hope this looks good!`;

      const steps = executor._parsePlanSteps(text, 10);
      expect(steps).toHaveLength(2);
    });

    it("截断超过 maxSteps 的步骤", () => {
      const steps = Array.from({ length: 15 }, (_, i) => ({
        id: `step-${i}`,
        content: `Step ${i}`,
        dependencies: [],
      }));

      const result = executor._parsePlanSteps(
        JSON.stringify({ steps }),
        5
      );
      expect(result).toHaveLength(5);
    });

    it("空文本抛出错误", () => {
      expect(() => executor._parsePlanSteps("", 10)).toThrow();
    });

    it("无 steps 数组抛出错误", () => {
      expect(() =>
        executor._parsePlanSteps(JSON.stringify({ notSteps: [] }), 10)
      ).toThrow();
    });
  });

  describe("execute (编排循环)", () => {
    it("单步计划成功执行", async () => {
      mockExecuteIsolated
        // Decompose call
        .mockResolvedValueOnce({
          replyText: JSON.stringify({
            steps: [{ id: "step-0", content: "Do the thing", dependencies: [] }],
          }),
        })
        // Step execution call
        .mockResolvedValueOnce({
          replyText: "Step completed successfully.",
          stopReason: "stop",
        });

      executor = createExecutor();
      const plan = await executor.execute("Do the thing");

      expect(plan.status).toBe(PlanStatus.COMPLETED);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].status).toBe(StepStatus.COMPLETED);
      expect(plan.steps[0].result).toBe("Step completed successfully.");
      expect(mockExecuteIsolated).toHaveBeenCalledTimes(2);

      // DeferredResultStore 被正确调用
      expect(mockStore.resolve).toHaveBeenCalledTimes(1);
    });

    it("多步 DAG 依赖顺序执行", async () => {
      // Decompose: 3 steps with DAG
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: JSON.stringify({
          steps: [
            { id: "step-0", content: "Setup", dependencies: [] },
            { id: "step-1", content: "Build", dependencies: ["step-0"] },
            { id: "step-2", content: "Test", dependencies: ["step-1"] },
          ],
        }),
      });

      // Step executions
      mockExecuteIsolated
        .mockResolvedValueOnce({ replyText: "Setup done", stopReason: "stop" })
        .mockResolvedValueOnce({ replyText: "Build done", stopReason: "stop" })
        .mockResolvedValueOnce({ replyText: "Test done", stopReason: "stop" });

      executor = createExecutor();
      const plan = await executor.execute("Build and test");

      expect(plan.status).toBe(PlanStatus.COMPLETED);
      // All steps completed in order
      expect(plan.steps[0].status).toBe(StepStatus.COMPLETED);
      expect(plan.steps[1].status).toBe(StepStatus.COMPLETED);
      expect(plan.steps[2].status).toBe(StepStatus.COMPLETED);
    });

    it("分解失败时退化为单步计划", async () => {
      // Decompose fails
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: "I cannot decompose this goal.",
      });
      // Step execution
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: "Fallback execution done.",
        stopReason: "stop",
      });

      executor = createExecutor();
      const plan = await executor.execute("Simple goal");

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].id).toBe("step-0");
      expect(plan.steps[0].content).toBe("Simple goal");
      expect(plan.status).toBe(PlanStatus.COMPLETED);
    });

    it("步骤失败时触发重规划", async () => {
      // Decompose: 2 steps
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: JSON.stringify({
          steps: [
            { id: "step-0", content: "Failing step", dependencies: [] },
            { id: "step-1", content: "Follow-up step", dependencies: ["step-0"] },
          ],
        }),
      });

      // Step 0 fails
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: "",
        error: "Something went wrong",
        stopReason: "error",
      });

      // Re-plan returns adjusted step
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: JSON.stringify({
          steps: [
            { id: "step-r0", content: "Workaround step", dependencies: [] },
          ],
        }),
      });

      // Re-planned step succeeds
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: "Workaround completed.",
        stopReason: "stop",
      });

      executor = createExecutor();
      const plan = await executor.execute("Goal with failure");

      expect(plan.steps.some(s => s.status === StepStatus.FAILED)).toBe(true);
      expect(plan.steps.some(s => s.status === StepStatus.COMPLETED && s.id === "step-r0")).toBe(true);
      // 3 subagent calls: decompose + step0 + replan + step-r0
      expect(mockExecuteIsolated).toHaveBeenCalledTimes(4);
    });

    it("重规划也失败时跳过剩余步骤", async () => {
      // Decompose
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: JSON.stringify({
          steps: [
            { id: "step-0", content: "Will fail", dependencies: [] },
            { id: "step-1", content: "Will skip", dependencies: ["step-0"] },
          ],
        }),
      });

      // Step fails
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: "",
        error: "Fatal error",
        stopReason: "error",
      });

      // All 3 replan attempts fail
      for (let i = 0; i < 3; i++) {
        mockExecuteIsolated.mockResolvedValueOnce({
          replyText: "I give up, can't replan this.",
        });
      }

      executor = createExecutor();
      const plan = await executor.execute("Impossible goal");

      expect(plan.status).toBe(PlanStatus.FAILED);
      expect(plan.steps[0].status).toBe(StepStatus.FAILED);
      // step-1 should be skipped because its dependency failed
      const step1 = plan.steps.find(s => s.id === "step-1");
      expect(step1?.status).toBe(StepStatus.SKIPPED);
      expect(mockStore.fail).toHaveBeenCalled();
    });

    it("step 执行返回 error 时正确抛出", async () => {
      // Decompose
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: JSON.stringify({
          steps: [{ id: "step-0", content: "Problematic step", dependencies: [] }],
        }),
      });

      // Step error (not stopReason, but result.error)
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: "",
        error: "Network timeout",
      });

      // Replan fails
      mockExecuteIsolated.mockResolvedValueOnce({
        replyText: "Cannot replan.",
      });

      executor = createExecutor();
      const plan = await executor.execute("Goal");

      expect(plan.steps[0].status).toBe(StepStatus.FAILED);
      expect(plan.steps[0].error).toContain("Network timeout");
    });
  });
});

// ============================================================================
// 3. plan_execute 工具
// ============================================================================

describe("plan_execute 工具", () => {
  let tool;
  let mockExecuteIsolated;
  let mockStore;

  beforeEach(() => {
    mockStore = {
      resolve: vi.fn(),
      fail: vi.fn(),
      defer: vi.fn(),
    };

    mockExecuteIsolated = vi.fn().mockResolvedValue({
      replyText: JSON.stringify({
        steps: [{ id: "step-0", content: "Test step", dependencies: [] }],
      }),
    });

    tool = createPlanExecuteTool({
      executeIsolated: mockExecuteIsolated,
      getDeferredStore: () => mockStore,
      getSessionPath: () => "/tmp/test-session.jsonl",
      getParentCwd: () => "/tmp/test-cwd",
      emitEvent: vi.fn(),
      currentAgentId: "test-agent",
      agentDir: "/tmp/test-agent",
    });
  });

  it("返回有效的工具结构", () => {
    expect(tool.name).toBe("plan_execute");
    expect(tool.label).toBeTruthy();
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("空 goal 返回错误", async () => {
    const result = await tool.execute("id", { goal: "" }, null, null, {});
    expect(result.content[0].text).toContain("Error");
  });

  it("立即返回 fire-and-forget 结果", async () => {
    const result = await tool.execute(
      "id",
      { goal: "Build a test app", maxSteps: 3 },
      null,
      null,
      {}
    );

    expect(result.content[0].text).toContain("Plan execution started");
    expect(result.content[0].text).toContain("Task ID");
    expect(result.details.status).toBe("running");
    expect(result.details.goal).toBe("Build a test app");
  });

  it("注册 DeferredResultStore 占位", async () => {
    await tool.execute(
      "id",
      { goal: "Build app" },
      null,
      null,
      {}
    );

    expect(mockStore.defer).toHaveBeenCalledTimes(1);
    const deferCall = mockStore.defer.mock.calls[0];
    expect(deferCall[0]).toMatch(/^plan_\d+_/); // taskId 格式
    expect(deferCall[1].meta.type).toBe("plan_execute");
  });
});
