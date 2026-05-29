import { describe, it, expect } from "vitest";
import { UsageStatistics } from "../lib/context/usage-statistics.js";

describe("UsageStatistics", () => {
  const mockStore = {
    getAppDurationStats: () => ({
      "Code.exe": 3600000,
      "chrome.exe": 1800000,
    }),
    getSwitchCount: () => 25,
    queryRange: () => [
      { app: "Code.exe", timestamp: Date.now() - 3600000, duration_ms: 1800000 },
      { app: "Code.exe", timestamp: Date.now() - 1800000, duration_ms: 1800000 },
      { app: "chrome.exe", timestamp: Date.now() - 3600000, duration_ms: 1800000 },
    ],
  };

  const stats = new UsageStatistics({ store: mockStore });

  it("should calculate daily stats", async () => {
    const result = await stats.getDailyStats();

    expect(result.totalDuration).toBe(5400000);
    expect(result.appBreakdown["Code.exe"]).toBe(3600000);
    expect(result.switchCount).toBe(25);
  });

  it("should identify deep work periods", () => {
    const events = [
      { app: "Code.exe", timestamp: Date.now() - 3600000, duration_ms: 2400000 },
      { app: "Code.exe", timestamp: Date.now() - 1200000, duration_ms: 1200000 },
    ];

    const periods = stats.findDeepWorkPeriods(events, 30);
    expect(periods.length).toBe(1);
    expect(periods[0].duration).toBeGreaterThanOrEqual(2400000);
  });

  it("should categorize apps", () => {
    expect(stats.categorizeApp("Code.exe")).toBe("coding");
    expect(stats.categorizeApp("chrome.exe")).toBe("browsing");
    expect(stats.categorizeApp("Slack.exe")).toBe("communication");
  });

  it("should categorize unknown apps as other", () => {
    expect(stats.categorizeApp("UnknownApp.exe")).toBe("other");
  });

  it("should return empty deep work for no events", () => {
    expect(stats.findDeepWorkPeriods([], 30)).toEqual([]);
    expect(stats.findDeepWorkPeriods(null, 30)).toEqual([]);
  });

  it("should not count short periods as deep work", () => {
    const events = [
      { app: "Code.exe", timestamp: Date.now() - 600000, duration_ms: 600000 },
    ];
    // 10 minutes < 30 minute threshold
    expect(stats.findDeepWorkPeriods(events, 30)).toEqual([]);
  });
});
