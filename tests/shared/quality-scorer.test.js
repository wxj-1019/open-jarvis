import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createQualityScorer,
  scoreSpecificity,
  scoreRecency,
  scoreRelevance,
  scoreConsistency,
  scoreUsage,
  computeCompositeScore,
} from "../../lib/memory/quality-scorer.js";

describe("scoreSpecificity", () => {
  it("returns low score for very short/vague facts", () => {
    expect(scoreSpecificity("ok")).toBeLessThan(30);
    expect(scoreSpecificity("yes")).toBeLessThan(30);
    expect(scoreSpecificity("I like things")).toBeLessThan(30);
  });

  it("returns medium score for moderate facts", () => {
    const score = scoreSpecificity("I like programming");
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThanOrEqual(60);
  });

  it("returns high score for detailed/specific facts", () => {
    const score = scoreSpecificity(
      "I prefer TypeScript over JavaScript because of static typing, and I use React with Next.js for frontend projects",
    );
    expect(score).toBeGreaterThan(60);
  });

  it("rewards facts with concrete entities (names, numbers, dates)", () => {
    const score = scoreSpecificity(
      "My birthday is March 15, 1990 and I live in Tokyo, Japan",
    );
    expect(score).toBeGreaterThan(50);
  });

  it("handles empty or null input gracefully", () => {
    expect(scoreSpecificity("")).toBeLessThanOrEqual(0);
    expect(scoreSpecificity(null)).toBeLessThanOrEqual(0);
    expect(scoreSpecificity(undefined)).toBeLessThanOrEqual(0);
  });

  it("caps score between 0 and 100", () => {
    expect(scoreSpecificity("a")).toBeGreaterThanOrEqual(0);
    expect(scoreSpecificity("a")).toBeLessThanOrEqual(100);
    const veryLong = "x".repeat(500);
    expect(scoreSpecificity(veryLong)).toBeLessThanOrEqual(100);
  });
});

describe("scoreRecency", () => {
  const now = Date.now();
  const ONE_DAY = 86400000;
  const ONE_MONTH = 30 * ONE_DAY;
  const ONE_YEAR = 365 * ONE_DAY;

  it("returns high score for very recent memories", () => {
    const recent = new Date(now - ONE_DAY).toISOString();
    expect(scoreRecency(recent, now)).toBeGreaterThan(80);
  });

  it("returns medium score for memories from a month ago", () => {
    const monthOld = new Date(now - ONE_MONTH).toISOString();
    const score = scoreRecency(monthOld, now);
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThanOrEqual(70);
  });

  it("returns low score for very old memories", () => {
    const yearOld = new Date(now - ONE_YEAR).toISOString();
    expect(scoreRecency(yearOld, now)).toBeLessThan(30);
  });

  it("handles future dates gracefully", () => {
    const future = new Date(now + ONE_DAY).toISOString();
    expect(scoreRecency(future, now)).toBeGreaterThanOrEqual(0);
    expect(scoreRecency(future, now)).toBeLessThanOrEqual(100);
  });

  it("caps score between 0 and 100", () => {
    expect(scoreRecency(new Date().toISOString(), now)).toBeLessThanOrEqual(100);
    const veryOld = new Date(0).toISOString();
    expect(scoreRecency(veryOld, now)).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreRelevance", () => {
  const userTags = ["identity", "preference", "interest", "health", "relationship", "work"];

  it("returns high score for identity-related memories", () => {
    const fact = { tags: ["identity"] };
    expect(scoreRelevance(fact, userTags)).toBeGreaterThan(70);
  });

  it("returns high score for preference-related memories", () => {
    const fact = { tags: ["preference"] };
    expect(scoreRelevance(fact, userTags)).toBeGreaterThan(70);
  });

  it("returns medium score for general interest memories", () => {
    const fact = { tags: ["interest"] };
    const score = scoreRelevance(fact, userTags);
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThanOrEqual(80);
  });

  it("returns low score for irrelevant memories", () => {
    const fact = { tags: ["temporary", "misc"] };
    expect(scoreRelevance(fact, userTags)).toBeLessThan(40);
  });

  it("handles facts with no tags", () => {
    const fact = { tags: [] };
    expect(scoreRelevance(fact, userTags)).toBeLessThanOrEqual(20);
  });

  it("caps score between 0 and 100", () => {
    const fact = { tags: ["identity"] };
    expect(scoreRelevance(fact, userTags)).toBeGreaterThanOrEqual(0);
    expect(scoreRelevance(fact, userTags)).toBeLessThanOrEqual(100);
  });
});

describe("scoreConsistency", () => {
  it("returns high score when no conflicts exist", () => {
    const allFacts = [
      { id: 1, fact: "I like coffee", tags: ["preference"] },
      { id: 2, fact: "I work as a developer", tags: ["work"] },
    ];
    const currentFact = { id: 3, fact: "I enjoy coding", tags: ["interest"] };
    expect(scoreConsistency(currentFact, allFacts)).toBeGreaterThan(70);
  });

  it("returns lower score when contradictions detected", () => {
    const allFacts = [
      { id: 1, fact: "I love coffee", tags: ["preference"] },
      { id: 2, fact: "I hate coffee", tags: ["preference"] },
    ];
    const currentFact = { id: 2, fact: "I hate coffee", tags: ["preference"] };
    expect(scoreConsistency(currentFact, allFacts)).toBeLessThan(70);
  });

  it("handles empty fact list", () => {
    const currentFact = { id: 1, fact: "I am a person", tags: [] };
    expect(scoreConsistency(currentFact, [])).toBeGreaterThanOrEqual(80);
  });

  it("caps score between 0 and 100", () => {
    const currentFact = { id: 1, fact: "test", tags: [] };
    expect(scoreConsistency(currentFact, [])).toBeGreaterThanOrEqual(0);
    expect(scoreConsistency(currentFact, [])).toBeLessThanOrEqual(100);
  });
});

describe("scoreUsage", () => {
  it("returns high score for frequently accessed memories", () => {
    expect(scoreUsage(50)).toBeGreaterThan(80);
    expect(scoreUsage(100)).toBeGreaterThan(90);
  });

  it("returns medium score for moderately used memories", () => {
    const score = scoreUsage(5);
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThanOrEqual(60);
  });

  it("returns low score for rarely used memories", () => {
    expect(scoreUsage(0)).toBeLessThanOrEqual(20);
    expect(scoreUsage(1)).toBeLessThanOrEqual(30);
  });

  it("caps score between 0 and 100", () => {
    expect(scoreUsage(0)).toBeGreaterThanOrEqual(0);
    expect(scoreUsage(0)).toBeLessThanOrEqual(100);
    expect(scoreUsage(1000)).toBeLessThanOrEqual(100);
  });
});

describe("computeCompositeScore", () => {
  it("computes weighted composite correctly with default weights", () => {
    const dimensions = {
      specificity: 80,
      recency: 60,
      relevance: 90,
      consistency: 70,
      usage: 50,
    };
    const score = computeCompositeScore(dimensions);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("respects custom weights", () => {
    const dimensions = {
      specificity: 100,
      recency: 0,
      relevance: 0,
      consistency: 0,
      usage: 0,
    };
    const customWeights = { specificity: 0.5, recency: 0.1, relevance: 0.1, consistency: 0.1, usage: 0.2 };
    const score = computeCompositeScore(dimensions, customWeights);
    expect(score).toBeCloseTo(50, 0);
  });

  it("handles missing dimensions with defaults", () => {
    const dimensions = { specificity: 50 };
    const score = computeCompositeScore(dimensions);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("caps composite score between 0 and 100", () => {
    const dimensions = {
      specificity: 150,
      recency: -10,
      relevance: 200,
      consistency: -50,
      usage: 300,
    };
    const score = computeCompositeScore(dimensions);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("createQualityScorer", () => {
  let scorer;

  beforeEach(() => {
    scorer = createQualityScorer();
  });

  it("returns a scorer with score method", () => {
    expect(typeof scorer.score).toBe("function");
  });

  it("scores a fact and returns all dimension scores", () => {
    const fact = {
      id: 1,
      fact: "I love programming in TypeScript",
      tags: ["interest", "preference"],
      created_at: new Date().toISOString(),
    };
    const result = scorer.score(fact, []);
    expect(result).toHaveProperty("specificity");
    expect(result).toHaveProperty("recency");
    expect(result).toHaveProperty("relevance");
    expect(result).toHaveProperty("consistency");
    expect(result).toHaveProperty("usage");
    expect(result).toHaveProperty("composite");
  });

  it("returns composite score between 0 and 100", () => {
    const fact = {
      id: 1,
      fact: "test fact",
      tags: [],
      created_at: new Date().toISOString(),
    };
    const result = scorer.score(fact, []);
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(100);
  });

  it("accepts custom configuration", () => {
    const customScorer = createQualityScorer({
      weights: { specificity: 0.5, recency: 0.1, relevance: 0.1, consistency: 0.1, usage: 0.2 },
      minQualityThreshold: 40,
    });
    const fact = {
      id: 1,
      fact: "short",
      tags: [],
      created_at: new Date().toISOString(),
    };
    const result = customScorer.score(fact, []);
    expect(result).toHaveProperty("composite");
  });

  it("identifies low quality facts", () => {
    const fact = {
      id: 1,
      fact: "ok",
      tags: [],
      created_at: new Date(Date.now() - 365 * 86400000).toISOString(),
    };
    const result = scorer.score(fact, []);
    expect(result.isLowQuality).toBe(result.composite < scorer.getMinQualityThreshold());
  });

  it("suggests quality tier based on composite score", () => {
    const recentDetailed = {
      id: 1,
      fact: "I enjoy building web applications with React and TypeScript, particularly focusing on user experience design",
      tags: ["interest", "preference"],
      created_at: new Date().toISOString(),
    };
    const result = scorer.score(recentDetailed, []);
    expect(result.tier).toBeTruthy();
    expect(["excellent", "good", "fair", "poor"]).toContain(result.tier);
  });
});

describe("QualityScorer with access count tracking", () => {
  it("incorporates access count into usage score", () => {
    const scorer = createQualityScorer();
    const fact = {
      id: 1,
      fact: "I like pizza",
      tags: ["preference"],
      created_at: new Date().toISOString(),
      access_count: 25,
    };
    const result = scorer.score(fact, []);
    expect(result.usage).toBeGreaterThan(50);
  });

  it("handles facts without access_count", () => {
    const scorer = createQualityScorer();
    const fact = {
      id: 1,
      fact: "I like pizza",
      tags: ["preference"],
      created_at: new Date().toISOString(),
    };
    const result = scorer.score(fact, []);
    expect(result.usage).toBeLessThanOrEqual(20);
  });
});

describe("QualityScorer batch scoring", () => {
  it("scores multiple facts at once", () => {
    const scorer = createQualityScorer();
    const facts = [
      { id: 1, fact: "I like coffee", tags: ["preference"], created_at: new Date().toISOString() },
      { id: 2, fact: "I work at Google", tags: ["work"], created_at: new Date().toISOString() },
    ];
    const results = scorer.scoreBatch(facts);
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty("composite");
    expect(results[1]).toHaveProperty("composite");
  });
});

describe("QualityScorer duplicate detection", () => {
  it("identifies similar facts as potential duplicates", () => {
    const scorer = createQualityScorer();
    const existingFacts = [
      { id: 1, fact: "I love programming", tags: ["interest"], created_at: new Date().toISOString() },
    ];
    const newFact = { id: 2, fact: "I enjoy coding", tags: ["interest"], created_at: new Date().toISOString() };
    const duplicates = scorer.findPotentialDuplicates(newFact, existingFacts);
    expect(Array.isArray(duplicates)).toBe(true);
  });

  it("returns empty array when no duplicates", () => {
    const scorer = createQualityScorer();
    const existingFacts = [
      { id: 1, fact: "I like coffee", tags: ["preference"], created_at: new Date().toISOString() },
    ];
    const newFact = { id: 2, fact: "The sky is blue", tags: ["fact"], created_at: new Date().toISOString() };
    const duplicates = scorer.findPotentialDuplicates(newFact, existingFacts);
    expect(duplicates).toHaveLength(0);
  });

  it("identifies identical facts as duplicates", () => {
    const scorer = createQualityScorer();
    const existingFacts = [
      { id: 1, fact: "I love programming in Python", tags: ["interest"], created_at: new Date().toISOString() },
    ];
    const newFact = { id: 2, fact: "I love programming in Python", tags: ["interest"], created_at: new Date().toISOString() };
    const duplicates = scorer.findPotentialDuplicates(newFact, existingFacts);
    expect(duplicates.length).toBeGreaterThanOrEqual(1);
  });
});
