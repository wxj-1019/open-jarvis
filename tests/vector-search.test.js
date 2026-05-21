import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VectorSearchEngine } from "../lib/memory/vector-search.js";

function removeDbFiles(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
}

describe("VectorSearchEngine", () => {
  let tmpDir;
  let dbPath;
  let engine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-vector-search-"));
    dbPath = path.join(tmpDir, "vectors.db");
  });

  afterEach(() => {
    engine?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("constructor", () => {
    it("initializes with database path", () => {
      engine = new VectorSearchEngine(dbPath);
      expect(engine).toBeDefined();
    });

    it("accepts custom dimension", () => {
      engine = new VectorSearchEngine(dbPath, { dimension: 512 });
      expect(engine).toBeDefined();
    });
  });

  describe("storeEmbedding", () => {
    it("stores embedding for a fact", () => {
      engine = new VectorSearchEngine(dbPath);
      const embedding = new Float32Array(384).fill(0.1);
      embedding[0] = 1.0;

      engine.storeEmbedding(1, embedding);

      const results = engine.searchByVector(embedding, 10);
      expect(results).toHaveLength(1);
      expect(results[0].factId).toBe(1);
    });

    it("stores multiple embeddings", () => {
      engine = new VectorSearchEngine(dbPath);
      const embedding1 = new Float32Array(384).fill(0.1);
      const embedding2 = new Float32Array(384).fill(0.2);

      engine.storeEmbedding(1, embedding1);
      engine.storeEmbedding(2, embedding2);

      const results = engine.searchByVector(embedding1, 10);
      expect(results).toHaveLength(2);
    });

    it("updates existing embedding", () => {
      engine = new VectorSearchEngine(dbPath);
      const embedding1 = new Float32Array(384).fill(0.1);
      const embedding2 = new Float32Array(384).fill(0.5);

      engine.storeEmbedding(1, embedding1);
      engine.storeEmbedding(1, embedding2);

      const results = engine.searchByVector(embedding2, 10);
      expect(results).toHaveLength(1);
      expect(results[0].factId).toBe(1);
    });
  });

  describe("deleteEmbedding", () => {
    it("removes embedding by factId", () => {
      engine = new VectorSearchEngine(dbPath);
      const embedding = new Float32Array(384).fill(0.1);

      engine.storeEmbedding(1, embedding);
      engine.deleteEmbedding(1);

      const results = engine.searchByVector(embedding, 10);
      expect(results).toHaveLength(0);
    });

    it("handles deletion of non-existent fact", () => {
      engine = new VectorSearchEngine(dbPath);
      expect(() => engine.deleteEmbedding(999)).not.toThrow();
    });
  });

  describe("searchByVector", () => {
    it("returns results ordered by similarity", () => {
      engine = new VectorSearchEngine(dbPath);

      const queryEmbedding = new Float32Array(384).fill(0.1);
      queryEmbedding[0] = 1.0;
      queryEmbedding[1] = 0.5;

      const similarEmbedding = new Float32Array(384).fill(0.1);
      similarEmbedding[0] = 1.0;
      similarEmbedding[1] = 0.4;

      const dissimilarEmbedding = new Float32Array(384).fill(0.1);
      dissimilarEmbedding[0] = -1.0;

      engine.storeEmbedding(1, similarEmbedding);
      engine.storeEmbedding(2, dissimilarEmbedding);

      const results = engine.searchByVector(queryEmbedding, 10);

      expect(results).toHaveLength(2);
      expect(results[0].factId).toBe(1);
      expect(results[0].vectorScore).toBeGreaterThan(results[1].vectorScore);
    });

    it("respects limit parameter", () => {
      engine = new VectorSearchEngine(dbPath);

      for (let i = 1; i <= 10; i++) {
        const embedding = new Float32Array(384).fill(i * 0.1);
        engine.storeEmbedding(i, embedding);
      }

      const queryEmbedding = new Float32Array(384).fill(0.5);
      const results = engine.searchByVector(queryEmbedding, 3);

      expect(results).toHaveLength(3);
    });

    it("returns empty array when no embeddings exist", () => {
      engine = new VectorSearchEngine(dbPath);
      const embedding = new Float32Array(384).fill(0.1);

      const results = engine.searchByVector(embedding, 10);
      expect(results).toEqual([]);
    });

    it("applies date range filter", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      engine.storeEmbedding(1, embedding, { time: "2026-01-15T10:00:00Z" });
      engine.storeEmbedding(2, embedding, { time: "2026-03-15T10:00:00Z" });
      engine.storeEmbedding(3, embedding, { time: "2026-05-15T10:00:00Z" });

      const results = engine.searchByVector(embedding, 10, {
        from: "2026-02-01T00:00:00Z",
        to: "2026-04-01T00:00:00Z",
      });

      expect(results).toHaveLength(1);
      expect(results[0].factId).toBe(2);
    });

    it("applies date range filter with only from", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      engine.storeEmbedding(1, embedding, { time: "2026-01-15T10:00:00Z" });
      engine.storeEmbedding(2, embedding, { time: "2026-05-15T10:00:00Z" });

      const results = engine.searchByVector(embedding, 10, {
        from: "2026-03-01T00:00:00Z",
      });

      expect(results).toHaveLength(1);
      expect(results[0].factId).toBe(2);
    });

    it("applies date range filter with only to", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      engine.storeEmbedding(1, embedding, { time: "2026-01-15T10:00:00Z" });
      engine.storeEmbedding(2, embedding, { time: "2026-05-15T10:00:00Z" });

      const results = engine.searchByVector(embedding, 10, {
        to: "2026-03-01T00:00:00Z",
      });

      expect(results).toHaveLength(1);
      expect(results[0].factId).toBe(1);
    });
  });

  describe("hybridSearch", () => {
    it("combines vector and FTS scores", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      embedding[0] = 1.0;

      engine.storeEmbedding(1, embedding, { factId: 1 });
      engine.storeEmbedding(2, embedding, { factId: 2 });

      const ftsResults = [
        { id: 1, fact: "test fact one", rank: 1 },
        { id: 2, fact: "test fact two", rank: 2 },
        { id: 3, fact: "test fact three", rank: 3 },
      ];

      const results = engine.hybridSearch(embedding, ftsResults, 10, {
        vectorWeight: 0.6,
        ftsWeight: 0.4,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("hybridScore");
      expect(results[0]).toHaveProperty("factId");
    });

    it("handles empty FTS results", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      engine.storeEmbedding(1, embedding);

      const results = engine.hybridSearch(embedding, [], 10);

      expect(results.length).toBeGreaterThan(0);
    });

    it("handles empty vector results", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      const ftsResults = [
        { id: 1, fact: "test fact", rank: 1 },
      ];

      const results = engine.hybridSearch(embedding, ftsResults, 10);

      expect(results).toHaveLength(1);
      expect(results[0].factId).toBe(1);
    });

    it("deduplicates results by factId", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      engine.storeEmbedding(1, embedding);

      const ftsResults = [
        { id: 1, fact: "test fact", rank: 1 },
        { id: 2, fact: "another fact", rank: 2 },
      ];

      const results = engine.hybridSearch(embedding, ftsResults, 10);

      const factIds = results.map((r) => r.factId);
      const uniqueFactIds = [...new Set(factIds)];
      expect(factIds).toEqual(uniqueFactIds);
    });

    it("applies custom weights", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      engine.storeEmbedding(1, embedding);

      const ftsResults = [
        { id: 1, fact: "test fact", rank: 1 },
      ];

      const results = engine.hybridSearch(embedding, ftsResults, 10, {
        vectorWeight: 0.8,
        ftsWeight: 0.2,
      });

      expect(results[0]).toHaveProperty("hybridScore");
    });

    it("applies date range filter", () => {
      engine = new VectorSearchEngine(dbPath);

      const embedding = new Float32Array(384).fill(0.1);
      engine.storeEmbedding(1, embedding, { time: "2026-01-15T10:00:00Z" });
      engine.storeEmbedding(2, embedding, { time: "2026-05-15T10:00:00Z" });

      const ftsResults = [
        { id: 1, fact: "january fact", rank: 1 },
        { id: 2, fact: "may fact", rank: 2 },
      ];

      const results = engine.hybridSearch(embedding, ftsResults, 10, {
        dateRange: {
          from: "2026-04-01T00:00:00Z",
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0].factId).toBe(2);
    });
  });

  describe("getEmbeddingCount", () => {
    it("returns zero for empty database", () => {
      engine = new VectorSearchEngine(dbPath);
      expect(engine.getEmbeddingCount()).toBe(0);
    });

    it("returns correct count after storing embeddings", () => {
      engine = new VectorSearchEngine(dbPath);
      const embedding = new Float32Array(384).fill(0.1);

      engine.storeEmbedding(1, embedding);
      engine.storeEmbedding(2, embedding);
      engine.storeEmbedding(3, embedding);

      expect(engine.getEmbeddingCount()).toBe(3);
    });
  });

  describe("hasEmbedding", () => {
    it("returns true for existing fact", () => {
      engine = new VectorSearchEngine(dbPath);
      const embedding = new Float32Array(384).fill(0.1);

      engine.storeEmbedding(1, embedding);
      expect(engine.hasEmbedding(1)).toBe(true);
    });

    it("returns false for non-existent fact", () => {
      engine = new VectorSearchEngine(dbPath);
      expect(engine.hasEmbedding(1)).toBe(false);
    });
  });

  describe("close", () => {
    it("closes database connection", () => {
      engine = new VectorSearchEngine(dbPath);
      engine.close();
      expect(engine.db.open).toBe(false);
    });

    it("handles double close gracefully", () => {
      engine = new VectorSearchEngine(dbPath);
      engine.close();
      expect(() => engine.close()).not.toThrow();
    });
  });
});
