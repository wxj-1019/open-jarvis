import { describe, it, expect } from "vitest";
import { RuleSuggestionEngine } from "../../lib/context/rule-suggestion-engine.js";

describe("RuleSuggestionEngine", () => {
  const engine = new RuleSuggestionEngine();

  it("should generate sequence suggestion", () => {
    const pattern = {
      sequence: ["coding|morning|1", "browsing|morning|1"],
      support: 5,
      length: 2,
    };

    const suggestion = engine.generateSuggestion(pattern);

    expect(suggestion).not.toBeNull();
    expect(suggestion.type).toBe("sequence");
    expect(suggestion.confidence).toBeGreaterThan(0);
    expect(suggestion.rule.conditions[0].type).toBe("app_pattern");
  });

  it("should generate time-based suggestion", () => {
    const pattern = {
      hour: 9,
      category: "coding",
      confidence: 0.8,
    };

    const suggestion = engine.generateSuggestion(pattern);

    expect(suggestion).not.toBeNull();
    expect(suggestion.type).toBe("time_based");
    expect(suggestion.rule.conditions[0].type).toBe("time_guard");
  });

  it("should filter low confidence suggestions", () => {
    const patterns = [
      { sequence: ["a|b|c", "d|e|f"], support: 100, length: 2 },
      { hour: 9, category: "coding", confidence: 0.1 },
    ];

    const suggestions = engine.generateSuggestions(patterns);

    expect(suggestions.length).toBe(1);
    expect(suggestions[0].confidence).toBeGreaterThan(0.3);
  });

  it("should return null for unknown pattern type", () => {
    const suggestion = engine.generateSuggestion({ unknown: true });
    expect(suggestion).toBeNull();
  });
});
