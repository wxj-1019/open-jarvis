import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("rule-suggestion");

export class RuleSuggestionEngine {
  constructor() {
    this._suggestionId = 0;
  }

  generateSuggestion(pattern) {
    // 检查是否为序列模式（有 sequence 属性且长度为 2）
    if (pattern.sequence?.length === 2) {
      return this._generateSequenceSuggestion(pattern);
    }

    // 检查是否为时间模式
    if (pattern.hour !== undefined && pattern.category) {
      return this._generateTimeBasedSuggestion(pattern);
    }

    return null;
  }

  _generateSequenceSuggestion(pattern) {
    const [from, to] = pattern.sequence;
    const [fromCat] = from.split("|");
    const [toCat] = to.split("|");

    this._suggestionId++;

    return {
      id: `suggestion-${this._suggestionId}`,
      type: "sequence",
      description: `When using ${fromCat}, you often switch to ${toCat} next`,
      rule: {
        name: `Auto: ${fromCat} \u2192 ${toCat}`,
        conditions: [
          { type: "app_pattern", pattern: this._categoryToAppPattern(fromCat) },
        ],
        actions: [
          { type: "suggest", message: `Ready to switch to ${toCat}?` },
        ],
      },
      confidence: Math.min(pattern.support / 10, 0.95),
      sourcePattern: pattern,
    };
  }

  _generateTimeBasedSuggestion(pattern) {
    this._suggestionId++;

    return {
      id: `suggestion-${this._suggestionId}`,
      type: "time_based",
      description: `You often use ${pattern.category} around ${pattern.hour}:00`,
      rule: {
        name: `Auto: ${pattern.category} at ${pattern.hour}:00`,
        conditions: [
          { type: "time_guard", start: `${pattern.hour}:00`, end: `${pattern.hour + 1}:00` },
        ],
        actions: [
          { type: "suggest", message: `Time for ${pattern.category}?` },
        ],
      },
      confidence: pattern.confidence,
      sourcePattern: pattern,
    };
  }

  _categoryToAppPattern(category) {
    const patterns = {
      coding: "*Code*",
      browsing: "*chrome*",
      communication: "*Slack*",
      entertainment: "*steam*",
    };
    return patterns[category] ?? "*";
  }

  generateSuggestions(patterns, maxSuggestions = 10) {
    const suggestions = [];

    for (const pattern of patterns) {
      const suggestion = this.generateSuggestion(pattern);
      if (suggestion && suggestion.confidence > 0.3) {
        suggestions.push(suggestion);
      }
      if (suggestions.length >= maxSuggestions) break;
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
}
