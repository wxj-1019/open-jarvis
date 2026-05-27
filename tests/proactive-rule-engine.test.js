/**
 * proactive-rule-engine.test.js — 意图预测规则引擎测试
 *
 * 覆盖：条件匹配、冷却机制、规则 CRUD、验证、内置规则、
 *       evaluate、testRule、reloadCustomRules、事件订阅触发
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ProactiveRuleEngine,
  BUILT_IN_RULES,
  validateRule,
} from "../lib/proactive/proactive-rule-engine.js";

// ── Mock 工厂 ──

function createMockEventBus() {
  const subscribers = [];
  const emitted = [];
  return {
    subscribe: vi.fn((cb, _filter) => {
      subscribers.push(cb);
      return () => {
        const idx = subscribers.indexOf(cb);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    }),
    emit: vi.fn((event, _sp) => {
      emitted.push(event);
    }),
    _subscribers: subscribers,
    _emitted: emitted,
    // 测试辅助：手动触发事件给所有订阅者
    _fire(event) {
      for (const cb of subscribers) cb(event);
    },
  };
}

function createMockContextTracker(snapshot = null) {
  return {
    getContextSnapshot: vi.fn(() => snapshot || {
      currentApp: "Code",
      currentTitle: "app.ts",
      recentApps: [{ app: "Code", title: "app.ts", timestamp: Date.now() }],
      recentFiles: [{ path: "/src/app.ts", event: "change", timestamp: Date.now() }],
      lastActiveTime: Date.now(),
    }),
  };
}

function createMockExecuteAction() {
  return vi.fn();
}

function createRuleEngine(opts = {}) {
  return new ProactiveRuleEngine({
    eventBus: opts.eventBus || createMockEventBus(),
    userContextTracker: opts.contextTracker || createMockContextTracker(),
    executeAction: opts.executeAction || createMockExecuteAction(),
    customRules: opts.customRules || [],
    builtinOverrides: opts.builtinOverrides || {},
  });
}

function makeRule(overrides = {}) {
  return {
    id: "test-rule-1",
    name: "Test Rule",
    enabled: true,
    conditions: [
      { type: "app_pattern", pattern: "Code" },
    ],
    matchMode: "all",
    action: {
      type: "trigger_agent",
      prompt: "test prompt",
      cooldownMinutes: 30,
    },
    lastTriggered: null,
    ...overrides,
  };
}

// ══════════════════════════════════════
// 测试用例
// ══════════════════════════════════════

describe("validateRule", () => {
  it("有效规则通过验证", () => {
    const result = validateRule(makeRule());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("非 object 参数报错", () => {
    const result = validateRule(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must be an object");
  });

  it("缺少 id 报错", () => {
    const result = validateRule(makeRule({ id: undefined }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("缺少 name 报错", () => {
    const result = validateRule(makeRule({ name: undefined }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("空 conditions 报错", () => {
    const result = validateRule(makeRule({ conditions: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("conditions"))).toBe(true);
  });

  it("无效 matchMode 报错", () => {
    const result = validateRule(makeRule({ matchMode: "invalid" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("matchMode"))).toBe(true);
  });

  it("无效 action.type 报错", () => {
    const result = validateRule(makeRule({ action: { type: "bad", prompt: "x" } }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("action.type"))).toBe(true);
  });

  it("缺少 action.prompt 报错", () => {
    const result = validateRule(makeRule({ action: { type: "trigger_agent" } }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("prompt"))).toBe(true);
  });

  it("time_guard 格式错误报错", () => {
    const result = validateRule(makeRule({
      conditions: [{ type: "time_guard", from: "9:00", to: "18:00" }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("HH:MM"))).toBe(true);
  });

  it("无效正则 pattern 报错", () => {
    const result = validateRule(makeRule({
      conditions: [{ type: "app_pattern", pattern: "[invalid" }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid regex"))).toBe(true);
  });

  it("未知 condition.type 报错", () => {
    const result = validateRule(makeRule({
      conditions: [{ type: "regex_match", pattern: "test" }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not supported"))).toBe(true);
  });

  it("pattern 超过 200 字符报错", () => {
    const longPattern = "a".repeat(201);
    const result = validateRule(makeRule({
      conditions: [{ type: "app_pattern", pattern: longPattern }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("200 characters"))).toBe(true);
  });

  it("pattern 恰好 200 字符不报错", () => {
    const maxPattern = "a".repeat(200);
    const result = validateRule(makeRule({
      conditions: [{ type: "app_pattern", pattern: maxPattern }],
    }));
    expect(result.valid).toBe(true);
  });

  it("rich_context_keyword 类型通过验证", () => {
    const result = validateRule(makeRule({
      conditions: [{ type: "rich_context_keyword", keywords: ["error"] }],
    }));
    expect(result.valid).toBe(true);
  });

  it("conditions 缺少 type 报错", () => {
    const result = validateRule(makeRule({
      conditions: [{ pattern: "test" }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type is required"))).toBe(true);
  });
});

describe("ProactiveRuleEngine", () => {
  describe("生命周期", () => {
    it("start/stop 正常工作", () => {
      const bus = createMockEventBus();
      const engine = createRuleEngine({ eventBus: bus });
      engine.start();
      expect(bus.subscribe).toHaveBeenCalled();
      engine.stop();
    });

    it("start 是幂等的", () => {
      const bus = createMockEventBus();
      const engine = createRuleEngine({ eventBus: bus });
      engine.start();
      engine.start();
      expect(bus.subscribe).toHaveBeenCalledTimes(1);
      engine.stop();
    });
  });

  describe("内置规则", () => {
    it("启动时加载 3 条内置规则", () => {
      const engine = createRuleEngine();
      const rules = engine.getRules();
      expect(rules.filter((r) => r.builtIn)).toHaveLength(3);
    });

    it("内置规则包含 IDE 检测", () => {
      const engine = createRuleEngine();
      const rules = engine.getRules();
      const ide = rules.find((r) => r.id === "builtin-ide-context");
      expect(ide).toBeDefined();
      expect(ide.conditions.some((c) => c.type === "app_pattern")).toBe(true);
    });
  });

  describe("条件匹配", () => {
    it("app_pattern 匹配 event.app", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ conditions: [{ type: "app_pattern", pattern: "Code|Cursor" }] }),
      ] });
      const rules = engine.getRules();
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Visual Studio Code", title: "", timestamp: Date.now() },
        null,
      );
      const custom = matched.find((r) => r.id === "test-rule-1");
      expect(custom).toBeDefined();
    });

    it("app_pattern 不匹配", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ conditions: [{ type: "app_pattern", pattern: "^Safari$" }] }),
      ] });
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", title: "", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeUndefined();
    });

    it("time_guard 在时间段内匹配", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ conditions: [{ type: "time_guard", from: "00:00", to: "23:59" }] }),
      ] });
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
    });

    it("time_guard 跨午夜范围 (22:00-06:00) 在 23:00 匹配", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ conditions: [{ type: "time_guard", from: "22:00", to: "06:00" }] }),
      ] });
      // 模拟 23:00
      const fakeNow = new Date();
      fakeNow.setHours(23, 0, 0, 0);
      vi.useFakeTimers();
      vi.setSystemTime(fakeNow);
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
      vi.useRealTimers();
    });

    it("time_guard 跨午夜范围 (22:00-06:00) 在 03:00 匹配", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ conditions: [{ type: "time_guard", from: "22:00", to: "06:00" }] }),
      ] });
      const fakeNow = new Date();
      fakeNow.setHours(3, 0, 0, 0);
      vi.useFakeTimers();
      vi.setSystemTime(fakeNow);
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
      vi.useRealTimers();
    });

    it("time_guard 跨午夜范围 (22:00-06:00) 在 12:00 不匹配", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ conditions: [{ type: "time_guard", from: "22:00", to: "06:00" }] }),
      ] });
      const fakeNow = new Date();
      fakeNow.setHours(12, 0, 0, 0);
      vi.useFakeTimers();
      vi.setSystemTime(fakeNow);
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeUndefined();
      vi.useRealTimers();
    });

    it("file_pattern 匹配文件路径", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ conditions: [{ type: "file_pattern", pattern: "\\.ts$" }] }),
      ] });
      const matched = engine.evaluate(
        { type: "file_system_changed", path: "/src/app.ts", event: "change", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
    });

    it("idle_duration 空闲超时匹配", () => {
      const ctx = { lastActiveTime: Date.now() - 10 * 60 * 1000 }; // 10 分钟前
      const engine = createRuleEngine({
        contextTracker: createMockContextTracker(ctx),
        customRules: [
          makeRule({ conditions: [{ type: "idle_duration", minutes: 5 }] }),
        ],
      });
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        ctx,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
    });

    it("context_keyword 匹配关键词", () => {
      const ctx = {
        currentApp: "Code",
        currentTitle: "bug-fix.ts",
        recentFiles: [],
        lastActiveTime: Date.now(),
      };
      const engine = createRuleEngine({
        contextTracker: createMockContextTracker(ctx),
        customRules: [
          makeRule({ conditions: [{ type: "context_keyword", keywords: ["bug", "fix"] }] }),
        ],
      });
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        ctx,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
    });

    it("matchMode=all 所有条件都必须满足", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({
          conditions: [
            { type: "app_pattern", pattern: "Code" },
            { type: "time_guard", from: "03:00", to: "03:01" }, // 极窄范围
          ],
          matchMode: "all",
        }),
      ] });
      // 模拟非 03:00 时间，确保 time_guard 不满足
      const fakeNow = new Date();
      fakeNow.setHours(12, 0, 0, 0);
      vi.useFakeTimers();
      vi.setSystemTime(fakeNow);
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        null,
      );
      vi.useRealTimers();
      // app_pattern 匹配但 time_guard 不满足，所以整体不匹配
      expect(matched.find((r) => r.id === "test-rule-1")).toBeUndefined();
    });

    it("matchMode=any 任一条件满足即可", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({
          conditions: [
            { type: "app_pattern", pattern: "^Safari$" },
            { type: "app_pattern", pattern: "Code" },
          ],
          matchMode: "any",
        }),
      ] });
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
    });
  });

  describe("冷却机制", () => {
    it("冷却期内不重复触发", () => {
      const exec = createMockExecuteAction();
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: exec,
        customRules: [
          makeRule({
            conditions: [{ type: "app_pattern", pattern: "^ExactTestApp$" }], // 避免匹配内置规则
            action: { type: "trigger_agent", prompt: "test", cooldownMinutes: 30 },
          }),
        ],
      });
      engine.start();

      // 第一次触发
      bus._fire({ type: "window_focus_changed", app: "ExactTestApp", title: "", timestamp: Date.now() });
      expect(exec).toHaveBeenCalledTimes(1);

      // 第二次触发（在冷却期内）
      bus._fire({ type: "window_focus_changed", app: "ExactTestApp", title: "", timestamp: Date.now() });
      expect(exec).toHaveBeenCalledTimes(1); // 仍然 1 次

      engine.stop();
    });
  });

  describe("规则 CRUD", () => {
    it("addRule 添加自定义规则", () => {
      const engine = createRuleEngine();
      const before = engine.getRules().length;
      const result = engine.addRule(makeRule({ id: "new-rule" }));
      expect(result.ok).toBe(true);
      expect(engine.getRules().length).toBe(before + 1);
    });

    it("addRule 重复 id 失败", () => {
      const engine = createRuleEngine();
      engine.addRule(makeRule({ id: "dup" }));
      const result = engine.addRule(makeRule({ id: "dup" }));
      expect(result.ok).toBe(false);
    });

    it("addRule 无效规则失败", () => {
      const engine = createRuleEngine();
      const result = engine.addRule({ id: "bad" }); // 缺 name / conditions / action
      expect(result.ok).toBe(false);
    });

    it("removeRule 删除自定义规则", () => {
      const engine = createRuleEngine();
      engine.addRule(makeRule({ id: "to-remove" }));
      const result = engine.removeRule("to-remove");
      expect(result.ok).toBe(true);
      expect(engine.getRules().find((r) => r.id === "to-remove")).toBeUndefined();
    });

    it("removeRule 不能删除内置规则", () => {
      const engine = createRuleEngine();
      const result = engine.removeRule("builtin-ide-context");
      expect(result.ok).toBe(false);
    });

    it("removeRule 不存在的规则返回 ok=false", () => {
      const engine = createRuleEngine();
      const result = engine.removeRule("nonexistent");
      expect(result.ok).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("updateRule 更新自定义规则", () => {
      const engine = createRuleEngine();
      engine.addRule(makeRule({ id: "to-update" }));
      const result = engine.updateRule("to-update", { name: "Updated Name", enabled: false });
      expect(result.ok).toBe(true);
      const rule = engine.getRules().find((r) => r.id === "to-update");
      expect(rule.name).toBe("Updated Name");
      expect(rule.enabled).toBe(false);
    });

    it("updateRule 内置规则仅允许 enabled 切换", () => {
      const engine = createRuleEngine();
      const result = engine.updateRule("builtin-ide-context", { enabled: false });
      expect(result.ok).toBe(true);
      const rule = engine.getRules().find((r) => r.id === "builtin-ide-context");
      expect(rule.enabled).toBe(false);
    });

    it("updateRule 内置规则修改其他字段失败", () => {
      const engine = createRuleEngine();
      const result = engine.updateRule("builtin-ide-context", { name: "Hacked" });
      expect(result.ok).toBe(false);
    });

    it("updateRule 不存在的规则失败", () => {
      const engine = createRuleEngine();
      const result = engine.updateRule("nonexistent", { name: "x" });
      expect(result.ok).toBe(false);
    });
  });

  describe("testRule (dry-run)", () => {
    it("返回每个条件的匹配结果", () => {
      const engine = createRuleEngine();
      const rule = makeRule({
        conditions: [
          { type: "app_pattern", pattern: "Code" },
          { type: "time_guard", from: "00:00", to: "23:59" },
        ],
        matchMode: "all",
      });
      const result = engine.testRule(rule, { app: "Code", title: "", timestamp: Date.now() });
      expect(result.matched).toBe(true);
      expect(result.conditions).toHaveLength(2);
      expect(result.conditions[0].matched).toBe(true);
      expect(result.conditions[1].matched).toBe(true);
    });

    it("app_pattern 不匹配时返回 false", () => {
      const engine = createRuleEngine();
      const rule = makeRule({
        conditions: [{ type: "app_pattern", pattern: "^Safari$" }],
        matchMode: "all",
      });
      const result = engine.testRule(rule, { app: "Code", title: "", timestamp: Date.now() });
      expect(result.matched).toBe(false);
      expect(result.conditions[0].matched).toBeFalsy();
    });
  });

  describe("reloadCustomRules", () => {
    it("替换所有自定义规则，保留内置", () => {
      const engine = createRuleEngine();
      engine.addRule(makeRule({ id: "old-1" }));
      engine.addRule(makeRule({ id: "old-2" }));

      const builtinCount = engine.getRules().filter((r) => r.builtIn).length;
      engine.reloadCustomRules([
        makeRule({ id: "new-1" }),
        makeRule({ id: "new-2" }),
        makeRule({ id: "new-3" }),
      ]);

      const rules = engine.getRules();
      expect(rules.filter((r) => r.builtIn)).toHaveLength(builtinCount);
      expect(rules.filter((r) => !r.builtIn)).toHaveLength(3);
      expect(rules.find((r) => r.id === "old-1")).toBeUndefined();
      expect(rules.find((r) => r.id === "new-1")).toBeDefined();
    });

    it("忽略无效的自定义规则", () => {
      const engine = createRuleEngine();
      engine.reloadCustomRules([
        { bad: "rule" }, // 无效
        makeRule({ id: "valid-1" }),
      ]);
      const custom = engine.getRules().filter((r) => !r.builtIn);
      expect(custom).toHaveLength(1);
    });
  });

  describe("事件订阅触发", () => {
    it("window_focus_changed 事件触发规则", () => {
      const exec = createMockExecuteAction();
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: exec,
        customRules: [
          makeRule({
            conditions: [{ type: "app_pattern", pattern: "^ExactTestApp$" }],
            action: { type: "trigger_agent", prompt: "check workspace", cooldownMinutes: 0 },
          }),
        ],
      });
      engine.start();

      bus._fire({ type: "window_focus_changed", app: "ExactTestApp", title: "app.ts", timestamp: Date.now() });
      expect(exec).toHaveBeenCalledWith("check workspace", expect.objectContaining({ ruleId: "test-rule-1" }));

      engine.stop();
    });

    it("file_system_changed 事件触发规则", () => {
      const exec = createMockExecuteAction();
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: exec,
        customRules: [
          makeRule({
            conditions: [{ type: "file_pattern", pattern: "^/special-dir/" }], // 不匹配内置
            action: { type: "trigger_agent", prompt: "file changed", cooldownMinutes: 0 },
          }),
        ],
      });
      engine.start();

      bus._fire({ type: "file_system_changed", path: "/special-dir/app.js", event: "change", timestamp: Date.now() });
      expect(exec).toHaveBeenCalledWith("file changed", expect.objectContaining({ ruleId: "test-rule-1" }));

      engine.stop();
    });

    it("不匹配的事件不触发自定义规则", () => {
      const exec = createMockExecuteAction();
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: exec,
        customRules: [
          makeRule({
            conditions: [{ type: "app_pattern", pattern: "^Safari$" }],
            action: { type: "trigger_agent", prompt: "safari", cooldownMinutes: 0 },
          }),
        ],
      });
      engine.start();

      bus._fire({ type: "window_focus_changed", app: "Safari", title: "", timestamp: Date.now() });
      // Safari 不匹配内置规则的 IDE pattern，所以只应触发自定义规则
      expect(exec).toHaveBeenCalledWith("safari", expect.objectContaining({ ruleId: "test-rule-1" }));

      engine.stop();
    });

    it("触发后发射 proactive_action_triggered 事件", () => {
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: createMockExecuteAction(),
        customRules: [
          makeRule({
            conditions: [{ type: "app_pattern", pattern: "^ExactTestApp$" }],
            action: { type: "trigger_agent", prompt: "test", cooldownMinutes: 0 },
          }),
        ],
      });
      engine.start();

      bus._fire({ type: "window_focus_changed", app: "ExactTestApp", title: "", timestamp: Date.now() });
      const emitted = bus._emitted.find((e) => e.type === "proactive_action_triggered" && e.ruleId === "test-rule-1");
      expect(emitted).toBeDefined();

      engine.stop();
    });
  });

  describe("_fireAction 失败不进入冷却", () => {
    it("executeAction 拖异常时不更新 lastTriggered", () => {
      const exec = vi.fn(() => { throw new Error("sync boom"); });
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: exec,
        customRules: [
          makeRule({
            conditions: [{ type: "app_pattern", pattern: "^ExactTestApp$" }],
            action: { type: "trigger_agent", prompt: "test", cooldownMinutes: 30 },
          }),
        ],
      });
      engine.start();

      // 第一次触发：exec 抛异常
      bus._fire({ type: "window_focus_changed", app: "ExactTestApp", title: "", timestamp: Date.now() });
      expect(exec).toHaveBeenCalledTimes(1);

      // lastTriggered 不应被设置，所以第二次应再次触发
      bus._fire({ type: "window_focus_changed", app: "ExactTestApp", title: "", timestamp: Date.now() });
      expect(exec).toHaveBeenCalledTimes(2);

      engine.stop();
    });

    it("executeAction 拖异常时不发射 proactive_action_triggered", () => {
      const exec = vi.fn(() => { throw new Error("sync boom"); });
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: exec,
        customRules: [
          makeRule({
            conditions: [{ type: "app_pattern", pattern: "^ExactTestApp$" }],
            action: { type: "trigger_agent", prompt: "test", cooldownMinutes: 30 },
          }),
        ],
      });
      engine.start();

      bus._fire({ type: "window_focus_changed", app: "ExactTestApp", title: "", timestamp: Date.now() });

      const triggered = bus._emitted.find((e) => e.type === "proactive_action_triggered" && e.ruleId === "test-rule-1");
      expect(triggered).toBeUndefined();

      engine.stop();
    });
  });

  describe("disabled 规则", () => {
    it("enabled=false 的规则不匹配", () => {
      const engine = createRuleEngine({ customRules: [
        makeRule({ enabled: false }),
      ] });
      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        null,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeUndefined();
    });
  });

  describe("getRules 返回快照", () => {
    it("不暴露内部 lastTriggered 之外的私有状态", () => {
      const engine = createRuleEngine();
      const rules = engine.getRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0]).toHaveProperty("id");
      expect(rules[0]).toHaveProperty("builtIn");
      expect(rules[0]).toHaveProperty("enabled");
      expect(rules[0]).toHaveProperty("conditions");
      expect(rules[0]).toHaveProperty("action");
    });
  });

  describe("builtinOverrides", () => {
    it("builtinOverrides 可以禁用内置规则", () => {
      const engine = createRuleEngine({
        builtinOverrides: { "builtin-ide-context": false },
      });
      const ide = engine.getRules().find((r) => r.id === "builtin-ide-context");
      expect(ide.enabled).toBe(false);
    });

    it("无 override 的内置规则保持默认 enabled", () => {
      const engine = createRuleEngine({
        builtinOverrides: { "builtin-ide-context": false },
      });
      const freq = engine.getRules().find((r) => r.id === "builtin-frequent-file-changes");
      expect(freq.enabled).toBe(true);
    });

    it("被禁用的内置规则不触发", () => {
      const exec = createMockExecuteAction();
      const bus = createMockEventBus();
      const engine = createRuleEngine({
        eventBus: bus,
        executeAction: exec,
        builtinOverrides: { "builtin-ide-context": false },
      });
      engine.start();

      bus._fire({ type: "window_focus_changed", app: "Visual Studio Code", title: "", timestamp: Date.now() });
      // builtin-ide-context 被禁用，不应触发
      const ideTrigger = exec.mock.calls.some((call) => call[1]?.ruleId === "builtin-ide-context");
      expect(ideTrigger).toBe(false);

      engine.stop();
    });
  });

  describe("rich_context_keyword condition", () => {
    it("匹配 L2 文件内容中的关键词", () => {
      const ctx = {
        richContext: {
          l2: { fileContent: "const error = new Error();" },
        },
      };
      const engine = createRuleEngine({
        contextTracker: createMockContextTracker(ctx),
        customRules: [
          makeRule({
            conditions: [{ type: "rich_context_keyword", keywords: ["error", "Error"] }],
          }),
        ],
      });

      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        ctx,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
    });

    it("不匹配时不触发", () => {
      const ctx = {
        richContext: {
          l2: { fileContent: "const x = 1;" },
        },
      };
      const engine = createRuleEngine({
        contextTracker: createMockContextTracker(ctx),
        customRules: [
          makeRule({
            conditions: [{ type: "rich_context_keyword", keywords: ["error"] }],
          }),
        ],
      });

      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        ctx,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeUndefined();
    });

    it("匹配剪贴板内容", () => {
      const ctx = {
        richContext: {
          l2: { fileContent: null, clipboard: "Uncaught TypeError: undefined" },
        },
      };
      const engine = createRuleEngine({
        contextTracker: createMockContextTracker(ctx),
        customRules: [
          makeRule({
            conditions: [{ type: "rich_context_keyword", keywords: ["TypeError"] }],
          }),
        ],
      });

      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Terminal", timestamp: Date.now() },
        ctx,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeDefined();
    });

    it("无 richContext 时不匹配", () => {
      const ctx = { currentApp: "Code" };
      const engine = createRuleEngine({
        contextTracker: createMockContextTracker(ctx),
        customRules: [
          makeRule({
            conditions: [{ type: "rich_context_keyword", keywords: ["error"] }],
          }),
        ],
      });

      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        ctx,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeUndefined();
    });

    it("keywords 为空数组时不匹配", () => {
      const ctx = {
        richContext: {
          l2: { fileContent: "some error here" },
        },
      };
      const engine = createRuleEngine({
        contextTracker: createMockContextTracker(ctx),
        customRules: [
          makeRule({
            conditions: [{ type: "rich_context_keyword", keywords: [] }],
          }),
        ],
      });

      const matched = engine.evaluate(
        { type: "window_focus_changed", app: "Code", timestamp: Date.now() },
        ctx,
      );
      expect(matched.find((r) => r.id === "test-rule-1")).toBeUndefined();
    });
  });
});
