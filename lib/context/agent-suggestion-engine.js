import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("agent-suggestion");

/**
 * Agent Suggestion Engine
 * Generates actionable suggestions from productivity reports with frequency control
 */
export class AgentSuggestionEngine {
  /**
   * @param {object} [options]
   * @param {number} [options.maxSuggestionsPerDay=3]
   * @param {number} [options.minConfidence=0.6]
   * @param {number} [options.cooldownMs=3600000]
   */
  constructor(options = {}) {
    this._maxPerDay = options.maxSuggestionsPerDay ?? 3;
    this._minConfidence = options.minConfidence ?? 0.6;
    this._cooldownMs = options.cooldownMs ?? 3600000;

    /** @type {Map<string, number>} date → suggestion count */
    this._suggestionCount = new Map();
    /** @type {Map<string, number>} suggestion type → last suggestion timestamp */
    this._lastSuggestionTime = new Map();
  }

  /**
   * Generate suggestions from a productivity report
   * @param {object} report
   * @param {Date} [date]
   * @returns {Array<{type: string, message: string, confidence: number, action: string}>}
   */
  generateSuggestions(report, date = new Date()) {
    const dateKey = date.toISOString().split("T")[0];
    const todayCount = this._suggestionCount.get(dateKey) ?? 0;

    if (todayCount >= this._maxPerDay) {
      return [];
    }

    const suggestions = [];
    const now = date.getTime();

    // 1. High context switches
    if (report.contextSwitches > 30 && this._isCooledDown("interruption_warning", now)) {
      suggestions.push({
        type: "interruption_warning",
        message: `Today you switched context ${report.contextSwitches} times. Consider setting focus periods to reduce interruptions.`,
        confidence: Math.min(report.contextSwitches / 50, 0.95),
        action: "focus_mode",
      });
    }

    // 2. Low deep work
    const deepPct = report.workTypes?.deep?.percentage ?? 0; // 使用 0 作为保守 fallback
    if (deepPct < 40 && this._isCooledDown("deep_work", now)) {
      suggestions.push({
        type: "deep_work",
        message: `Deep work only ${deepPct}% today. Consider scheduling 2 hours of uninterrupted work in the morning.`,
        confidence: 0.7,
        action: "schedule_deep_work",
      });

      // Peak hour suggestion
      if (report.peakHours?.length > 0) {
        const peak = report.peakHours[0];
        suggestions.push({
          type: "peak_hour",
          message: `You are most productive at ${peak.hour}:00. Schedule important tasks during this period.`,
          confidence: 0.75,
          action: "schedule_at_peak",
        });
      }
    }

    // 3. Interruption sources
    if (report.interruptions?.length > 0 && this._isCooledDown("interruption_source", now)) {
      const topInterruption = report.interruptions[0];
      suggestions.push({
        type: "interruption_source",
        message: `${topInterruption.app} used for ${Math.round(topInterruption.duration / 60000)} minutes. Consider setting app usage limits.`,
        confidence: 0.65,
        action: "app_limit",
      });
    }

    // Filter by confidence and respect daily limit
    const filtered = suggestions
      .filter((s) => s.confidence >= this._minConfidence)
      .slice(0, this._maxPerDay - todayCount);

    // Update counts
    this._suggestionCount.set(dateKey, todayCount + filtered.length);

    // Update cooldown
    for (const s of filtered) {
      this._lastSuggestionTime.set(s.type, now);
    }

    return filtered;
  }

  /**
   * Check if a suggestion type has cooled down
   * @private
   */
  _isCooledDown(type, now) {
    const lastTime = this._lastSuggestionTime.get(type);
    if (!lastTime) return true;
    return now - lastTime >= this._cooldownMs;
  }

  /**
   * Get today's suggestion stats
   * @param {Date} [date]
   */
  getTodayStats(date = new Date()) {
    const dateKey = date.toISOString().split("T")[0];
    return {
      count: this._suggestionCount.get(dateKey) ?? 0,
      limit: this._maxPerDay,
      remaining: Math.max(0, this._maxPerDay - (this._suggestionCount.get(dateKey) ?? 0)),
    };
  }

  /**
   * Reset stats (for testing)
   */
  reset() {
    this._suggestionCount.clear();
    this._lastSuggestionTime.clear();
  }
}
