/**
 * proactive-rule-engine.js — 主动介入规则引擎
 *
 * 监听 EventBus 事件 + UserContextTracker 上下文，
 * 按规则条件匹配后自动触发 Agent 会话。
 *
 * 条件类型：app_pattern / time_guard / file_pattern / idle_duration / context_keyword
 * 动作类型：trigger_agent
 * 冷却机制：同一规则在 cooldownMinutes 内不重复触发
 */

import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("proactive-rule-engine");

// ── 内置规则 ──

export const BUILT_IN_RULES = [
  {
    id: "builtin-ide-context",
    name: "打开 IDE 时加载项目上下文",
    builtIn: true,
    enabled: true,
    conditions: [
      { type: "app_pattern", pattern: "Code|Visual Studio Code|VSCodium|Cursor|WebStorm|IntelliJ|PyCharm|GoLand|CLion|Android Studio|Xcode" },
      { type: "time_guard", from: "09:00", to: "22:00" },
    ],
    matchMode: "all",
    action: {
      type: "trigger_agent",
      prompt: "用户正在使用 IDE 开发，请主动检查工作区是否有需要关注的事项（如编译错误、待提交变更、未完成任务），如有则简要提醒。",
      cooldownMinutes: 30,
    },
    lastTriggered: null,
  },
  {
    id: "builtin-frequent-file-changes",
    name: "文件频繁变化时建议提交",
    builtIn: true,
    enabled: true,
    conditions: [
      { type: "file_pattern", pattern: ".+" },
      { type: "time_guard", from: "09:00", to: "22:00" },
    ],
    matchMode: "all",
    action: {
      type: "trigger_agent",
      prompt: "检测到用户工作区文件有频繁变化，请检查是否有较多未提交的更改，如有则简要提醒用户是否需要提交。",
      cooldownMinutes: 60,
    },
    lastTriggered: null,
  },
  {
    id: "builtin-non-work-reminder",
    name: "工作时间切换到非工作应用",
    builtIn: true,
    enabled: true,
    conditions: [
      { type: "app_pattern", pattern: "YouTube|Bilibili|Steam|Twitch|Netflix|Spotify" },
      { type: "time_guard", from: "09:00", to: "18:00" },
    ],
    matchMode: "all",
    action: {
      type: "trigger_agent",
      prompt: "检测到用户在工作时间打开了娱乐类应用，如果用户有未完成的待办事项，简要提醒。",
      cooldownMinutes: 120,
    },
    lastTriggered: null,
  },
];

// ── 条件匹配器 ──

/**
 * 单个条件匹配
 * @param {object} condition
 * @param {object} event
 * @param {object} context  UserContextTracker.getContextSnapshot() 结果
 * @returns {boolean}
 */
function matchCondition(condition, event, context) {
  switch (condition.type) {
    case "app_pattern": {
      if (!event.app) return false;
      try {
        const re = new RegExp(condition.pattern, "i");
        return re.test(event.app) || (event.title && re.test(event.title));
      } catch {
        return false;
      }
    }
    case "time_guard": {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");   
      const current = `${hh}:${mm}`;
      const hasFrom = condition.from && /^\d{2}:\d{2}$/.test(condition.from);
      const hasTo = condition.to && /^\d{2}:\d{2}$/.test(condition.to);
      if (hasFrom && hasTo) {
        if (condition.from <= condition.to) {
          // 正常范围，如 09:00-18:00
          if (current < condition.from || current > condition.to) return false;
        } else {
          // 跨午夜范围，如 22:00-06:00
          if (current < condition.from && current > condition.to) return false;
        }
      } else {
        if (hasFrom && current < condition.from) return false;
        if (hasTo && current > condition.to) return false;
      }
      return true;
    }
    case "file_pattern": {
      if (!event.path) return false;
      try {
        const re = new RegExp(condition.pattern, "i");
        return re.test(event.path);
      } catch {
        return false;
      }
    }
    case "idle_duration": {
      if (!context || !context.lastActiveTime) return false;
      const idleMs = Date.now() - context.lastActiveTime;
      const thresholdMs = (condition.minutes || 5) * 60 * 1000;
      return idleMs >= thresholdMs;
    }
    case "context_keyword": {
      if (!condition.keywords || !Array.isArray(condition.keywords)) return false;
      const text = [
        context?.currentApp,
        context?.currentTitle,
        ...(context?.recentFiles || []).map((f) => f.path),
      ].filter(Boolean).join(" ");
      if (!text) return false;
      const lower = text.toLowerCase();
      return condition.keywords.some((kw) => lower.includes(String(kw).toLowerCase()));
    }
    case "rich_context_keyword": {
      if (!condition.keywords || !Array.isArray(condition.keywords)) return false;
      const text = [
        context?.richContext?.l2?.fileContent,
        context?.richContext?.l2?.clipboard,
        context?.richContext?.l3?.visualDescription,
      ].filter(Boolean).join(" ");
      if (!text) return false;
      const lower = text.toLowerCase();
      return condition.keywords.some((kw) => lower.includes(String(kw).toLowerCase()));
    }
    default:
      return false;
  }
}

/**
 * 评估规则所有条件
 * @param {object} rule
 * @param {object} event
 * @param {object} context
 * @returns {boolean}
 */
function matchRule(rule, event, context) {
  if (!rule.enabled) return false;
  if (!rule.conditions || rule.conditions.length === 0) return false;

  const results = rule.conditions.map((c) => matchCondition(c, event, context));
  if (rule.matchMode === "any") {
    return results.some(Boolean);
  }
  return results.every(Boolean); // 默认 "all"
}

/**
 * 检查冷却
 * @param {object} rule
 * @returns {boolean} true = 仍在冷却中，应跳过
 */
function isInCooldown(rule) {
  if (!rule.lastTriggered || !rule.action?.cooldownMinutes) return false;
  const elapsed = Date.now() - rule.lastTriggered;
  return elapsed < rule.action.cooldownMinutes * 60 * 1000;
}

// ── 规则验证 ──

/**
 * 验证规则结构
 * @param {object} rule
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRule(rule) {
  const errors = [];
  if (!rule || typeof rule !== "object") {
    return { valid: false, errors: ["rule must be an object"] };
  }
  if (!rule.id || typeof rule.id !== "string") {
    errors.push("rule.id is required and must be a string");
  }
  if (!rule.name || typeof rule.name !== "string") {
    errors.push("rule.name is required and must be a string");
  }
  if (rule.enabled !== undefined && typeof rule.enabled !== "boolean") {
    errors.push("rule.enabled must be a boolean if provided");
  }
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    errors.push("rule.conditions must be a non-empty array");
  } else {
    const SUPPORTED_CONDITION_TYPES = new Set([
      "app_pattern", "time_guard", "file_pattern", "idle_duration", "context_keyword", "rich_context_keyword",
    ]);
    for (let i = 0; i < rule.conditions.length; i++) {
      const c = rule.conditions[i];
      if (!c.type) {
        errors.push(`conditions[${i}].type is required`);
      } else if (!SUPPORTED_CONDITION_TYPES.has(c.type)) {
        errors.push(
          `conditions[${i}].type '${c.type}' is not supported. ` +
          `Valid types: ${[...SUPPORTED_CONDITION_TYPES].join(", ")}`,
        );
      }
      if (c.type === "time_guard") {
        if (c.from && !/^\d{2}:\d{2}$/.test(c.from)) {
          errors.push(`conditions[${i}].from must be HH:MM format`);
        }
        if (c.to && !/^\d{2}:\d{2}$/.test(c.to)) {
          errors.push(`conditions[${i}].to must be HH:MM format`);
        }
      }
      if (c.type === "app_pattern" || c.type === "file_pattern") {
        if (!c.pattern) {
          errors.push(`conditions[${i}].pattern is required for ${c.type}`);
        } else if (c.pattern.length > 200) {
          errors.push(`conditions[${i}].pattern exceeds maximum length of 200 characters`);
        } else {
          try { new RegExp(c.pattern); } catch {
            errors.push(`conditions[${i}].pattern is invalid regex`);
          }
        }
      }
    }
  }
  if (rule.matchMode && rule.matchMode !== "all" && rule.matchMode !== "any") {
    errors.push("rule.matchMode must be 'all' or 'any'");
  }
  if (!rule.action || typeof rule.action !== "object") {
    errors.push("rule.action is required");
  } else {
    if (rule.action.type !== "trigger_agent") {
      errors.push("rule.action.type must be 'trigger_agent'");
    }
    if (!rule.action.prompt || typeof rule.action.prompt !== "string") {
      errors.push("rule.action.prompt is required and must be a string");
    }
    if (rule.action.cooldownMinutes !== undefined && typeof rule.action.cooldownMinutes !== "number") {
      errors.push("rule.action.cooldownMinutes must be a number if provided");
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── 规则引擎主类 ──

export class ProactiveRuleEngine {
  /**
   * @param {object} opts
   * @param {import('../../hub/event-bus.js').EventBus} opts.eventBus
   * @param {import('../context/user-context-tracker.js').UserContextTracker} [opts.userContextTracker]
   * @param {Function} opts.executeAction  (prompt, meta) => void  触发 Agent 动作
   * @param {object[]} [opts.customRules=[]]  用户自定义规则
   * @param {object} [opts.builtinOverrides={}]  内置规则 enabled 覆盖 { ruleId: false }
   */
  constructor({ eventBus, userContextTracker, executeAction, customRules, builtinOverrides }) {
    this._eventBus = eventBus;
    this._userContextTracker = userContextTracker || null;
    this._executeAction = executeAction || (() => {});
    this._running = false;
    this._unsubscribers = [];

    // 规则表：内置 + 用户自定义
    this._rules = [];
    this._loadBuiltinRules(builtinOverrides || {});
    if (Array.isArray(customRules)) {
      for (const rule of customRules) {
        if (validateRule(rule).valid) {
          rule.lastTriggered = null;
          this._rules.push(rule);
        }
      }
    }
  }

  // ──────────── 生命周期 ────────────

  start() {
    if (this._running) return;

    const unsubs = [
      this._eventBus.subscribe(
        this._onEvent.bind(this),
        { types: ["window_focus_changed", "file_system_changed"] },
      ),
    ];

    // subscribe 成功后才标记为已启动
    this._running = true;
    this._unsubscribers = unsubs;
    log.log(`规则引擎已启动，共 ${this._rules.length} 条规则`);
  }

  stop() {
    this._running = false;
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
    log.log("规则引擎已停止");
  }

  // ──────────── 事件处理 ────────────

  _onEvent(event) {
    if (!this._running) return;
    const context = this._userContextTracker?.getContextSnapshot() || null;
    const matched = this.evaluate(event, context);
    for (const rule of matched) {
      this._fireAction(rule, event);
    }
  }

  /**
   * 评估事件与上下文，返回匹配的规则列表
   * @param {object} event
   * @param {object|null} context
   * @returns {object[]}
   */
  evaluate(event, context) {
    const matched = [];
    for (const rule of this._rules) {
      if (!rule.enabled) continue;
      if (isInCooldown(rule)) {
        log.log(`[debug] 规则 [${rule.id}] 冷却中，跳过`);
        continue;
      }
      if (matchRule(rule, event, context)) {
        matched.push(rule);
      }
    }
    return matched;
  }

  /**
   * 执行规则动作（内部使用）
   * @param {object} rule
   * @param {object} event
   */
  async _fireAction(rule, event) {
    const action = rule.action;
    if (!action || action.type !== "trigger_agent") return;

    log.log(`规则触发: [${rule.id}] ${rule.name}`);

    try {
      // _executeAction 可能是异步操作，await 确保完成后再标记冷却
      await this._executeAction(action.prompt, {
        ruleId: rule.id,
        ruleName: rule.name,
        event,
      });
      // 仅在执行成功后标记触发时间，避免失败后进入冷却期无法重试
      rule.lastTriggered = Date.now();

      // 仅在执行成功后才通知事件总线
      this._eventBus?.emit({
        type: "proactive_action_triggered",
        ruleId: rule.id,
        ruleName: rule.name,
        prompt: action.prompt,
        event: { type: event.type, app: event.app, title: event.title, path: event.path },
        timestamp: Date.now(),
      }, null);
    } catch (err) {
      log.warn(`规则动作执行失败: [${rule.id}] ${err.message}`);
    }
  }

  /**
   * 测试规则（dry-run），不触发动作，仅返回是否匹配
   * @param {object} rule
   * @param {object} event
   * @returns {{ matched: boolean, conditions: { type: string, matched: boolean }[] }}
   */
  testRule(rule, event) {
    const context = this._userContextTracker?.getContextSnapshot() || null;
    const conditionResults = (rule.conditions || []).map((c) => ({
      type: c.type,
      matched: matchCondition(c, event, context),
    }));
    const matched = rule.matchMode === "any"
      ? conditionResults.some((r) => r.matched)
      : conditionResults.every((r) => r.matched);
    return { matched, conditions: conditionResults };
  }

  // ──────────── 规则管理 ────────────

  _loadBuiltinRules(builtinOverrides = {}) {
    for (const rule of BUILT_IN_RULES) {
      const override = builtinOverrides[rule.id];
      this._rules.push({ ...rule, lastTriggered: null, enabled: override === false ? false : rule.enabled });
    }
  }

  /**
   * 新增自定义规则
   * @param {object} rule
   * @returns {{ ok: boolean, errors?: string[] }}
   */
  addRule(rule) {
    const v = validateRule(rule);
    if (!v.valid) return { ok: false, errors: v.errors };
    if (this._rules.some((r) => r.id === rule.id)) {
      return { ok: false, errors: [`rule id '${rule.id}' already exists`] };
    }
    this._rules.push({ ...rule, lastTriggered: null });
    return { ok: true };
  }

  /**
   * 删除自定义规则（内置规则不可删）
   * @param {string} id
   * @returns {{ ok: boolean, errors?: string[] }}
   */
  removeRule(id) {
    const idx = this._rules.findIndex((r) => r.id === id && !r.builtIn);
    if (idx === -1) return { ok: false, errors: ["rule not found or is built-in"] };
    this._rules.splice(idx, 1);
    return { ok: true };
  }

  /**
   * 更新规则（仅自定义规则可更新）
   * @param {string} id
   * @param {object} patch
   * @returns {{ ok: boolean, errors?: string[] }}
   */
  updateRule(id, patch) {
    const rule = this._rules.find((r) => r.id === id);
    if (!rule) return { ok: false, errors: ["rule not found"] };
    if (rule.builtIn) {
      // 内置规则仅允许 enabled 切换
      if (Object.keys(patch).length === 1 && "enabled" in patch) {
        rule.enabled = !!patch.enabled;
        return { ok: true };
      }
      return { ok: false, errors: ["built-in rules can only toggle enabled"] };
    }
    const candidate = { ...rule, ...patch, id: rule.id, lastTriggered: rule.lastTriggered };
    const v = validateRule(candidate);
    if (!v.valid) return { ok: false, errors: v.errors };
    Object.assign(rule, patch);
    return { ok: true };
  }

  /**
   * 获取全部规则（内置+自定义）
   * @returns {object[]}
   */
  getRules() {
    return this._rules.map((r) => ({
      id: r.id,
      name: r.name,
      builtIn: !!r.builtIn,
      enabled: r.enabled,
      conditions: [...r.conditions],
      matchMode: r.matchMode || "all",
      action: { ...r.action },
      lastTriggered: r.lastTriggered,
    }));
  }

  /**
   * 重载用户自定义规则（替换所有非内置规则）
   * @param {object[]} customRules
   */
  reloadCustomRules(customRules) {
    // 保留内置规则及其冷却状态
    const builtinRules = this._rules.filter((r) => r.builtIn);
    
    // 保留已触发的自定义规则的冷却状态（如果 ID 仍存在）
    const oldCustomRules = this._rules.filter((r) => !r.builtIn);
    
    this._rules = [...builtinRules];
    
    if (Array.isArray(customRules)) {
      for (const rule of customRules) {
        if (validateRule(rule).valid) {
          // 尝试保留旧的冷却状态
          const oldRule = oldCustomRules.find(r => r.id === rule.id);
          this._rules.push({
            ...rule,
            lastTriggered: oldRule ? oldRule.lastTriggered : null,
          });
        }
      }
    }
    log.log(`规则已重载，共 ${this._rules.length} 条规则`);
  }
}
