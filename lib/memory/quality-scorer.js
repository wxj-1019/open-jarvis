import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("quality-scorer");

const DEFAULT_WEIGHTS = {
  specificity: 0.25,
  recency: 0.20,
  relevance: 0.25,
  consistency: 0.15,
  usage: 0.15,
};

const RELEVANCE_TAG_WEIGHTS = {
  identity: 100,
  preference: 90,
  interest: 80,
  health: 85,
  relationship: 80,
  work: 60,
  goal: 75,
  value: 90,
  personality: 95,
  habit: 65,
  skill: 70,
  location: 55,
  fact: 40,
  event: 45,
  temporary: 10,
  misc: 20,
};

const DEFAULT_CONFIG = {
  weights: { ...DEFAULT_WEIGHTS },
  minQualityThreshold: 40,
  recencyHalfLifeDays: 90,
  specificityMinLength: 10,
  specificityOptimalLength: 80,
  usageSaturationPoint: 50,
  duplicateSimilarityThreshold: 0.6,
};

export function scoreSpecificity(factText) {
  if (!factText || typeof factText !== "string") return 0;

  const text = factText.trim();
  if (text.length === 0) return 0;

  const lengthScore = Math.min(100, (text.length / DEFAULT_CONFIG.specificityOptimalLength) * 100);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const wordScore = Math.min(100, (wordCount / 15) * 100);

  const entityPatterns = [
    /\d{4}/,
    /\d{1,2}[\/\-]\d{1,2}/,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i,
    /[A-Z][a-z]+ [A-Z][a-z]+/,
    /\b\d+%?\b/,
    /\b\d+\s*(years?|months?|weeks?|days?|hours?)/i,
  ];
  let entityCount = 0;
  for (const pattern of entityPatterns) {
    if (pattern.test(text)) entityCount++;
  }
  const entityScore = Math.min(100, (entityCount / 3) * 100);

  const hasPunctuation = /[.,;:!?]/.test(text);
  const punctuationBonus = hasPunctuation ? 10 : 0;

  const rawScore = lengthScore * 0.35 + wordScore * 0.30 + entityScore * 0.25 + punctuationBonus;

  return clamp(Math.round(rawScore), 0, 100);
}

export function scoreRecency(timestamp, referenceTime) {
  const refTime = referenceTime || Date.now();
  if (!timestamp) return 0;

  let factTime;
  try {
    factTime = new Date(timestamp).getTime();
  } catch {
    return 0;
  }

  if (isNaN(factTime)) return 0;

  const ageMs = Math.max(0, refTime - factTime);
  const halfLifeMs = DEFAULT_CONFIG.recencyHalfLifeDays * 86400000;

  const score = 100 * Math.pow(0.5, ageMs / halfLifeMs);

  return clamp(Math.round(score), 0, 100);
}

export function scoreRelevance(fact, userTags) {
  if (!fact || !fact.tags || !Array.isArray(fact.tags)) {
    return Math.round(Math.random() * 15);
  }

  const tags = userTags || ["identity", "preference", "interest", "health", "relationship", "work"];
  const factTags = fact.tags.map((t) => t.toLowerCase());

  let maxWeight = 0;
  for (const tag of factTags) {
    const weight = RELEVANCE_TAG_WEIGHTS[tag];
    if (weight !== undefined && weight > maxWeight) {
      maxWeight = weight;
    }
    const normalizedTag = normalizeTag(tag);
    for (const userTag of tags) {
      if (normalizedTag === userTag.toLowerCase() || tag.includes(userTag.toLowerCase()) || userTag.toLowerCase().includes(tag.toLowerCase())) {
        const userWeight = RELEVANCE_TAG_WEIGHTS[userTag.toLowerCase()] || 50;
        if (userWeight > maxWeight) maxWeight = userWeight;
      }
    }
  }

  if (maxWeight === 0 && factTags.length > 0) {
    return clamp(30, 0, 100);
  }

  return clamp(Math.round(maxWeight), 0, 100);
}

function normalizeTag(tag) {
  const aliases = {
    "job": "work",
    "career": "work",
    "profession": "work",
    "hobby": "interest",
    "passion": "interest",
    "likes": "preference",
    "dislikes": "preference",
    "favourite": "preference",
    "favorite": "preference",
    "personality": "identity",
    "trait": "identity",
    "who": "identity",
  };
  return aliases[tag] || tag;
}

export function scoreConsistency(fact, allFacts, opts = {}) {
  const maxRelated = opts.maxRelated ?? 100;

  if (!fact || !allFacts || allFacts.length === 0) return 85;

  const factText = (fact.fact || "").toLowerCase();
  const factTags = (fact.tags || []).map((t) => t.toLowerCase());

  // 只筛选共享标签的事实（非全量），大幅减少无关比较
  const related = [];
  for (const other of allFacts) {
    if (other.id === fact.id) continue;
    const otherTags = (other.tags || []).map((t) => t.toLowerCase());
    if (factTags.some((t) => otherTags.includes(t))) {
      related.push(other);
    }
  }

  // 采样：相关事实过多时随机采样，避免 O(n²) 爆炸
  const sample = related.length > maxRelated
    ? reservoirSample(related, maxRelated)
    : related;

  let conflictCount = 0;
  const negationWords = ["don't", "dont", "never", "hate", "dislike", "no longer", "not", "avoid"];
  const factHasNegation = negationWords.some((w) => factText.includes(w));

  for (const other of sample) {
    const otherText = (other.fact || "").toLowerCase();
    const otherHasNegation = negationWords.some((w) => otherText.includes(w));

    if (factHasNegation !== otherHasNegation) {
      const sharedKeywords = factText.split(/\s+/).filter((w) => w.length > 3);
      const matchCount = sharedKeywords.filter((w) => otherText.includes(w)).length;
      if (matchCount >= 2) {
        conflictCount++;
      }
    }
  }

  if (sample.length === 0) return 90;

  const conflictRatio = conflictCount / sample.length;
  const score = 100 * (1 - conflictRatio * 0.5);

  return clamp(Math.round(score), 0, 100);
}

export function scoreUsage(accessCount) {
  const count = Math.max(0, accessCount || 0);
  const saturation = DEFAULT_CONFIG.usageSaturationPoint;

  const score = (1 - Math.exp(-count / saturation)) * 100;

  return clamp(Math.round(score), 0, 100);
}

export function computeCompositeScore(dimensions, weights) {
  const w = weights || DEFAULT_CONFIG.weights;

  const specificity = clamp(dimensions.specificity || 0, 0, 100);
  const recency = clamp(dimensions.recency || 0, 0, 100);
  const relevance = clamp(dimensions.relevance || 0, 0, 100);
  const consistency = clamp(dimensions.consistency || 0, 0, 100);
  const usage = clamp(dimensions.usage || 0, 0, 100);

  const raw =
    specificity * (w.specificity || 0) +
    recency * (w.recency || 0) +
    relevance * (w.relevance || 0) +
    consistency * (w.consistency || 0) +
    usage * (w.usage || 0);

  const totalWeight = (w.specificity || 0) + (w.recency || 0) + (w.relevance || 0) + (w.consistency || 0) + (w.usage || 0);

  if (totalWeight === 0) return 50;

  return clamp(Math.round(raw / totalWeight), 0, 100);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 蓄水池采样：从数组中随机选取 k 个元素，线性时间 O(n)
 */
function reservoirSample(arr, k) {
  const result = arr.slice(0, k);
  for (let i = k; i < arr.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < k) result[j] = arr[i];
  }
  return result;
}

function getQualityTier(score) {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

export function createQualityScorer(config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (config?.weights) {
    cfg.weights = { ...DEFAULT_CONFIG.weights, ...config.weights };
  }

  function score(fact, allFacts, opts = {}) {
    const factText = fact.fact || "";
    const factTime = fact.created_at || fact.time || null;
    const accessCount = fact.access_count || 0;
    const userFeedback = fact.user_feedback || {};

    const specificity = scoreSpecificity(factText);
    const recency = scoreRecency(factTime);
    const relevance = scoreRelevance(fact, []);
    const consistency = scoreConsistency(fact, allFacts || [], { maxRelated: opts.maxRelated ?? 100 });
    const usage = scoreUsage(accessCount);

    const composite = computeCompositeScore(
      { specificity, recency, relevance, consistency, usage },
      cfg.weights,
    );

    let feedbackAdjust = 0;
    if (userFeedback.important) feedbackAdjust += 15;
    if (userFeedback.useless) feedbackAdjust -= 30;

    const adjustedComposite = clamp(composite + feedbackAdjust, 0, 100);
    const minThreshold = cfg.minQualityThreshold;

    return {
      factId: fact.id,
      specificity,
      recency,
      relevance,
      consistency,
      usage,
      composite: adjustedComposite,
      isLowQuality: adjustedComposite < minThreshold,
      tier: getQualityTier(adjustedComposite),
    };
  }

  function scoreBatch(facts) {
    return facts.map((fact) => score(fact, facts));
  }

  function findPotentialDuplicates(fact, existingFacts) {
    const factText = (fact.fact || "").toLowerCase();
    const threshold = cfg.duplicateSimilarityThreshold;
    const duplicates = [];

    for (const existing of existingFacts) {
      if (existing.id === fact.id) continue;

      const existingText = (existing.fact || "").toLowerCase();
      const similarity = computeTextSimilarity(factText, existingText);

      if (similarity >= threshold) {
        duplicates.push({
          factId: existing.id,
          similarity: Math.round(similarity * 100) / 100,
        });
      }
    }

    return duplicates;
  }

  function computeTextSimilarity(text1, text2) {
    if (text1 === text2) return 1.0;

    const words1 = new Set(text1.split(/\s+/).filter(Boolean));
    const words2 = new Set(text2.split(/\s+/).filter(Boolean));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }

  async function findPotentialDuplicatesVector(fact, existingFacts, vectorEngine, embeddingModel) {
    const factText = fact.fact || "";
    const duplicates = [];

    if (!vectorEngine || !embeddingModel?.isAvailable) {
      return findPotentialDuplicates(fact, existingFacts);
    }

    try {
      const embedding = await embeddingModel.getEmbedding(factText);
      if (!embedding) {
        return findPotentialDuplicates(fact, existingFacts);
      }

      const vectorResults = vectorEngine.searchByVector(embedding, existingFacts.length);
      const threshold = cfg.duplicateSimilarityThreshold;

      for (const vr of vectorResults) {
        if (vr.vectorScore >= threshold) {
          const existingFact = existingFacts.find((f) => f.id === vr.factId);
          if (existingFact && existingFact.id !== fact.id) {
            duplicates.push({
              factId: existingFact.id,
              similarity: Math.round(vr.vectorScore * 100) / 100,
              method: "vector",
            });
          }
        }
      }

      const jaccardDuplicates = findPotentialDuplicates(fact, existingFacts);
      const jaccardIds = new Set(jaccardDuplicates.map((d) => d.factId));

      for (const jd of jaccardDuplicates) {
        if (!jaccardIds.has(jd.factId)) {
          duplicates.push({ ...jd, method: "jaccard" });
        }
      }

      duplicates.sort((a, b) => b.similarity - a.similarity);
      return duplicates;
    } catch (err) {
      log?.warn?.(`Vector duplicate detection failed: ${err.message}`);
      return findPotentialDuplicates(fact, existingFacts);
    }
  }

  function getMinQualityThreshold() {
    return cfg.minQualityThreshold;
  }

  return {
    score,
    scoreBatch,
    findPotentialDuplicates,
    findPotentialDuplicatesVector,
    getMinQualityThreshold,
    config: cfg,
  };
}
