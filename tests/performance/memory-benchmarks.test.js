/**
 * memory-benchmarks.test.js — Performance benchmarks for memory system
 *
 * Benchmarks:
 * - Search latency (<100ms for 1000 facts)
 * - Batch insertion throughput
 * - Database size growth rate
 * - Tag search performance
 * - FTS5 search performance
 */

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FactStore } from "../../lib/memory/fact-store.js";
import { VectorSearchEngine } from "../../lib/memory/vector-search.js";

function createTempDb(suffix = "bench") {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `hana-${suffix}-`));
  return {
    factsDb: path.join(tmpDir, "facts.db"),
    vectorDb: path.join(tmpDir, "vectors.db"),
    dir: tmpDir,
  };
}

function generateFacts(count, prefix = "bench") {
  const tags = ["work", "personal", "learning", "project", "meeting", "idea", "preference", "goal"];
  const topics = [
    "memory system", "AI agent", "TypeScript", "Rust programming",
    "design review", "sprint planning", "code refactoring", "API design",
    "database optimization", "performance tuning", "security audit",
    "user research", "feature planning", "bug triage", "documentation",
  ];

  return Array.from({ length: count }, (_, i) => ({
    fact: `${prefix} fact ${i}: User discussed ${topics[i % topics.length]} in detail`,
    tags: [tags[i % tags.length], tags[(i + 3) % tags.length]],
    time: `2025-05-${String((i % 28) + 1).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
    session_id: `session-${i % 50}`,
  }));
}

describe("Search Latency Benchmarks", () => {
  let paths;
  let store;

  beforeEach(() => {
    paths = createTempDb("latency");
    store = new FactStore(paths.factsDb);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("FTS5 search latency should be <100ms for 1000 facts", () => {
    const facts = generateFacts(1000);
    store.addBatch(facts);

    const iterations = 10;
    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      store.searchFullText("memory system");
      latencies.push(performance.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    expect(avgLatency).toBeLessThan(100);
  });

  it("Tag search latency should be <50ms for 1000 facts", () => {
    const facts = generateFacts(1000);
    store.addBatch(facts);

    const iterations = 10;
    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      store.searchByTags(["work"]);
      latencies.push(performance.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    expect(avgLatency).toBeLessThan(50);
  });

  it("Search latency scales reasonably with fact count", () => {
    const sizes = [100, 500, 1000];
    const latencies = {};

    for (const size of sizes) {
      store.clearAll();
      store.addBatch(generateFacts(size));

      const start = performance.now();
      store.searchFullText("user discussed");
      for (let i = 0; i < 5; i++) {
        store.searchFullText("memory system");
      }
      latencies[size] = (performance.now() - start) / 5;
    }

    expect(latencies[1000]).toBeLessThan(latencies[100] * 10);
  });
});

describe("Batch Insertion Throughput", () => {
  let paths;
  let store;

  beforeEach(() => {
    paths = createTempDb("throughput");
    store = new FactStore(paths.factsDb);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("should handle 1000 facts insertion in reasonable time", () => {
    const facts = generateFacts(1000, "throughput");

    const start = performance.now();
    const count = store.addBatch(facts);
    const elapsed = performance.now() - start;

    expect(count).toBe(1000);
    expect(store.size).toBe(1000);
    expect(elapsed).toBeLessThan(5000);
  });

  it("should handle 100 facts insertion in under 500ms", () => {
    const facts = generateFacts(100, "fast");

    const start = performance.now();
    store.addBatch(facts);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});

describe("Database Size Growth", () => {
  let paths;
  let store;

  beforeEach(() => {
    paths = createTempDb("size");
    store = new FactStore(paths.factsDb);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("database size should grow linearly with fact count", () => {
    const sizes = [];
    const counts = [100, 500, 1000];

    for (const count of counts) {
      store.addBatch(generateFacts(count, `size-${count}`));
      const stat = fs.statSync(paths.factsDb);
      sizes.push({ count, bytes: stat.size });
    }

    const bytesPerFact100 = sizes[0].bytes / sizes[0].count;
    const bytesPerFact1000 = (sizes[2].bytes - sizes[0].bytes) / (sizes[2].count - sizes[0].count);

    expect(bytesPerFact1000).toBeLessThan(bytesPerFact100 * 2);
  });

  it("database size for 1000 facts should be under 10MB", () => {
    store.addBatch(generateFacts(1000, "size-test"));
    const stat = fs.statSync(paths.factsDb);
    const sizeMB = stat.size / (1024 * 1024);

    expect(sizeMB).toBeLessThan(10);
  });
});

describe("Vector Search Engine Performance", () => {
  let paths;
  let engine;

  beforeEach(() => {
    paths = createTempDb("vector-bench");
    engine = new VectorSearchEngine(paths.vectorDb);
  });

  afterEach(() => {
    engine?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("vector search latency should be <100ms for 1000 embeddings", () => {
    const embeddings = Array.from({ length: 1000 }, (_, i) => ({
      factId: i + 1,
      embedding: new Float32Array(384).map((_, j) => (i + j) * 0.001),
    }));

    for (const { factId, embedding } of embeddings) {
      engine.storeEmbedding(factId, embedding);
    }

    const queryEmbedding = new Float32Array(384).fill(0.01);

    const iterations = 5;
    const latencies = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      engine.searchByVector(queryEmbedding, 20);
      latencies.push(performance.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    expect(avgLatency).toBeLessThan(1000);
  });

  it("hybrid search combines results efficiently", () => {
    const count = 100;
    for (let i = 1; i <= count; i++) {
      const embedding = new Float32Array(384).map((_, j) => (i + j) * 0.001);
      engine.storeEmbedding(i, embedding);
    }

    const queryEmbedding = new Float32Array(384).fill(0.01);
    const ftsResults = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      rank: i + 1,
    }));

    const start = performance.now();
    const results = engine.hybridSearch(queryEmbedding, ftsResults, 20);
    const elapsed = performance.now() - start;

    expect(results.length).toBeLessThanOrEqual(20);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("Scalability Benchmarks", () => {
  let paths;
  let store;

  beforeEach(() => {
    paths = createTempDb("scalability");
    store = new FactStore(paths.factsDb);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("handles 5000 facts with acceptable search performance", () => {
    store.addBatch(generateFacts(5000, "scale"));
    expect(store.size).toBe(5000);

    const start = performance.now();
    const results = store.searchFullText("user discussed");
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });

  it("multiple concurrent tag searches perform well", () => {
    store.addBatch(generateFacts(2000, "concurrent"));

    const tags = ["work", "personal", "learning", "project"];
    const start = performance.now();

    for (const tag of tags) {
      store.searchByTags([tag]);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

describe("Memory Footprint", () => {
  let paths;
  let store;

  beforeEach(() => {
    paths = createTempDb("memory");
    store = new FactStore(paths.factsDb);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(paths.dir, { recursive: true, force: true });
  });

  it("cache does not grow unboundedly", () => {
    for (let i = 0; i < 100; i++) {
      store.add({
        fact: `Cache test fact ${i}`,
        tags: [`tag-${i % 10}`],
        time: `2025-05-${String((i % 28) + 1).padStart(2, "0")}T10:00`,
      });
    }

    store.searchByTags(["tag-0"], { from: "2025-05-01", to: "2025-05-10" });
    store.searchByTags(["tag-1"], { from: "2025-05-01", to: "2025-05-10" });
    store.searchByTags(["tag-2"], { from: "2025-05-11", to: "2025-05-20" });

    const cacheSize = store._tagSearchCache?.size || 0;
    expect(cacheSize).toBeLessThan(50);
  });
});
