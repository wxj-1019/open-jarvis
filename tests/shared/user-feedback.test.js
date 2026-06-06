import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FactStore } from "../../lib/memory/fact-store.js";

function removeDbFiles(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
}

describe("User Feedback Loop", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-user-feedback-"));
    dbPath = path.join(tmpDir, "facts.db");
    removeDbFiles(dbPath);
    store = new FactStore(dbPath);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("markFactImportant", () => {
    it("marks a fact as important with reason", () => {
      const result = store.add({ fact: "用户是一名工程师", tags: ["identity"] });
      store.markFactImportant(result.id, "核心身份信息");

      const feedback = store.getUserFeedback(result.id);
      expect(feedback.important).toBe(true);
      expect(feedback.importantReason).toBe("核心身份信息");
    });

    it("increases quality score after marking important", () => {
      const result = store.add({ fact: "用户喜欢喝茶", tags: ["preference"] });
      const before = store.getById(result.id);
      const beforeScore = before.quality_scores.composite;

      store.markFactImportant(result.id, "重要偏好");
      const after = store.getById(result.id);
      const afterScore = after.quality_scores.composite;

      expect(afterScore).toBeGreaterThan(beforeScore);
    });

    it("returns false for non-existent fact", () => {
      const result = store.markFactImportant(9999, "原因");
      expect(result).toBe(false);
    });

    it("stores timestamp when marking important", () => {
      const result = store.add({ fact: "测试事实", tags: ["test"] });
      store.markFactImportant(result.id, "测试原因");

      const feedback = store.getUserFeedback(result.id);
      expect(feedback.importantAt).toBeDefined();
      expect(new Date(feedback.importantAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("markFactUseless", () => {
    it("marks a fact as useless with reason", () => {
      const result = store.add({ fact: "临时信息", tags: ["temporary"] });
      store.markFactUseless(result.id, "已过时");

      const feedback = store.getUserFeedback(result.id);
      expect(feedback.useless).toBe(true);
      expect(feedback.uselessReason).toBe("已过时");
    });

    it("decreases quality score after marking useless", () => {
      const result = store.add({
        fact: "用户是一名有5年经验的全栈工程师,专注于React和Node.js生态",
        tags: ["identity"],
      });
      const before = store.getById(result.id);
      const beforeScore = before.quality_scores.composite;

      store.markFactUseless(result.id, "不再相关");
      const after = store.getById(result.id);
      const afterScore = after.quality_scores.composite;

      expect(afterScore).toBeLessThan(beforeScore);
    });

    it("returns false for non-existent fact", () => {
      const result = store.markFactUseless(9999, "原因");
      expect(result).toBe(false);
    });

    it("stores timestamp when marking useless", () => {
      const result = store.add({ fact: "测试事实", tags: ["test"] });
      store.markFactUseless(result.id, "测试原因");

      const feedback = store.getUserFeedback(result.id);
      expect(feedback.uselessAt).toBeDefined();
      expect(new Date(feedback.uselessAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("getFactsWithFeedback", () => {
    it("returns facts marked as important", () => {
      const r1 = store.add({ fact: "重要事实A", tags: ["test"] });
      const r2 = store.add({ fact: "普通事实B", tags: ["test"] });
      const r3 = store.add({ fact: "重要事实C", tags: ["test"] });

      store.markFactImportant(r1.id, "重要");
      store.markFactImportant(r3.id, "重要");

      const important = store.getFactsWithFeedback("important");
      expect(important.length).toBe(2);
    });

    it("returns facts marked as useless", () => {
      const r1 = store.add({ fact: "事实A", tags: ["test"] });
      const r2 = store.add({ fact: "事实B", tags: ["test"] });

      store.markFactUseless(r2.id, "无用");

      const useless = store.getFactsWithFeedback("useless");
      expect(useless.length).toBe(1);
      expect(useless[0].id).toBe(r2.id);
    });

    it("returns empty array when no feedback exists", () => {
      store.add({ fact: "事实A", tags: ["test"] });
      store.add({ fact: "事实B", tags: ["test"] });

      const important = store.getFactsWithFeedback("important");
      const useless = store.getFactsWithFeedback("useless");

      expect(important).toEqual([]);
      expect(useless).toEqual([]);
    });
  });

  describe("getUserFeedback", () => {
    it("returns null for non-existent fact", () => {
      const feedback = store.getUserFeedback(9999);
      expect(feedback).toBe(null);
    });

    it("returns empty object for fact without feedback", () => {
      const result = store.add({ fact: "测试", tags: ["test"] });
      const feedback = store.getUserFeedback(result.id);
      expect(feedback).toEqual({});
    });

    it("includes user_feedback in fact object", () => {
      const result = store.add({ fact: "测试", tags: ["test"] });
      store.markFactImportant(result.id, "测试原因");

      const fact = store.getById(result.id);
      expect(fact.user_feedback.important).toBe(true);
      expect(fact.user_feedback.importantReason).toBe("测试原因");
    });
  });

  describe("user_feedback persistence", () => {
    it("persists feedback after getting all facts", () => {
      const r1 = store.add({ fact: "事实A", tags: ["test"] });
      const r2 = store.add({ fact: "事实B", tags: ["test"] });

      store.markFactImportant(r1.id, "重要");
      store.markFactUseless(r2.id, "无用");

      const allFacts = store.getAll();
      const factA = allFacts.find((f) => f.id === r1.id);
      const factB = allFacts.find((f) => f.id === r2.id);

      expect(factA.user_feedback.important).toBe(true);
      expect(factB.user_feedback.useless).toBe(true);
    });

    it("allows both important and useless on same fact (last write wins for score)", () => {
      const result = store.add({ fact: "复杂事实", tags: ["test"] });
      
      store.markFactImportant(result.id, "曾经重要");
      store.markFactUseless(result.id, "现在无用");

      const feedback = store.getUserFeedback(result.id);
      expect(feedback.important).toBe(true);
      expect(feedback.useless).toBe(true);

      const fact = store.getById(result.id);
      const score = fact.quality_scores.composite;
      expect(score).toBeLessThan(50);
    });
  });

  describe("quality score boundaries", () => {
    it("caps composite score at 100 after marking important", () => {
      const result = store.add({
        fact: "用户是一名有10年经验的资深软件架构师,精通分布式系统设计和微服务架构",
        tags: ["identity"],
      });

      store.markFactImportant(result.id, "核心身份");
      const fact = store.getById(result.id);

      expect(fact.quality_scores.composite).toBeLessThanOrEqual(100);
      expect(fact.quality_scores.composite).toBeGreaterThanOrEqual(0);
    });

    it("caps composite score at 0 after marking useless", () => {
      const result = store.add({
        fact: "临时",
        tags: ["misc"],
      });

      store.markFactUseless(result.id, "完全无用");
      const fact = store.getById(result.id);

      expect(fact.quality_scores.composite).toBeGreaterThanOrEqual(0);
      expect(fact.quality_scores.composite).toBeLessThanOrEqual(100);
    });
  });
});
