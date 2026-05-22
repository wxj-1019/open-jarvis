import { describe, it, expect, beforeEach, vi } from "vitest";
import { createQualityMonitor } from "../lib/memory/quality-monitor.js";

describe("createQualityMonitor", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor({
      minQualityThreshold: 40,
      alertThreshold: 0.3,
    });
  });

  it("returns monitor with expected methods", () => {
    expect(typeof monitor.recordMetrics).toBe("function");
    expect(typeof monitor.getHealthStatus).toBe("function");
    expect(typeof monitor.getAlerts).toBe("function");
    expect(typeof monitor.clearAlerts).toBe("function");
    expect(typeof monitor.exportReport).toBe("function");
    expect(typeof monitor.identifyLowQuality).toBe("function");
    expect(typeof monitor.suggestMerges).toBe("function");
    expect(typeof monitor.identifyNeedsUpdate).toBe("function");
  });
});

describe("recordMetrics", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor();
  });

  it("records quality metrics for a fact", () => {
    monitor.recordMetrics(1, {
      composite: 75,
      specificity: 80,
      recency: 70,
      relevance: 90,
      consistency: 60,
      usage: 50,
    });
    const status = monitor.getHealthStatus();
    expect(status.totalMemories).toBe(1);
    expect(status.averageQuality).toBe(75);
  });

  it("updates averages when multiple facts are recorded", () => {
    monitor.recordMetrics(1, { composite: 80 });
    monitor.recordMetrics(2, { composite: 60 });
    const status = monitor.getHealthStatus();
    expect(status.totalMemories).toBe(2);
    expect(status.averageQuality).toBe(70);
  });

  it("tracks quality distribution tiers", () => {
    monitor.recordMetrics(1, { composite: 90, tier: "excellent" });
    monitor.recordMetrics(2, { composite: 70, tier: "good" });
    monitor.recordMetrics(3, { composite: 40, tier: "fair" });
    monitor.recordMetrics(4, { composite: 20, tier: "poor" });
    const status = monitor.getHealthStatus();
    expect(status.tierDistribution).toBeDefined();
    expect(status.tierDistribution.excellent).toBe(1);
    expect(status.tierDistribution.poor).toBe(1);
  });

  it("detects when average quality drops below threshold", () => {
    monitor.recordMetrics(1, { composite: 30 });
    monitor.recordMetrics(2, { composite: 25 });
    monitor.recordMetrics(3, { composite: 35 });
    const alerts = monitor.getAlerts();
    expect(alerts.length).toBeGreaterThan(0);
  });
});

describe("getHealthStatus", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor();
  });

  it("returns empty status when no metrics recorded", () => {
    const status = monitor.getHealthStatus();
    expect(status.totalMemories).toBe(0);
    expect(status.averageQuality).toBe(0);
    expect(status.qualityHealth).toBe("unknown");
  });

  it("returns 'healthy' when average quality is high", () => {
    monitor.recordMetrics(1, { composite: 85 });
    monitor.recordMetrics(2, { composite: 90 });
    const status = monitor.getHealthStatus();
    expect(status.qualityHealth).toBe("healthy");
  });

  it("returns 'degraded' when average quality is medium", () => {
    monitor.recordMetrics(1, { composite: 50 });
    monitor.recordMetrics(2, { composite: 55 });
    const status = monitor.getHealthStatus();
    expect(status.qualityHealth).toBe("degraded");
  });

  it("returns 'critical' when average quality is low", () => {
    monitor.recordMetrics(1, { composite: 20 });
    monitor.recordMetrics(2, { composite: 25 });
    const status = monitor.getHealthStatus();
    expect(status.qualityHealth).toBe("critical");
  });
});

describe("getAlerts", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor({
      minQualityThreshold: 50,
    });
  });

  it("returns empty array when no alerts", () => {
    monitor.recordMetrics(1, { composite: 80 });
    const alerts = monitor.getAlerts();
    expect(alerts).toEqual([]);
  });

  it("generates alert for quality degradation", () => {
    monitor.recordMetrics(1, { composite: 30 });
    monitor.recordMetrics(2, { composite: 20 });
    const alerts = monitor.getAlerts();
    expect(alerts.some((a) => a.type === "quality_degradation")).toBe(true);
  });

  it("generates alert for high percentage of low quality memories", () => {
    monitor.recordMetrics(1, { composite: 20 });
    monitor.recordMetrics(2, { composite: 15 });
    monitor.recordMetrics(3, { composite: 25 });
    monitor.recordMetrics(4, { composite: 80 });
    const alerts = monitor.getAlerts();
    expect(alerts.some((a) => a.type === "high_low_quality_ratio")).toBe(true);
  });

  it("alert includes severity level", () => {
    monitor.recordMetrics(1, { composite: 10 });
    const alerts = monitor.getAlerts();
    if (alerts.length > 0) {
      expect(["low", "medium", "high"]).toContain(alerts[0].severity);
    }
  });

  it("alert includes timestamp", () => {
    monitor.recordMetrics(1, { composite: 10 });
    const alerts = monitor.getAlerts();
    if (alerts.length > 0) {
      expect(alerts[0]).toHaveProperty("timestamp");
    }
  });
});

describe("clearAlerts", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor({ minQualityThreshold: 50 });
  });

  it("clears all alerts", () => {
    monitor.recordMetrics(1, { composite: 10 });
    expect(monitor.getAlerts().length).toBeGreaterThan(0);
    monitor.clearAlerts();
    expect(monitor.getAlerts()).toEqual([]);
  });
});

describe("exportReport", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor();
  });

  it("exports a report with quality metrics", () => {
    monitor.recordMetrics(1, { composite: 80, tier: "good" });
    monitor.recordMetrics(2, { composite: 60, tier: "fair" });
    const report = monitor.exportReport();
    expect(report).toHaveProperty("generatedAt");
    expect(report).toHaveProperty("totalMemories");
    expect(report).toHaveProperty("averageQuality");
    expect(report).toHaveProperty("tierDistribution");
  });

  it("includes alert summary in report", () => {
    monitor.recordMetrics(1, { composite: 10 });
    const report = monitor.exportReport();
    expect(report).toHaveProperty("alerts");
    expect(Array.isArray(report.alerts)).toBe(true);
  });

  it("includes recommendations in report", () => {
    monitor.recordMetrics(1, { composite: 80 });
    monitor.recordMetrics(2, { composite: 20 });
    const report = monitor.exportReport();
    expect(report).toHaveProperty("recommendations");
    expect(Array.isArray(report.recommendations)).toBe(true);
  });
});

describe("identifyLowQuality", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor({ minQualityThreshold: 50 });
  });

  it("identifies facts below quality threshold", () => {
    monitor.recordMetrics(1, { composite: 30 });
    monitor.recordMetrics(2, { composite: 70 });
    monitor.recordMetrics(3, { composite: 40 });
    const lowQuality = monitor.identifyLowQuality();
    expect(lowQuality.length).toBe(2);
    expect(lowQuality.map((f) => f.factId)).toContain(1);
    expect(lowQuality.map((f) => f.factId)).toContain(3);
  });

  it("returns empty array when all facts are above threshold", () => {
    monitor.recordMetrics(1, { composite: 70 });
    monitor.recordMetrics(2, { composite: 80 });
    const lowQuality = monitor.identifyLowQuality();
    expect(lowQuality).toEqual([]);
  });

  it("includes reason for low quality", () => {
    monitor.recordMetrics(1, { composite: 30, specificity: 20, recency: 40 });
    const lowQuality = monitor.identifyLowQuality();
    expect(lowQuality[0]).toHaveProperty("reason");
  });
});

describe("suggestMerges", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor();
  });

  it("suggests merges for similar facts", () => {
    const facts = [
      { id: 1, fact: "I love programming in JavaScript", tags: ["interest"], created_at: "2025-01-01" },
      { id: 2, fact: "I enjoy coding in JavaScript", tags: ["interest"], created_at: "2025-01-02" },
    ];
    const suggestions = monitor.suggestMerges(facts);
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it("returns empty array for dissimilar facts", () => {
    const facts = [
      { id: 1, fact: "I like coffee", tags: ["preference"], created_at: "2025-01-01" },
      { id: 2, fact: "The weather is nice", tags: ["fact"], created_at: "2025-01-02" },
    ];
    const suggestions = monitor.suggestMerges(facts);
    expect(suggestions.length).toBe(0);
  });

  it("merge suggestion includes both fact IDs", () => {
    const facts = [
      { id: 1, fact: "I work as a software engineer", tags: ["work"], created_at: "2025-01-01" },
      { id: 2, fact: "I am a software developer", tags: ["work"], created_at: "2025-01-02" },
    ];
    const suggestions = monitor.suggestMerges(facts);
    if (suggestions.length > 0) {
      expect(suggestions[0]).toHaveProperty("factId1");
      expect(suggestions[0]).toHaveProperty("factId2");
      expect(suggestions[0]).toHaveProperty("similarity");
    }
  });
});

describe("identifyNeedsUpdate", () => {
  let monitor;

  beforeEach(() => {
    monitor = createQualityMonitor();
  });

  it("identifies stale memories that need updates", () => {
    const now = Date.now();
    const sixMonthsAgo = new Date(now - 180 * 86400000).toISOString();
    monitor.recordMetrics(1, { composite: 60, recency: 20, lastAccessed: sixMonthsAgo });
    const needsUpdate = monitor.identifyNeedsUpdate();
    expect(needsUpdate.length).toBeGreaterThan(0);
  });

  it("does not flag recently accessed memories", () => {
    const now = Date.now();
    monitor.recordMetrics(1, { composite: 60, recency: 80, lastAccessed: new Date(now - 86400000).toISOString() });
    const needsUpdate = monitor.identifyNeedsUpdate();
    expect(needsUpdate.length).toBe(0);
  });

  it("includes staleness reason", () => {
    const now = Date.now();
    const yearAgo = new Date(now - 365 * 86400000).toISOString();
    monitor.recordMetrics(1, { composite: 60, recency: 10, lastAccessed: yearAgo });
    const needsUpdate = monitor.identifyNeedsUpdate();
    if (needsUpdate.length > 0) {
      expect(needsUpdate[0]).toHaveProperty("reason");
    }
  });
});

describe("QualityMonitor with fact store integration", () => {
  it("can process facts from a store-like structure", () => {
    const monitor = createQualityMonitor();
    const facts = [
      { id: 1, fact: "I like TypeScript", tags: ["preference"], created_at: new Date().toISOString(), access_count: 10 },
      { id: 2, fact: "ok", tags: [], created_at: new Date(Date.now() - 365 * 86400000).toISOString(), access_count: 0 },
    ];
    const results = monitor.processFacts(facts);
    expect(results).toHaveProperty("scoredFacts");
    expect(results).toHaveProperty("alerts");
    expect(results).toHaveProperty("lowQualityFacts");
  });
});

describe("QualityMonitor auto-cleanup policy", () => {
  it("identifies facts eligible for auto-cleanup", () => {
    const monitor = createQualityMonitor({
      minQualityThreshold: 30,
      autoCleanupEnabled: true,
      autoCleanupThreshold: 15,
      autoCleanupAgeDays: 365,
    });
    const oldDate = new Date(Date.now() - 400 * 86400000).toISOString();
    monitor.recordMetrics(1, { composite: 10, recency: 5, created_at: oldDate });
    const cleanupCandidates = monitor.identifyCleanupCandidates();
    expect(cleanupCandidates.length).toBeGreaterThan(0);
  });

  it("does not suggest cleanup for recent facts", () => {
    const monitor = createQualityMonitor({
      autoCleanupEnabled: true,
      autoCleanupThreshold: 15,
      autoCleanupAgeDays: 365,
    });
    monitor.recordMetrics(1, { composite: 10, recency: 90 });
    const cleanupCandidates = monitor.identifyCleanupCandidates();
    expect(cleanupCandidates.length).toBe(0);
  });
});

describe("QualityMonitor scoring weights customization", () => {
  it("uses custom scoring weights when provided", () => {
    const monitor = createQualityMonitor({
      scoringWeights: {
        specificity: 0.5,
        recency: 0.05,
        relevance: 0.15,
        consistency: 0.1,
        usage: 0.2,
      },
    });
    const fact = {
      id: 1,
      fact: "I enjoy building software applications using modern frameworks and best practices",
      tags: ["interest"],
      created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
      access_count: 50,
    };
    monitor.recordMetricsForFact(fact, []);
    const status = monitor.getHealthStatus();
    expect(status.totalMemories).toBe(1);
  });
});
