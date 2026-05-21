import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("quality-repair");

const DEFAULT_REPAIR_CONFIG = {
  minQualityThreshold: 40,
  maxSuggestionsPerRun: 10,
};

export function createQualityRepair(config) {
  const cfg = { ...DEFAULT_REPAIR_CONFIG, ...config };

  function generateRepairSuggestions(lowQualityFacts) {
    const suggestions = [];

    for (const fact of lowQualityFacts) {
      if (suggestions.length >= cfg.maxSuggestionsPerRun) break;

      const suggestion = analyzeFactForRepair(fact);
      if (suggestion.action !== "none") {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  function analyzeFactForRepair(fact) {
    const scores = fact.quality_scores || {};
    const issues = [];
    const suggestions = [];

    if (scores.specificity < 30) {
      issues.push("low_specificity");
      suggestions.push("add_more_context_and_details_to_make_this_fact_more_specific");
    }

    if (scores.recency < 20) {
      issues.push("very_old");
      suggestions.push("update_or_archive_this_outdated_fact");
    }

    if (scores.relevance < 30) {
      issues.push("low_relevance");
      suggestions.push("review_if_this_fact_is_still_relevant_to_user_model");
    }

    if (scores.usage < 20) {
      issues.push("rarely_used");
      suggestions.push("consider_merging_with_similar_facts_or_archiving");
    }

    const factText = fact.fact || "";
    if (factText.length < 10) {
      suggestions.push("expand_fact_content_to_at_least_10_characters");
    }

    if (fact.tags.length === 0) {
      suggestions.push("add_relevant_tags_to_improve_retrievability");
    }

    return {
      factId: fact.id,
      fact: factText,
      currentScore: scores.composite || 0,
      issues,
      suggestions,
      action: suggestions.length > 0 ? "suggest" : "none",
    };
  }

  async function applyRepairWithLLM(fact, llmCallFn) {
    const factText = fact.fact || "";
    const tags = fact.tags || [];

    const prompt = `请改进以下记忆事实,使其更加具体和有信息量。

原始事实:${factText}
当前标签:${tags.join(", ")}

改进要求:
1. 保留原始核心信息
2. 增加必要的上下文和细节
3. 保持简洁(不超过100字)
4. 输出改进后的事实文本

只输出改进后的事实文本,不要其他内容。`;

    try {
      const improvedText = await llmCallFn(prompt);
      return {
        success: true,
        originalText: factText,
        improvedText: improvedText?.trim() || factText,
      };
    } catch (err) {
      log?.warn?.(`LLM repair failed for fact ${fact.id}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  function generateRepairReport(suggestions) {
    const lines = [];
    lines.push(`Quality Repair Report (${suggestions.length} suggestions)`);
    lines.push("");

    for (const s of suggestions) {
      lines.push(`Fact #${s.factId} (score: ${s.currentScore}):`);
      lines.push(`  Issues: ${s.issues.join(", ") || "none"}`);
      lines.push(`  Suggestions: ${s.suggestions.join("; ")}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  return {
    generateRepairSuggestions,
    analyzeFactForRepair,
    applyRepairWithLLM,
    generateRepairReport,
  };
}
