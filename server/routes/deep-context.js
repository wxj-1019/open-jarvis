/**
 * deep-context.js — 深度上下文管道 API
 *
 * GET  /api/deep-context                — 获取当前富上下文快照
 * GET  /api/deep-context/privacy        — 获取当前隐私级别
 * PUT  /api/deep-context/privacy        — 设置隐私级别 { level: "minimal"|"standard"|"full" }
 * POST /api/deep-context/visual-capture — 请求 L3 视觉捕获（需 full 隐私级别）
 * GET  /api/deep-context/adapters       — 获取已注册的适配器列表
 */

import { Hono } from "hono";

const VALID_PRIVACY_LEVELS = ["minimal", "standard", "full"];

/**
 * @param {import('../../core/engine.js').HanaEngine} engine
 * @param {import('../../hub/index.js').Hub} hub
 */
export function createDeepContextRoute(engine, hub) {
  const route = new Hono();

  /** 获取 DeepContextPipeline 实例 */
  function getPipeline() {
    return hub?.scheduler?.deepContextPipeline || null;
  }

  /** 获取 PreferencesManager */
  function getPrefs() {
    return engine.preferences || null;
  }

  // ── GET /api/deep-context ──
  route.get("/", (c) => {
    const pipeline = getPipeline();
    if (!pipeline) return c.json({ error: "deep context pipeline not available" }, 503);

    const rich = pipeline.getRichContext();
    return c.json({
      context: rich,
      privacyLevel: pipeline._privacyLevel,
    });
  });

  // ── GET /api/deep-context/privacy ──
  route.get("/privacy", (c) => {
    const pipeline = getPipeline();
    if (!pipeline) return c.json({ error: "deep context pipeline not available" }, 503);

    return c.json({
      level: pipeline._privacyLevel,
      levels: VALID_PRIVACY_LEVELS,
      description: {
        minimal: "仅采集窗口焦点信息（L1）",
        standard: "窗口焦点 + 文件/剪贴板内容（L1+L2）",
        full: "全部采集，包括视觉截图分析（L1+L2+L3）",
      },
    });
  });

  // ── PUT /api/deep-context/privacy ──
  route.put("/privacy", async (c) => {
    const pipeline = getPipeline();
    if (!pipeline) return c.json({ error: "deep context pipeline not available" }, 503);

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.level) {
      return c.json({ error: "missing 'level' field" }, 400);
    }

    if (!VALID_PRIVACY_LEVELS.includes(body.level)) {
      return c.json({
        error: `invalid level '${body.level}', must be one of: ${VALID_PRIVACY_LEVELS.join(", ")}`,
      }, 400);
    }

    const oldLevel = pipeline._privacyLevel;
    pipeline.setPrivacyLevel(body.level);

    // 持久化到 preferences
    const prefs = getPrefs();
    if (prefs && typeof prefs.get === "function") {
      const fullPrefs = prefs.getPreferences();
      fullPrefs.context_privacy = body.level;
      prefs.savePreferences(fullPrefs);
    }

    return c.json({
      ok: true,
      previousLevel: oldLevel,
      currentLevel: body.level,
    });
  });

  // ── POST /api/deep-context/visual-capture ──
  route.post("/visual-capture", async (c) => {
    const pipeline = getPipeline();
    if (!pipeline) return c.json({ error: "deep context pipeline not available" }, 503);

    if (pipeline._privacyLevel !== "full") {
      return c.json({
        error: "visual capture requires 'full' privacy level",
        currentLevel: pipeline._privacyLevel,
      }, 403);
    }

    const result = await pipeline.requestVisualCapture();
    if (!result) {
      return c.json({
        ok: false,
        message: "L3 视觉捕获暂未实现（Phase 4）",
        l3Available: false,
      }, 501);
    }

    return c.json({ ok: true, l3: result });
  });

  // ── GET /api/deep-context/adapters ──
  route.get("/adapters", (c) => {
    const pipeline = getPipeline();
    if (!pipeline) return c.json({ error: "deep context pipeline not available" }, 503);

    const adapters = pipeline._adapters.map((a) => ({
      name: a.name,
    }));
    return c.json({ adapters });
  });

  return route;
}
