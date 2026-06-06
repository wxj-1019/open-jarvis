import { describe, expect, it } from "vitest";
import { createCompileQualityEvaluator } from "../../lib/memory/compile-quality.js";

describe("CompileQualityEvaluator", () => {
  const evaluator = createCompileQualityEvaluator();

  describe("evaluateCompileResult", () => {
    it("scores high for well-populated sections", () => {
      const result = evaluator.evaluateCompileResult({
        today: "用户今天专注于记忆系统优化,完成了质量评分持久化和编译质量反馈两个主要功能。下午进行了代码审查,确保所有测试用例都能正确通过。晚上还优化了编译流程的性能,显著提升了编译速度。",
        week: "本周用户主要关注记忆系统的性能优化,包括质量评分、编译反馈和用户反馈闭环。同时还改进了记忆检索的准确性,优化了向量搜索算法,提升了整体的用户体验和系统稳定性。",
        longterm: "用户是一名资深软件工程师,对系统架构和代码质量有高要求。长期从事后端开发和系统设计工作,熟悉多种编程语言和框架,尤其擅长分布式系统和高并发场景的架构设计。",
        facts: "用户喜欢高质量的代码实现,重视测试覆盖率。在开发过程中始终坚持编写单元测试和集成测试,确保代码的可靠性和可维护性。同时注重代码审查,积极学习和分享最佳实践。",
      });

      expect(result.score).toBeGreaterThan(60);
      expect(result.issues.length).toBe(0);
      expect(Object.keys(result.sectionScores).length).toBe(4);
    });

    it("scores low for empty sections", () => {
      const result = evaluator.evaluateCompileResult({
        today: "",
        week: "   ",
        longterm: "长期内容",
        facts: "",
      });

      expect(result.score).toBeLessThan(50);
      expect(result.issues).toContain("today:empty_section");
      expect(result.issues).toContain("week:empty_section");
    });

    it("detects too few sections", () => {
      const result = evaluator.evaluateCompileResult({
        today: "今天的内容,足够长来获得较高分数。用户完成了多项任务,包括代码编写和测试。",
      });

      expect(result.issues).toContain("too_few_sections: only 1 sections, minimum is 2");
    });

    it("scores empty input as zero", () => {
      const result = evaluator.evaluateCompileResult({});
      expect(result.score).toBe(0);
      expect(result.issues).toContain("no_sections");
    });

    it("penalizes sections that are too short", () => {
      const result = evaluator.evaluateCompileResult({
        today: "短内容",
        week: "本周用户主要关注记忆系统的性能优化工作,包括质量评分持久化、编译质量反馈机制的实现,以及用户反馈闭环的设计与开发。这些改进显著提升了系统的整体质量和用户体验。",
      });

      expect(result.sectionScores.today.score).toBeLessThan(50);
      expect(result.sectionScores.week.score).toBeGreaterThan(50);
    });
  });

  describe("compareCompileResults", () => {
    it("detects improvement", () => {
      const before = evaluator.evaluateCompileResult({
        today: "短",
        week: "本周内容",
      });
      const after = evaluator.evaluateCompileResult({
        today: "用户今天完成了记忆系统的全面优化,包括质量评分持久化、编译质量反馈和用户反馈闭环的实现。这些改进显著提升了系统性能和用户体验。",
        week: "本周用户主要关注记忆系统的性能优化工作,完成了多项重要功能的开发和测试。",
      });

      const comparison = evaluator.compareCompileResults(before, after);
      expect(comparison.improved).toBe(true);
      expect(comparison.scoreDiff).toBeGreaterThan(0);
    });

    it("detects degradation", () => {
      const before = evaluator.evaluateCompileResult({
        today: "用户今天完成了记忆系统的全面优化,包括质量评分持久化、编译质量反馈和用户反馈闭环的实现。这些改进显著提升了系统性能和用户体验。",
        week: "本周用户主要关注记忆系统的性能优化工作,完成了多项重要功能的开发和测试。",
      });
      const after = evaluator.evaluateCompileResult({
        today: "短",
        week: "内容不足",
      });

      const comparison = evaluator.compareCompileResults(before, after);
      expect(comparison.degraded).toBe(true);
      expect(comparison.scoreDiff).toBeLessThan(0);
    });
  });

  describe("generateReport", () => {
    it("generates readable report", () => {
      const evaluation = evaluator.evaluateCompileResult({
        today: "短",
        week: "本周用户主要关注记忆系统的性能优化工作,完成了多项重要功能的开发和测试。这些改进包括质量评分持久化、编译质量反馈机制的实现,以及用户反馈闭环的设计与开发。",
      });

      const report = evaluator.generateReport(evaluation);
      expect(report).toContain("Compile Quality Score:");
      expect(report).toContain("too_short");
    });
  });
});
