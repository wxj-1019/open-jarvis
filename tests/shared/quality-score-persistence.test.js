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

describe("Quality Score Persistence", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-quality-persist-"));
    dbPath = path.join(tmpDir, "facts.db");
    removeDbFiles(dbPath);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("add() persists quality scores", () => {
    it("stores quality scores when adding a fact", () => {
      store = new FactStore(dbPath);
      const result = store.add({
        fact: "用户喜欢在晚上喝茉莉花茶,这是从2024年开始的习惯",
        tags: ["habit", "preference"],
        time: "2026-05-05T18:00",
      });

      const fact = store.getById(result.id);
      expect(fact.quality_scores).toBeDefined();
      expect(fact.quality_scores.composite).toBeGreaterThan(0);
      expect(fact.quality_scores.specificity).toBeGreaterThan(0);
      expect(fact.access_count).toBe(0);
    });

    it("quality scores are readable without recomputation", () => {
      store = new FactStore(dbPath);
      store.add({
        fact: "用户是一名软件工程师",
        tags: ["identity", "work"],
      });

      const newStore = new FactStore(dbPath);
      const facts = newStore.getAll();
      expect(facts[0].quality_scores.composite).toBeGreaterThan(0);
    });
  });

  describe("quality score queries", () => {
    it("getQualityStats returns cached scores from database", () => {
      store = new FactStore(dbPath);
      store.add({ fact: "事实A", tags: ["test"] });
      store.add({ fact: "事实B", tags: ["test"] });
      store.add({ fact: "事实C", tags: ["test"] });

      const stats = store.getQualityStats();
      expect(stats.total).toBe(3);
      expect(stats.averageQuality).toBeGreaterThan(0);
      expect(stats.minQuality).toBeGreaterThanOrEqual(0);
      expect(stats.maxQuality).toBeLessThanOrEqual(100);
    });

    it("getQualityDistribution returns correct distribution", () => {
      store = new FactStore(dbPath);
      store.add({ fact: "高质量事实,包含详细信息和具体数据,用户从2024年开始从事软件开发工作", tags: ["identity"] });
      store.add({ fact: "短", tags: ["misc"] });

      const dist = store.getQualityDistribution();
      expect(dist.excellent + dist.good + dist.fair + dist.poor).toBe(2);
    });

    it("getLowQualityFacts returns facts below threshold", () => {
      store = new FactStore(dbPath);
      store.add({ fact: "短", tags: ["misc"] });
      store.add({
        fact: "用户是一名有5年经验的全栈工程师,专注于React和Node.js生态",
        tags: ["identity", "work"],
      });

      const lowQuality = store.getLowQualityFacts(50);
      expect(lowQuality.length).toBeGreaterThanOrEqual(1);
      expect(lowQuality[0].quality_scores.composite).toBeLessThan(50);
    });
  });

  describe("access_count persistence", () => {
    it("incrementAccessCount increases counter", () => {
      store = new FactStore(dbPath);
      const result = store.add({ fact: "测试事实", tags: ["test"] });

      store.incrementAccessCount(result.id);
      store.incrementAccessCount(result.id);

      const fact = store.getById(result.id);
      expect(fact.access_count).toBe(2);
    });

    it("access_count affects quality_usage score on recompute", () => {
      store = new FactStore(dbPath);
      const result = store.add({ fact: "测试事实", tags: ["test"] });

      for (let i = 0; i < 20; i++) {
        store.incrementAccessCount(result.id);
      }

      store.recomputeQualityForFact(result.id);
      const fact = store.getById(result.id);
      expect(fact.quality_scores.usage).toBeGreaterThan(0);
    });
  });

  describe("recomputeQualityForFact", () => {
    it("recomputes quality for a specific fact", () => {
      store = new FactStore(dbPath);
      const result = store.add({ fact: "测试事实", tags: ["test"] });

      const before = store.getById(result.id);
      const beforeScore = before.quality_scores.composite;

      store.incrementAccessCount(result.id);
      store.incrementAccessCount(result.id);
      store.recomputeQualityForFact(result.id);

      const after = store.getById(result.id);
      expect(after.quality_scores.usage).toBeGreaterThan(before.quality_scores.usage);
    });

    it("does nothing for non-existent fact", () => {
      store = new FactStore(dbPath);
      store.add({ fact: "测试事实", tags: ["test"] });

      expect(() => store.recomputeQualityForFact(999)).not.toThrow();
    });
  });
});
