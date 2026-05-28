import { describe, it, expect } from "vitest";
import { AgentSuggestionEngine } from "../lib/context/agent-suggestion-engine.js";

describe("AgentSuggestionEngine", () => {
  const engine = new AgentSuggestionEngine({
    maxSuggestionsPerDay: 3,
    minConfidence: 0.6,
  });

  it("should generate suggestion from high context switches", () => {
    const report = {
      contextSwitches: 35,
      workTypes: {
        deep: { percentage: 30 },
        interruption: { percentage: 40 },
      },
      interruptions: [{ app: "Slack.exe", duration: 1800000 }],
    };

    const suggestions = engine.generateSuggestions(report);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].type).toBe("interruption_warning");
  });

  it("should suggest peak hour utilization", () => {
    engine.reset();
    const report = {
      contextSwitches: 10,
      peakHours: [{ hour: 9, duration: 3600000 }, { hour: 14, duration: 3000000 }],
      workTypes: { deep: { percentage: 25 } },
      interruptions: [],
    };

    const suggestions = engine.generateSuggestions(report);

    const peakSuggestion = suggestions.find((s) => s.type === "peak_hour");
    expect(peakSuggestion).toBeDefined();
  });

  it("should respect daily suggestion limit", () => {
    engine.reset();
    // Simulate 3 suggestions already sent today
    engine._suggestionCount.set("2026-05-25", 3);

    const report = { contextSwitches: 50, workTypes: {}, interruptions: [] };
    const suggestions = engine.generateSuggestions(report, new Date("2026-05-25"));

    expect(suggestions.length).toBe(0);
  });

  it("should reset count for new day", () => {
    engine.reset();
    engine._suggestionCount.set("2026-05-24", 5);

    const report = {
      contextSwitches: 50,
      workTypes: { deep: { percentage: 20 } },
      interruptions: [],
    };
    const suggestions = engine.generateSuggestions(report, new Date("2026-05-25"));

    // New day should allow suggestions
    expect(suggestions.length).toBeGreaterThan(0);
    expect(engine._suggestionCount.get("2026-05-25") ?? 0).toBeLessThanOrEqual(3);
  });

  it("should not suggest for low context switches", () => {
    engine.reset();
    const report = {
      contextSwitches: 5,
      workTypes: { deep: { percentage: 80 } },
      interruptions: [],
    };

    const suggestions = engine.generateSuggestions(report);

    expect(suggestions.length).toBe(0);
  });

  it("should return today stats", () => {
    engine.reset();
    const stats = engine.getTodayStats();
    expect(stats.limit).toBe(3);
    expect(stats.remaining).toBe(3);
    expect(stats.count).toBe(0);
  });
});
