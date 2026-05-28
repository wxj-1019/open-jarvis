import { describe, it, expect, vi } from "vitest";
import { ProductivityAnalyzer } from "../lib/context/productivity-analyzer.js";

describe("ProductivityAnalyzer", () => {
  const mockStore = {
    queryRange: vi.fn().mockReturnValue([
      { app: "Code.exe", timestamp: Date.now() - 3600000, duration_ms: 1800000 },
      { app: "Code.exe", timestamp: Date.now() - 1800000, duration_ms: 1800000 },
      { app: "chrome.exe", timestamp: Date.now() - 3600000, duration_ms: 1200000 },
      { app: "Slack.exe", timestamp: Date.now() - 1200000, duration_ms: 600000 },
    ]),
    getAppDurationStats: vi.fn().mockReturnValue({
      "Code.exe": 3600000,
      "chrome.exe": 1200000,
      "Slack.exe": 600000,
    }),
    getSwitchCount: vi.fn().mockReturnValue(6),
  };

  const analyzer = new ProductivityAnalyzer({ store: mockStore });

  it("should generate daily report", async () => {
    const report = await analyzer.generateDailyReport();

    expect(report.date).toBeDefined();
    expect(report.totalDuration).toBe(5400000);
    expect(report.appDistribution).toBeDefined();
    expect(report.contextSwitches).toBe(6);
  });

  it("should categorize deep vs shallow work", async () => {
    const report = await analyzer.generateDailyReport();

    expect(report.workTypes.deep.duration).toBeGreaterThan(0);
    expect(report.workTypes.shallow.duration).toBeGreaterThanOrEqual(0);
    expect(report.workTypes.interruption.duration).toBeGreaterThanOrEqual(0);
  });

  it("should identify peak hours", async () => {
    const report = await analyzer.generateDailyReport();

    expect(report.peakHours).toBeDefined();
    expect(Array.isArray(report.peakHours)).toBe(true);
  });

  it("should calculate app distribution percentages", async () => {
    const report = await analyzer.generateDailyReport();

    expect(report.appDistribution.length).toBe(3);
    expect(report.appDistribution[0].app).toBe("Code.exe");
    expect(report.appDistribution[0].percentage).toBeGreaterThan(0);
  });

  it("should generate weekly report with 7 daily reports", async () => {
    const report = await analyzer.generateWeeklyReport();

    expect(report.weekStart).toBeDefined();
    expect(report.dailyReports.length).toBe(7);
    expect(report.summary).toBeDefined();
    expect(typeof report.summary.avgDailyDuration).toBe("number");
  });

  it("should identify interruptions", async () => {
    const report = await analyzer.generateDailyReport();

    expect(Array.isArray(report.interruptions)).toBe(true);
    // Slack is categorized as communication → interruption
    expect(report.interruptions.length).toBeGreaterThan(0);
  });
});
