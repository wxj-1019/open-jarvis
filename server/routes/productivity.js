/**
 * productivity.js — Productivity API routes
 *
 * GET  /api/productivity/daily       — Get daily report
 * GET  /api/productivity/weekly      — Get weekly report
 * GET  /api/productivity/suggestions — Get suggestions
 */

import { Hono } from "hono";

/**
 * @param {import('../../core/engine.js').HanaEngine} engine
 * @param {import('../../hub/index.js').Hub} hub
 */
export function createProductivityRoute(engine, hub) {
  const route = new Hono();

  /** Get ProductivityAnalyzer and AgentSuggestionEngine from scheduler */
  function getComponents() {
    const scheduler = hub?.scheduler;
    return {
      analyzer: scheduler?._productivityAnalyzer ?? null,
      suggestionEngine: scheduler?._suggestionEngine ?? null,
    };
  }

  /**
   * 验证日期字符串是否有效
   * @param {string|undefined} dateStr
   * @returns {Date|null}
   */
  function parseDate(dateStr) {
    if (!dateStr) return new Date();
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null; // 无效日期
    }
    return date;
  }

  // ── GET /api/productivity/daily ──
  route.get("/daily", async (c) => {
    const { analyzer } = getComponents();
    if (!analyzer) return c.json({ error: "productivity analyzer not available" }, 503);

    try {
      const date = parseDate(c.req.query("date"));
      if (!date) return c.json({ error: "invalid date format" }, 400);
      const report = await analyzer.generateDailyReport(date);
      return c.json(report);
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ── GET /api/productivity/weekly ──
  route.get("/weekly", async (c) => {
    const { analyzer } = getComponents();
    if (!analyzer) return c.json({ error: "productivity analyzer not available" }, 503);

    try {
      const weekStart = parseDate(c.req.query("weekStart"));
      if (!weekStart) return c.json({ error: "invalid date format" }, 400);
      const report = await analyzer.generateWeeklyReport(weekStart);
      return c.json(report);
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  // ── GET /api/productivity/suggestions ──
  route.get("/suggestions", async (c) => {
    const { analyzer, suggestionEngine } = getComponents();
    if (!analyzer || !suggestionEngine) {
      return c.json({ error: "productivity engine not available" }, 503);
    }

    try {
      const date = parseDate(c.req.query("date"));
      if (!date) return c.json({ error: "invalid date format" }, 400);
      const report = await analyzer.generateDailyReport(date);
      const suggestions = suggestionEngine.generateSuggestions(report, date);

      return c.json({
        suggestions,
        stats: suggestionEngine.getTodayStats(date),
      });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  return route;
}
