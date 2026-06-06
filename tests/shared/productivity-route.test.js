import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createProductivityRoute } from "../../server/routes/productivity.js";

describe("Productivity Routes", () => {
  const mockAnalyzer = {
    generateDailyReport: vi.fn().mockResolvedValue({
      date: "2026-05-28",
      totalDuration: 3600000,
      contextSwitches: 10,
      workTypes: { deep: { percentage: 60 } },
    }),
    generateWeeklyReport: vi.fn().mockResolvedValue({
      weekStart: "2026-05-25",
      dailyReports: [],
      summary: { avgDailyDuration: 3600000 },
    }),
  };

  const mockSuggestionEngine = {
    generateSuggestions: vi.fn().mockReturnValue([
      { type: "test", message: "Test suggestion", confidence: 0.8, action: "test_action" },
    ]),
    getTodayStats: vi.fn().mockReturnValue({ count: 1, limit: 3, remaining: 2 }),
  };

  const mockHub = {
    scheduler: {
      _productivityAnalyzer: mockAnalyzer,
      _suggestionEngine: mockSuggestionEngine,
    },
  };

  const app = new Hono();
  app.route("/api/productivity", createProductivityRoute({}, mockHub));

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mocks after clear
    mockAnalyzer.generateDailyReport.mockResolvedValue({
      date: "2026-05-28",
      totalDuration: 3600000,
      contextSwitches: 10,
      workTypes: { deep: { percentage: 60 } },
    });
    mockAnalyzer.generateWeeklyReport.mockResolvedValue({
      weekStart: "2026-05-25",
      dailyReports: [],
      summary: { avgDailyDuration: 3600000 },
    });
    mockSuggestionEngine.generateSuggestions.mockReturnValue([
      { type: "test", message: "Test suggestion", confidence: 0.8, action: "test_action" },
    ]);
    mockSuggestionEngine.getTodayStats.mockReturnValue({ count: 1, limit: 3, remaining: 2 });
  });

  it("should return daily report", async () => {
    const res = await app.request("/api/productivity/daily");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-05-28");
    expect(body.totalDuration).toBe(3600000);
  });

  it("should return weekly report", async () => {
    const res = await app.request("/api/productivity/weekly");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.weekStart).toBe("2026-05-25");
  });

  it("should return suggestions", async () => {
    const res = await app.request("/api/productivity/suggestions");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions.length).toBe(1);
    expect(body.stats.limit).toBe(3);
  });

  it("should return 503 when analyzer not available", async () => {
    const emptyApp = new Hono();
    emptyApp.route("/api/productivity", createProductivityRoute({}, { scheduler: {} }));

    const res = await emptyApp.request("/api/productivity/daily");
    expect(res.status).toBe(503);
  });
});
