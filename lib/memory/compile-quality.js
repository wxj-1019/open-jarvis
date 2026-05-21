import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("compile-quality");

const DEFAULT_COMPILE_QUALITY_CONFIG = {
  minLength: 50,
  maxLength: 2000,
  minSections: 2,
  emptySectionThreshold: 30,
};

export function createCompileQualityEvaluator(config) {
  const cfg = { ...DEFAULT_COMPILE_QUALITY_CONFIG, ...config };

  function evaluateCompileResult(sections) {
    const result = {
      score: 0,
      issues: [],
      suggestions: [],
      sectionScores: {},
    };

    if (!sections || Object.keys(sections).length === 0) {
      result.issues.push("no_sections");
      result.score = 0;
      return result;
    }

    let totalScore = 0;
    let sectionCount = 0;

    for (const [sectionName, content] of Object.entries(sections)) {
      const sectionResult = evaluateSection(sectionName, content || "", cfg);
      result.sectionScores[sectionName] = sectionResult;
      totalScore += sectionResult.score;
      sectionCount++;

      if (sectionResult.issues.length > 0) {
        result.issues.push(...sectionResult.issues.map((i) => `${sectionName}:${i}`));
      }
      if (sectionResult.suggestions.length > 0) {
        result.suggestions.push(...sectionResult.suggestions.map((s) => `${sectionName}:${s}`));
      }
    }

    result.score = Math.round(totalScore / sectionCount);

    if (sectionCount < cfg.minSections) {
      result.issues.push(`too_few_sections: only ${sectionCount} sections, minimum is ${cfg.minSections}`);
      result.score = Math.max(0, result.score - 20);
    }

    return result;
  }

  function evaluateSection(name, content, config) {
    const result = { score: 0, issues: [], suggestions: [] };
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      result.issues.push("empty_section");
      result.score = 0;
      return result;
    }

    if (trimmed.length < config.minLength) {
      result.issues.push("too_short");
      result.suggestions.push("content_is_below_minimum_length");
      result.score = Math.round((trimmed.length / config.minLength) * 50);
      return result;
    }

    let score = 70;

    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    const cjkCount = countCjkChars(trimmed);
    const effectiveWordCount = cjkCount > trimmed.length * 0.3
      ? trimmed.length
      : wordCount;

    if (effectiveWordCount >= 10) score += 10;
    if (effectiveWordCount >= 20) score += 5;

    const lineCount = trimmed.split(/\n/).filter((l) => l.trim()).length;
    if (lineCount >= 2) score += 5;
    if (lineCount >= 4) score += 5;

    if (trimmed.length > config.maxLength) {
      result.suggestions.push("content_exceeds_recommended_length");
      score -= 10;
    }

    const cjkRatio = cjkCount / trimmed.length;
    if (cjkRatio > 0.3) score += 5;

    result.score = Math.min(100, Math.max(0, score));
    return result;
  }

  function countCjkChars(text) {
    const cjkRe = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
    const matches = text.match(cjkRe);
    return matches ? matches.length : 0;
  }

  function compareCompileResults(before, after) {
    const comparison = {
      scoreDiff: after.score - before.score,
      improved: after.score > before.score,
      degraded: after.score < before.score,
      sectionChanges: {},
    };

    const allSections = new Set([
      ...Object.keys(before.sectionScores || {}),
      ...Object.keys(after.sectionScores || {}),
    ]);

    for (const section of allSections) {
      const beforeScore = before.sectionScores?.[section]?.score ?? 0;
      const afterScore = after.sectionScores?.[section]?.score ?? 0;
      comparison.sectionChanges[section] = {
        before: beforeScore,
        after: afterScore,
        diff: afterScore - beforeScore,
      };
    }

    return comparison;
  }

  function generateReport(evaluationResult, comparison) {
    const lines = [];

    lines.push(`Compile Quality Score: ${evaluationResult.score}/100`);
    lines.push("");

    if (evaluationResult.issues.length > 0) {
      lines.push(`Issues (${evaluationResult.issues.length}):`);
      for (const issue of evaluationResult.issues) {
        lines.push(`  - ${issue}`);
      }
      lines.push("");
    }

    if (evaluationResult.suggestions.length > 0) {
      lines.push(`Suggestions (${evaluationResult.suggestions.length}):`);
      for (const suggestion of evaluationResult.suggestions) {
        lines.push(`  - ${suggestion}`);
      }
      lines.push("");
    }

    if (comparison) {
      lines.push(`Comparison: ${comparison.scoreDiff > 0 ? "improved" : comparison.scoreDiff < 0 ? "degraded" : "unchanged"} (${comparison.scoreDiff > 0 ? "+" : ""}${comparison.scoreDiff})`);
      lines.push("");
    }

    return lines.join("\n");
  }

  return {
    evaluateCompileResult,
    compareCompileResults,
    generateReport,
  };
}
