import { createModuleLogger } from "../debug-log.js";
import { createQualityScorer, scoreSpecificity, scoreRecency, scoreRelevance, scoreConsistency, scoreUsage, computeCompositeScore } from "./quality-scorer.js";

const log = createModuleLogger("quality-monitor");

const DEFAULT_MONITOR_CONFIG = {
  minQualityThreshold: 40,
  alertThreshold: 0.3,
  scoringWeights: null,
  autoCleanupEnabled: true,
  autoCleanupThreshold: 25,
  autoCleanupAgeDays: 180,
  stalenessThresholdDays: 180,
};

export function createQualityMonitor(config) {
  const cfg = { ...DEFAULT_MONITOR_CONFIG, ...config };
  const scorer = createQualityScorer({
    weights: cfg.scoringWeights,
    minQualityThreshold: cfg.minQualityThreshold,
  });

  const metrics = new Map();
  const alerts = [];
  const history = [];

  function recordMetrics(factId, scores) {
    const entry = {
      factId,
      ...scores,
      recordedAt: new Date().toISOString(),
    };
    metrics.set(factId, entry);

    evaluateAlerts();
  }

  function recordMetricsForFact(fact, allFacts) {
    const result = scorer.score(fact, allFacts);
    recordMetrics(fact.id, {
      composite: result.composite,
      specificity: result.specificity,
      recency: result.recency,
      relevance: result.relevance,
      consistency: result.consistency,
      usage: result.usage,
      tier: result.tier,
    });
    return result;
  }

  function getHealthStatus() {
    if (metrics.size === 0) {
      return {
        totalMemories: 0,
        averageQuality: 0,
        qualityHealth: "unknown",
        tierDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
        alertCount: 0,
      };
    }

    let totalScore = 0;
    const tierDist = { excellent: 0, good: 0, fair: 0, poor: 0 };

    for (const entry of metrics.values()) {
      totalScore += entry.composite || 0;
      const tier = entry.tier || getTier(entry.composite);
      if (tierDist[tier] !== undefined) {
        tierDist[tier]++;
      }
    }

    const avgQuality = Math.round(totalScore / metrics.size);
    const health = getHealthLabel(avgQuality);

    return {
      totalMemories: metrics.size,
      averageQuality: avgQuality,
      qualityHealth: health,
      tierDistribution: tierDist,
      alertCount: alerts.length,
    };
  }

  function getTier(score) {
    if (score >= 80) return "excellent";
    if (score >= 60) return "good";
    if (score >= 40) return "fair";
    return "poor";
  }

  function getHealthLabel(avgScore) {
    if (avgScore >= 70) return "healthy";
    if (avgScore >= 40) return "degraded";
    return "critical";
  }

  function evaluateAlerts() {
    const status = getHealthStatus();
    if (status.totalMemories === 0) return;

    if (status.averageQuality < cfg.minQualityThreshold) {
      addAlert("quality_degradation", `Average memory quality (${status.averageQuality}) is below threshold (${cfg.minQualityThreshold})`, "high");
    }

    const lowQualityRatio = (status.tierDistribution.poor + status.tierDistribution.fair) / status.totalMemories;
    if (lowQualityRatio > cfg.alertThreshold) {
      addAlert("high_low_quality_ratio", `${Math.round(lowQualityRatio * 100)}% of memories are below acceptable quality`, "medium");
    }
  }

  function addAlert(type, message, severity) {
    const existing = alerts.find((a) => a.type === type);
    if (existing) {
      existing.message = message;
      existing.severity = severity;
      existing.timestamp = new Date().toISOString();
      existing.count = (existing.count || 1) + 1;
    } else {
      alerts.push({
        type,
        message,
        severity,
        timestamp: new Date().toISOString(),
        count: 1,
      });
    }
    log?.warn?.(`Alert [${severity}]: ${message}`);
  }

  function getAlerts() {
    return [...alerts];
  }

  function clearAlerts() {
    alerts.length = 0;
  }

  function exportReport() {
    const status = getHealthStatus();
    const lowQuality = identifyLowQuality();
    const suggestions = suggestMergesInternal();
    const needsUpdate = identifyNeedsUpdate();

    const recommendations = [];
    if (status.averageQuality < 50) {
      recommendations.push("Consider reviewing and improving low-quality memories");
    }
    if (lowQuality.length > status.totalMemories * 0.3) {
      recommendations.push("High ratio of low-quality memories detected - consider cleanup");
    }
    if (suggestions.length > 0) {
      recommendations.push(`${suggestions.length} potential duplicate pairs found - consider merging`);
    }
    if (needsUpdate.length > 0) {
      recommendations.push(`${needsUpdate.length} memories may need updating due to staleness`);
    }

    return {
      generatedAt: new Date().toISOString(),
      totalMemories: status.totalMemories,
      averageQuality: status.averageQuality,
      qualityHealth: status.qualityHealth,
      tierDistribution: status.tierDistribution,
      lowQualityCount: lowQuality.length,
      alerts: [...alerts],
      mergeSuggestions: suggestions.slice(0, 10),
      staleMemories: needsUpdate.slice(0, 10),
      recommendations,
    };
  }

  function identifyLowQuality() {
    const lowQuality = [];
    for (const entry of metrics.values()) {
      if (entry.composite < cfg.minQualityThreshold) {
        const reasons = [];
        if ((entry.specificity || 0) < 30) reasons.push("low specificity");
        if ((entry.recency || 0) < 20) reasons.push("very old");
        if ((entry.relevance || 0) < 30) reasons.push("low relevance");
        if ((entry.usage || 0) < 20) reasons.push("rarely used");

        lowQuality.push({
          factId: entry.factId,
          composite: entry.composite,
          reason: reasons.join(", ") || "below threshold",
        });
      }
    }
    return lowQuality;
  }

  function suggestMerges(facts) {
    if (!facts || facts.length < 2) return [];

    const suggestions = [];
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const similarity = computeJaccardSimilarity(
          (facts[i].fact || "").toLowerCase(),
          (facts[j].fact || "").toLowerCase(),
        );
        if (similarity >= 0.5) {
          suggestions.push({
            factId1: facts[i].id,
            factId2: facts[j].id,
            similarity: Math.round(similarity * 100) / 100,
            suggestedAction: "merge",
          });
        }
      }
    }
    return suggestions;
  }

  function suggestMergesInternal() {
    const facts = [];
    for (const entry of metrics.values()) {
      facts.push({
        id: entry.factId,
        fact: `fact_${entry.factId}`,
        tags: [],
        created_at: entry.recordedAt,
      });
    }
    return suggestMerges(facts);
  }

  function computeJaccardSimilarity(text1, text2) {
    const words1 = new Set(text1.split(/\s+/).filter(Boolean));
    const words2 = new Set(text2.split(/\s+/).filter(Boolean));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  function identifyNeedsUpdate() {
    const staleThreshold = cfg.stalenessThresholdDays * 86400000;
    const now = Date.now();
    const needsUpdate = [];

    for (const entry of metrics.values()) {
      if ((entry.recency || 0) < 20) {
        const reasons = [];
        if ((entry.recency || 0) < 20) reasons.push("very old - recency score low");
        if (entry.lastAccessed) {
          const lastAccess = new Date(entry.lastAccessed).getTime();
          const daysSinceAccess = (now - lastAccess) / 86400000;
          if (daysSinceAccess > cfg.stalenessThresholdDays) {
            reasons.push(`not accessed in ${Math.round(daysSinceAccess)} days`);
          }
        }

        needsUpdate.push({
          factId: entry.factId,
          composite: entry.composite,
          recency: entry.recency,
          reason: reasons.join(", ") || "may need review",
        });
      }
    }
    return needsUpdate;
  }

  function processFacts(facts) {
    const scoredFacts = [];
    for (const fact of facts) {
      const result = recordMetricsForFact(fact, facts);
      scoredFacts.push({ ...fact, qualityScores: result });
    }

    const lowQualityFacts = identifyLowQuality();
    const currentAlerts = getAlerts();

    return {
      scoredFacts,
      alerts: currentAlerts,
      lowQualityFacts,
      healthStatus: getHealthStatus(),
    };
  }

  function identifyCleanupCandidates() {
    if (!cfg.autoCleanupEnabled) return [];

    const candidates = [];
    const ageThreshold = cfg.autoCleanupAgeDays * 86400000;
    const now = Date.now();

    for (const entry of metrics.values()) {
      if (entry.composite < cfg.autoCleanupThreshold) {
        let isOldEnough = false;
        if (entry.recordedAt) {
          const age = now - new Date(entry.recordedAt).getTime();
          if (age > ageThreshold) isOldEnough = true;
        }
        if ((entry.recency || 0) < 15) isOldEnough = true;

        if (isOldEnough) {
          candidates.push({
            factId: entry.factId,
            composite: entry.composite,
            recency: entry.recency,
            reason: "low quality and old - candidate for cleanup",
          });
        }
      }
    }

    return candidates;
  }

  function executeCleanup(candidates, deleteCallback) {
    if (!cfg.autoCleanupEnabled) return { deleted: 0, errors: [] };

    const errors = [];
    let deleted = 0;

    for (const candidate of candidates) {
      try {
        if (deleteCallback) {
          deleteCallback(candidate.factId);
          deleted++;
        }
      } catch (err) {
        errors.push({ factId: candidate.factId, error: err.message });
      }
    }

    log?.info?.(`Auto-cleanup: deleted ${deleted} low-quality memories`);
    return { deleted, errors };
  }

  function getScorer() {
    return scorer;
  }

  return {
    recordMetrics,
    recordMetricsForFact,
    getHealthStatus,
    getAlerts,
    clearAlerts,
    exportReport,
    identifyLowQuality,
    suggestMerges,
    identifyNeedsUpdate,
    processFacts,
    identifyCleanupCandidates,
    executeCleanup,
    getScorer,
    config: cfg,
  };
}
