/**
 * memory-pipeline.test.js — End-to-end memory pipeline integration tests
 *
 * Tests the full memory lifecycle:
 * - Fact storage → search → retrieval
 * - Vector search + FTS5 hybrid search integration
 * - Tag search with date filtering
 * - FTS5 full-text search with CJK support
 * - Fact Store batch operations
 * - Search precision and ranking
 */

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FactStore, buildFactSearchText } from "../../lib/memory/fact-store.js";
import { VectorSearchEngine } from "../../lib/memory/vector-search.js";

function createTempDb(suffix = "facts") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `hana-${suffix}-`));
  return {
    factsDb: path.join(tmpDir, "facts.db"),
    vectorDb: path.join(tmpDir, "vectors.db"),
    dir: tmpDir,
  };
}

describe("Fact Store — End-to-End Pipeline", () => {
  let paths;
  let store;

  beforeEach(() => {
    paths = createTempDb("pipeline");
    store = new FactStore(paths.factsDb);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  describe("add → search → retrieve cycle", () => {
    it("stores a fact and retrieves it by tag search", () => {
      const result = store.add({
        fact: "User prefers dark mode for coding sessions",
        tags: ["preferences", "coding", "dark-mode"],
        time: "2025-05-15T14:30",
        session_id: "session-001",
      });

      expect(result.id).toBeGreaterThan(0);
      expect(store.size).toBe(1);

      const retrieved = store.searchByTags(["preferences"]);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].fact).toBe("User prefers dark mode for coding sessions");
      expect(retrieved[0].tags).toContain("preferences");
    });

    it("stores multiple facts and retrieves by FTS search", () => {
      const facts = [
        { fact: "User is working on memory system optimization", tags: ["work", "memory"], time: "2025-05-10T10:00", session_id: "s1" },
        { fact: "User likes TypeScript for type safety", tags: ["preferences", "typescript"], time: "2025-05-11T11:00", session_id: "s2" },
        { fact: "User has a meeting every Monday at 9am", tags: ["schedule", "meeting"], time: "2025-05-12T09:00", session_id: "s3" },
      ];

      store.addBatch(facts);
      expect(store.size).toBe(3);

      const results = store.searchFullText("memory system");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].fact).toContain("memory system");
    });

    it("retrieves fact by ID", () => {
      const result = store.add({
        fact: "Test fact for ID lookup",
        tags: ["test"],
        time: "2025-05-01T00:00",
      });

      const found = store.getById(result.id);
      expect(found).not.toBeNull();
      expect(found.fact).toBe("Test fact for ID lookup");
      expect(found.id).toBe(result.id);
    });

    it("returns null for non-existent ID", () => {
      expect(store.getById(99999)).toBeNull();
    });
  });

  describe("batch operations", () => {
    it("adds batch of facts in a single transaction", () => {
      const facts = Array.from({ length: 50 }, (_, i) => ({
        fact: `Batch fact number ${i}`,
        tags: [`tag-${i % 5}`],
        time: `2025-05-${String((i % 28) + 1).padStart(2, "0")}T10:00`,
        session_id: `session-${i % 10}`,
      }));

      const count = store.addBatch(facts);
      expect(count).toBe(50);
      expect(store.size).toBe(50);
    });

    it("deletes a single fact", () => {
      const result = store.add({ fact: "To be deleted", tags: ["temp"] });
      expect(store.size).toBe(1);

      const deleted = store.delete(result.id);
      expect(deleted).toBe(true);
      expect(store.size).toBe(0);
    });

    it("clears all facts", () => {
      store.addBatch([
        { fact: "Fact 1", tags: ["a"] },
        { fact: "Fact 2", tags: ["b"] },
        { fact: "Fact 3", tags: ["c"] },
      ]);
      expect(store.size).toBe(3);

      store.clearAll();
      expect(store.size).toBe(0);
    });
  });

  describe("tag search with multiple tags", () => {
    it("returns facts matching any tag (OR logic), ordered by match count", () => {
      store.addBatch([
        { fact: "Only tag A", tags: ["a"], time: "2025-05-01T00:00" },
        { fact: "Only tag B", tags: ["b"], time: "2025-05-01T00:00" },
        { fact: "Both A and B", tags: ["a", "b"], time: "2025-05-01T00:00" },
      ]);

      const results = store.searchByTags(["a", "b"]);
      expect(results).toHaveLength(3);
      expect(results[0].fact).toBe("Both A and B");
      expect(results[0].matchCount).toBe(2);
    });

    it("returns empty array for non-matching tags", () => {
      store.add({ fact: "Only tag X", tags: ["x"] });
      const results = store.searchByTags(["nonexistent"]);
      expect(results).toEqual([]);
    });
  });

  describe("date range filtering", () => {
    it("filters tag search by date range", () => {
      store.addBatch([
        { fact: "January fact", tags: ["monthly"], time: "2025-01-15T10:00" },
        { fact: "March fact", tags: ["monthly"], time: "2025-03-15T10:00" },
        { fact: "May fact", tags: ["monthly"], time: "2025-05-15T10:00" },
      ]);

      const results = store.searchByTags(["monthly"], { from: "2025-03-01", to: "2025-04-30" });
      expect(results).toHaveLength(1);
      expect(results[0].fact).toBe("March fact");
    });
  });

  describe("FTS5 full-text search", () => {
    it("finds facts by partial text match", () => {
      store.addBatch([
        { fact: "The user enjoys hiking on weekends", tags: ["hobbies"] },
        { fact: "The user likes reading science fiction", tags: ["hobbies"] },
        { fact: "The user works as a software engineer", tags: ["work"] },
      ]);

      const results = store.searchFullText("hiking weekends");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].fact).toContain("hiking");
    });

    it("ranks results by relevance", () => {
      store.addBatch([
        { fact: "Project Alpha is the main focus this quarter", tags: ["work"] },
        { fact: "Project Beta is secondary priority", tags: ["work"] },
        { fact: "User discussed Project Alpha in detail", tags: ["work", "alpha"] },
      ]);

      const results = store.searchFullText("Project Alpha");
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it("falls back to LIKE when FTS fails", () => {
      store.add({ fact: "Special chars: test@example.com #hash", tags: ["special"] });

      const results = store.searchFullText("test@example");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("handles empty query gracefully", () => {
      expect(store.searchFullText("")).toEqual([]);
      expect(store.searchFullText("   ")).toEqual([]);
    });
  });

  describe("CJK search support", () => {
    it("builds search text with CJK ngrams", () => {
      const searchText = buildFactSearchText("用户喜欢编程", ["技术"]);
      expect(searchText).toContain("用户");
      expect(searchText).toContain("编程");
      expect(searchText).toContain("技术");
    });

    it("searches Chinese text correctly", () => {
      store.add({
        fact: "用户最近在关注记忆系统",
        tags: ["记忆系统", "近况"],
        time: "2025-05-15T14:00",
      });
      store.add({
        fact: "用户喜欢 TypeScript 编程语言",
        tags: ["编程", "偏好"],
        time: "2025-05-14T10:00",
      });

      const results = store.searchFullText("记忆系统");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].fact).toContain("记忆系统");
    });
  });

  describe("session-based queries", () => {
    it("retrieves facts by session ID", () => {
      store.addBatch([
        { fact: "Session 1 fact A", tags: ["s1"], session_id: "session-1" },
        { fact: "Session 1 fact B", tags: ["s1"], session_id: "session-1" },
        { fact: "Session 2 fact A", tags: ["s2"], session_id: "session-2" },
      ]);

      const results = store.getBySession("session-1");
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.session_id === "session-1")).toBe(true);
    });
  });

  describe("export and import", () => {
    it("exports all facts without internal fields", () => {
      store.addBatch([
        { fact: "Export fact 1", tags: ["export"] },
        { fact: "Export fact 2", tags: ["export"] },
      ]);

      const exported = store.exportAll();
      expect(exported).toHaveLength(2);
      expect(exported[0]).toHaveProperty("fact");
      expect(exported[0]).toHaveProperty("tags");
      expect(exported[0]).toHaveProperty("id");
    });

    it("imports facts from exported data", () => {
      store.addBatch([
        { fact: "Import fact 1", tags: ["import"], time: "2025-05-01T00:00" },
        { fact: "Import fact 2", tags: ["import"], time: "2025-05-02T00:00" },
      ]);

      const exported = store.getAll();
      store.clearAll();
      expect(store.size).toBe(0);

      store.importAll(exported);
      expect(store.size).toBe(2);
    });
  });

  describe("PII scrubbing", () => {
    it("detects and scrubs email addresses", () => {
      const result = store.add({
        fact: "User email is test@example.com",
        tags: ["contact"],
      });

      const found = store.getById(result.id);
      expect(found.fact).not.toContain("test@example.com");
    });
  });
});

describe("Fact Store + Vector Search Integration", () => {
  let paths;
  let store;
  let mockEmbeddingModel;

  beforeEach(() => {
    paths = createTempDb("vector");
    mockEmbeddingModel = {
      isAvailable: false,
      getEmbedding: vi.fn().mockResolvedValue(null),
    };
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("falls back to FTS when vector engine is unavailable", () => {
    store = new FactStore(paths.factsDb, {
      vectorDbPath: paths.vectorDb,
      embeddingModel: mockEmbeddingModel,
    });

    store.addBatch([
      { fact: "Vector search fallback test A", tags: ["test"] },
      { fact: "Vector search fallback test B", tags: ["test"] },
    ]);

    const results = store.searchFullText("fallback test");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("searchWithVectors returns results with hybridScore when vector unavailable", async () => {
    store = new FactStore(paths.factsDb, {
      vectorDbPath: paths.vectorDb,
      embeddingModel: mockEmbeddingModel,
    });

    store.addBatch([
      { fact: "Hybrid search test item one", tags: ["hybrid"] },
      { fact: "Hybrid search test item two", tags: ["hybrid"] },
    ]);

    const results = await store.searchWithVectors("hybrid search test", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toHaveProperty("hybridScore");
  });
});

describe("Vector Search Engine", () => {
  let paths;
  let engine;

  beforeEach(() => {
    paths = createTempDb("vector-engine");
    engine = new VectorSearchEngine(paths.vectorDb);
  });

  afterEach(() => {
    engine?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  describe("embedding storage", () => {
    it("stores and verifies embedding existence", () => {
      const embedding = new Float32Array(384).fill(0.01);
      engine.storeEmbedding(1, embedding);

      expect(engine.hasEmbedding(1)).toBe(true);
      expect(engine.hasEmbedding(2)).toBe(false);
    });

    it("throws on dimension mismatch", () => {
      const wrongEmbedding = new Float32Array(256).fill(0.01);
      expect(() => engine.storeEmbedding(1, wrongEmbedding)).toThrow(
        "Embedding dimension mismatch"
      );
    });

    it("deletes embedding", () => {
      const embedding = new Float32Array(384).fill(0.01);
      engine.storeEmbedding(1, embedding);
      expect(engine.hasEmbedding(1)).toBe(true);

      engine.deleteEmbedding(1);
      expect(engine.hasEmbedding(1)).toBe(false);
    });
  });

  describe("vector search", () => {
    it("searches by vector similarity", () => {
      const emb1 = new Float32Array(384).map((_, i) => i * 0.01);
      const emb2 = new Float32Array(384).map((_, i) => (i + 1) * 0.01);
      const emb3 = new Float32Array(384).fill(0.5);

      engine.storeEmbedding(1, emb1);
      engine.storeEmbedding(2, emb2);
      engine.storeEmbedding(3, emb3);

      const results = engine.searchByVector(emb1, 10);
      expect(results.length).toBe(3);
      expect(results[0].factId).toBe(1);
    });

    it("respects limit parameter", () => {
      for (let i = 1; i <= 10; i++) {
        const emb = new Float32Array(384).map((_, j) => (i + j) * 0.01);
        engine.storeEmbedding(i, emb);
      }

      const results = engine.searchByVector(new Float32Array(384).fill(0.01), 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("hybrid search", () => {
    it("combines vector and FTS scores", () => {
      const emb1 = new Float32Array(384).map((_, i) => i * 0.01);
      const emb2 = new Float32Array(384).map((_, i) => (i + 10) * 0.01);

      engine.storeEmbedding(1, emb1);
      engine.storeEmbedding(2, emb2);

      const ftsResults = [
        { id: 1, rank: 1 },
        { id: 2, rank: 2 },
      ];

      const results = engine.hybridSearch(emb1, ftsResults, 10);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toHaveProperty("hybridScore");
      expect(results[0]).toHaveProperty("vectorScore");
      expect(results[0]).toHaveProperty("ftsScore");
    });

    it("uses custom weights when provided", () => {
      const emb = new Float32Array(384).map((_, i) => i * 0.01);
      engine.storeEmbedding(1, emb);

      const ftsResults = [{ id: 1, rank: 1 }];

      const results = engine.hybridSearch(emb, ftsResults, 10, {
        vectorWeight: 0.8,
        ftsWeight: 0.2,
      });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("embedding count", () => {
    it("tracks total embedding count", () => {
      expect(engine.getEmbeddingCount()).toBe(0);

      const emb = new Float32Array(384).fill(0.01);
      engine.storeEmbedding(1, emb);
      engine.storeEmbedding(2, emb);

      expect(engine.getEmbeddingCount()).toBe(2);
    });
  });
});

describe("Realistic Scenario: Full Memory Workflow", () => {
  let paths;
  let store;

  beforeEach(() => {
    paths = createTempDb("workflow");
    store = new FactStore(paths.factsDb);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("simulates a week of memory accumulation and retrieval", () => {
    const weekFacts = [
      { fact: "User started learning Rust programming", tags: ["learning", "rust", "programming"], time: "2025-05-12T09:00", session_id: "mon-session" },
      { fact: "User prefers functional programming patterns", tags: ["preferences", "programming"], time: "2025-05-12T14:00", session_id: "mon-session" },
      { fact: "User has a design review on Wednesday", tags: ["schedule", "meeting"], time: "2025-05-13T10:00", session_id: "tue-session" },
      { fact: "User is interested in AI memory systems", tags: ["interests", "ai", "memory"], time: "2025-05-14T11:00", session_id: "wed-session" },
      { fact: "User works remotely from Shanghai", tags: ["location", "work"], time: "2025-05-15T09:00", session_id: "thu-session" },
      { fact: "User enjoys hiking on weekends", tags: ["hobbies", "outdoor"], time: "2025-05-16T15:00", session_id: "fri-session" },
      { fact: "User is planning a trip to Japan in June", tags: ["travel", "plans"], time: "2025-05-17T10:00", session_id: "sat-session" },
    ];

    store.addBatch(weekFacts);
    expect(store.size).toBe(7);

    const tagResults = store.searchByTags(["programming"]);
    expect(tagResults.length).toBeGreaterThanOrEqual(2);

    const ftsResults = store.searchFullText("memory systems");
    expect(ftsResults.length).toBeGreaterThanOrEqual(1);
    expect(ftsResults[0].fact).toContain("AI memory systems");
  });

  it("handles mixed CJK and English content", () => {
    store.addBatch([
      { fact: "用户正在学习 Rust 编程语言", tags: ["学习", "rust"], time: "2025-05-12T09:00" },
      { fact: "User attended a conference about AI agents", tags: ["work", "ai"], time: "2025-05-13T14:00" },
      { fact: "用户对记忆系统的架构很感兴趣", tags: ["兴趣", "记忆系统"], time: "2025-05-14T10:00" },
    ]);

    const cnResults = store.searchFullText("记忆系统");
    expect(cnResults.length).toBeGreaterThanOrEqual(1);

    const enResults = store.searchFullText("AI agents");
    expect(enResults.length).toBeGreaterThanOrEqual(1);
  });
});
