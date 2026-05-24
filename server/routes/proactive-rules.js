/**
 * proactive-rules.js — 主动介入规则管理 API
 *
 * GET    /api/proactive/rules          — 获取全部规则（内置+自定义）
 * POST   /api/proactive/rules          — 新增自定义规则
 * PATCH  /api/proactive/rules/:id      — 更新规则
 * DELETE /api/proactive/rules/:id      — 删除自定义规则
 * POST   /api/proactive/rules/:id/test — 测试规则（dry-run）
 */

import { Hono } from "hono";
import { validateRule } from "../../lib/proactive/proactive-rule-engine.js";

/**
 * @param {import('../../core/engine.js').HanaEngine} engine
 * @param {import('../../hub/index.js').Hub} hub
 */
export function createProactiveRulesRoute(engine, hub) {
  const route = new Hono();

  /** 获取 RuleEngine 实例 */
  function getRuleEngine() {
    return hub?.ruleEngine || null;
  }

  /** 获取 PreferencesManager */
  function getPrefs() {
    return engine.preferences || null;
  }

  // ── GET /api/proactive/rules ──
  route.get("/rules", (c) => {
    const re = getRuleEngine();
    if (!re) return c.json({ error: "rule engine not available" }, 503);
    return c.json({ rules: re.getRules() });
  });

  // ── POST /api/proactive/rules ──
  route.post("/rules", async (c) => {
    const re = getRuleEngine();
    if (!re) return c.json({ error: "rule engine not available" }, 503);

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    // 生成 ID（如果未提供）
    if (!body.id) {
      body.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // 标记非内置
    body.builtIn = false;
    if (typeof body.enabled !== "boolean") body.enabled = true;
    if (!body.matchMode) body.matchMode = "all";
    if (!body.lastTriggered) body.lastTriggered = null;

    const v = validateRule(body);
    if (!v.valid) {
      return c.json({ error: "validation failed", details: v.errors }, 400);
    }

    const result = re.addRule(body);
    if (!result.ok) {
      return c.json({ error: result.errors?.[0] || "add rule failed" }, 409);
    }

    // 持久化自定义规则
    _persistCustomRules(re, getPrefs());

    return c.json({ ok: true, rule: re.getRules().find((r) => r.id === body.id) }, 201);
  });

  // ── PATCH /api/proactive/rules/:id ──
  route.patch("/rules/:id", async (c) => {
    const re = getRuleEngine();
    if (!re) return c.json({ error: "rule engine not available" }, 503);

    const id = c.req.param("id");
    const patch = await c.req.json().catch(() => null);
    if (!patch || typeof patch !== "object") {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    // 禁止修改 id 和 builtIn
    delete patch.id;
    delete patch.builtIn;

    const result = re.updateRule(id, patch);
    if (!result.ok) {
      return c.json({ error: result.errors?.[0] || "update failed" }, 400);
    }

    // 持久化
    _persistCustomRules(re, getPrefs());

    return c.json({ ok: true, rule: re.getRules().find((r) => r.id === id) });
  });

  // ── DELETE /api/proactive/rules/:id ──
  route.delete("/rules/:id", (c) => {
    const re = getRuleEngine();
    if (!re) return c.json({ error: "rule engine not available" }, 503);

    const id = c.req.param("id");
    const result = re.removeRule(id);
    if (!result.ok) {
      return c.json({ error: result.errors?.[0] || "rule not found or is built-in" }, 404);
    }

    // 持久化
    _persistCustomRules(re, getPrefs());

    return c.json({ ok: true });
  });

  // ── POST /api/proactive/rules/:id/test ──
  route.post("/rules/:id/test", async (c) => {
    const re = getRuleEngine();
    if (!re) return c.json({ error: "rule engine not available" }, 503);

    const id = c.req.param("id");
    const rules = re.getRules();
    const rule = rules.find((r) => r.id === id);
    if (!rule) return c.json({ error: "rule not found" }, 404);

    // 用户提供模拟事件
    const body = await c.req.json().catch(() => null);
    const mockEvent = {
      type: body?.type || "window_focus_changed",
      app: body?.app || "",
      title: body?.title || "",
      path: body?.path || "",
      timestamp: Date.now(),
    };

    const result = re.testRule(rule, mockEvent);
    return c.json({ ruleId: id, ...result });
  });

  return route;
}

/**
 * 持久化自定义规则 + 内置规则 enabled 覆盖到 preferences.json（单次原子写入）
 * @param {import('../../lib/proactive/proactive-rule-engine.js').ProactiveRuleEngine} re
 * @param {import('../../core/preferences-manager.js').PreferencesManager|null} prefs
 */
function _persistCustomRules(re, prefs) {
  if (!prefs) return;
  const all = re.getRules();

  // 自定义规则
  const custom = all.filter((r) => !r.builtIn).map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    conditions: r.conditions,
    matchMode: r.matchMode,
    action: r.action,
  }));

  // 内置规则 enabled 覆盖（仅保存被禁用的）
  const builtinOverrides = {};
  for (const r of all) {
    if (r.builtIn && !r.enabled) {
      builtinOverrides[r.id] = false;
    }
  }

  // 单次原子写入：构建完整 prefs 对象后一次性 save
  const fullPrefs = prefs.getPreferences();
  fullPrefs.proactive_rules = custom.filter(
    (r) => r && typeof r === "object" && typeof r.id === "string",
  );
  if (Object.keys(builtinOverrides).length > 0) {
    fullPrefs.proactive_builtin_overrides = builtinOverrides;
  } else {
    delete fullPrefs.proactive_builtin_overrides;
  }
  prefs.savePreferences(fullPrefs);
}
