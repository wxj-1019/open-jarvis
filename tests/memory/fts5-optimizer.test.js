import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fts5Optimizer } from "../../lib/memory/fts5-optimizer.js";

describe("Fts5Optimizer - BM25 scoring enhancement", () => {
  let tmpDir;
  let optimizer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fts5-optimizer-bm25-"));
    optimizer = new Fts5Optimizer({ dbPath: path.join(tmpDir, "facts.db") });
  });

  afterEach(() => {
    optimizer?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns higher scores for exact matches vs partial matches", () => {
    optimizer.addFact("The user loves jasmine tea");
    optimizer.addFact("The user likes green tea");
    optimizer.addFact("Tea is popular");

    const results = optimizer.enhancedSearch("jasmine tea");
    expect(results.length).toBeGreaterThan(0);

    const jasmineResult = results.find((r) => r.fact.includes("jasmine"));
    const greenTeaResult = results.find((r) => r.fact.includes("green tea"));

    expect(jasmineResult.score).toBeGreaterThan(greenTeaResult.score);
  });

  it("applies custom column weights (fact column weighted higher than search_text)", () => {
    optimizer.addFact("Important fact about machine learning");
    optimizer.addFact("Secondary note about learning");

    const results = optimizer.enhancedSearch("machine learning", {
      columnWeights: { fact: 3.0, search_text: 1.0 },
    });

    const mlResult = results.find((r) => r.fact.includes("Important"));
    const secondaryResult = results.find((r) => r.fact.includes("Secondary"));

    expect(mlResult.score).toBeGreaterThan(secondaryResult.score);
  });

  it("allows BM25 parameter tuning (k1, b)", () => {
    for (let i = 0; i < 10; i++) {
      optimizer.addFact(`Document ${i} about artificial intelligence and machine learning`);
    }
    optimizer.addFact("Special document about artificial intelligence");

    const results1 = optimizer.enhancedSearch("artificial intelligence", {
      bm25Params: { k1: 1.2, b: 0.75 },
    });

    const results2 = optimizer.enhancedSearch("artificial intelligence", {
      bm25Params: { k1: 2.0, b: 0.5 },
    });

    expect(results1.length).toBeGreaterThan(0);
    expect(results2.length).toBeGreaterThan(0);
  });
});

describe("Fts5Optimizer - Search result reranking", () => {
  let tmpDir;
  let optimizer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fts5-optimizer-rerank-"));
    optimizer = new Fts5Optimizer({ dbPath: path.join(tmpDir, "facts.db") });
  });

  afterEach(() => {
    optimizer?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reranks results based on recency when enabled", () => {
    const oldDate = "2020-01-01T00:00:00.000Z";
    const recentDate = "2026-05-20T00:00:00.000Z";

    optimizer.addFact("Old fact about programming", { time: oldDate, tags: ["tech"] });
    optimizer.addFact("Recent fact about programming", { time: recentDate, tags: ["tech"] });

    const results = optimizer.enhancedSearch("programming", {
      reranking: {
        recencyWeight: 0.3,
        currentTime: recentDate,
      },
    });

    const recentResult = results.find((r) => r.fact.includes("Recent"));
    const oldResult = results.find((r) => r.fact.includes("Old"));

    expect(recentResult.finalScore).toBeGreaterThan(oldResult.finalScore);
  });

  it("considers tag relevance in reranking", () => {
    optimizer.addFact("Fact about programming", { tags: ["tech", "coding"] });
    optimizer.addFact("Another programming fact", { tags: ["general"] });

    const results = optimizer.enhancedSearch("programming", {
      reranking: {
        tagWeight: 0.4,
        queryTags: ["tech", "coding"],
      },
    });

    const techResult = results.find((r) => r.tags.includes("tech"));
    const generalResult = results.find((r) => r.tags.includes("general"));

    expect(techResult.finalScore).toBeGreaterThan(generalResult.finalScore);
  });

  it("combines FTS score with reranking factors", () => {
    optimizer.addFact("Primary programming fact", {
      time: "2026-05-20T00:00:00.000Z",
      tags: ["tech"],
    });
    optimizer.addFact("Secondary programming note", {
      time: "2026-05-20T00:00:00.000Z",
      tags: ["general"],
    });

    const results = optimizer.enhancedSearch("programming", {
      reranking: {
        recencyWeight: 0.3,
        tagWeight: 0.3,
        queryTags: ["tech"],
        currentTime: "2026-05-20T00:00:00.000Z",
      },
    });

    expect(results[0].fact).toContain("Primary");
    expect(results[0].finalScore).toBeDefined();
    expect(results[0].finalScore).toBeGreaterThan(0);
  });
});

describe("Fts5Optimizer - CJK tokenization improvements", () => {
  let tmpDir;
  let optimizer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fts5-optimizer-cjk-"));
    optimizer = new Fts5Optimizer({ dbPath: path.join(tmpDir, "facts.db") });
  });

  afterEach(() => {
    optimizer?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("supports 4-gram tokenization for better CJK precision", () => {
    optimizer.addFact("用户喜欢在晚上喝茉莉花茶");

    const results = optimizer.enhancedSearch("茉莉花茶", {
      cjkOptions: { enable4Gram: true },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fact).toContain("茉莉花茶");
  });

  it("finds matches with mixed n-gram sizes (2, 3, 4)", () => {
    optimizer.addFact("机器学习是人工智能的重要分支");

    const results2 = optimizer.enhancedSearch("机器", {
      cjkOptions: { enable4Gram: false },
    });
    const results4 = optimizer.enhancedSearch("机器学习", {
      cjkOptions: { enable4Gram: true },
    });

    expect(results2.length).toBeGreaterThan(0);
    expect(results4.length).toBeGreaterThan(0);
  });

  it("handles CJK queries with improved precision over legacy tokenizer", () => {
    optimizer.addFact("北京是中国的首都");
    optimizer.addFact("上海是中国的大城�?);

    const results = optimizer.enhancedSearch("北京", {
      cjkOptions: { enable4Gram: true },
    });

    expect(results.length).toBe(1);
    expect(results[0].fact).toContain("北京");
  });
});

describe("Fts5Optimizer - Query expansion", () => {
  let tmpDir;
  let optimizer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fts5-optimizer-expansion-"));
    optimizer = new Fts5Optimizer({
      dbPath: path.join(tmpDir, "facts.db"),
      synonymMap: {
        "machine learning": ["ML", "机器学习"],
        "programming": ["coding", "开�?],
        "artificial intelligence": ["AI", "人工智能"],
      },
    });
  });

  afterEach(() => {
    optimizer?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("expands query with synonyms for better recall", () => {
    optimizer.addFact("The user loves machine learning");

    const results = optimizer.enhancedSearch("ML", {
      queryExpansion: { enable: true },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fact).toContain("machine learning");
  });

  it("expands Chinese queries with synonym translations", () => {
    optimizer.addFact("人工智能正在改变世界");

    const results = optimizer.enhancedSearch("AI", {
      queryExpansion: { enable: true },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fact).toContain("人工智能");
  });

  it("can disable query expansion when not needed", () => {
    optimizer.addFact("The user loves machine learning");

    const results = optimizer.enhancedSearch("ML", {
      queryExpansion: { enable: false },
    });

    expect(results.length).toBe(0);
  });

  it("expands multiple terms in a single query", () => {
    optimizer.addFact("Machine learning and programming are important");

    const results = optimizer.enhancedSearch("ML coding", {
      queryExpansion: { enable: true },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fact).toContain("Machine learning");
    expect(results[0].fact).toContain("programming");
  });
});

describe("Fts5Optimizer - Fuzzy matching", () => {
  let tmpDir;
  let optimizer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fts5-optimizer-fuzzy-"));
    optimizer = new Fts5Optimizer({ dbPath: path.join(tmpDir, "facts.db") });
  });

  afterEach(() => {
    optimizer?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matches with typos using edit distance", () => {
    optimizer.addFact("The user loves programming");

    const results = optimizer.enhancedSearch("programing", {
      fuzzyMatching: { enable: true, maxEditDistance: 2 },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fact).toContain("programming");
  });

  it("respects max edit distance threshold", () => {
    optimizer.addFact("The user loves programming");

    const resultsStrict = optimizer.enhancedSearch("prgramming", {
      fuzzyMatching: { enable: true, maxEditDistance: 1 },
    });

    const resultsLenient = optimizer.enhancedSearch("prgramming", {
      fuzzyMatching: { enable: true, maxEditDistance: 3 },
    });

    expect(resultsStrict.length).toBe(0);
    expect(resultsLenient.length).toBeGreaterThan(0);
  });

  it("fuzzy matching works with CJK text", () => {
    optimizer.addFact("机器学习很有�?);

    const results = optimizer.enhancedSearch("机学�?, {
      fuzzyMatching: { enable: true, maxEditDistance: 2 },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fact).toContain("机器学习");
  });

  it("can disable fuzzy matching", () => {
    optimizer.addFact("The user loves programming");

    const results = optimizer.enhancedSearch("programing", {
      fuzzyMatching: { enable: false },
    });

    expect(results.length).toBe(0);
  });
});

describe("Fts5Optimizer - Integration and backward compatibility", () => {
  let tmpDir;
  let optimizer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fts5-optimizer-integration-"));
    optimizer = new Fts5Optimizer({ dbPath: path.join(tmpDir, "facts.db") });
  });

  afterEach(() => {
    optimizer?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("maintains backward compatibility with simple search API", () => {
    optimizer.addFact("Simple fact about testing");

    const results = optimizer.enhancedSearch("testing");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fact).toContain("testing");
    expect(results[0].score).toBeDefined();
  });

  it("handles empty queries gracefully", () => {
    const results = optimizer.enhancedSearch("");
    expect(results).toEqual([]);
  });

  it("handles queries with no matches", () => {
    optimizer.addFact("Fact about apples");

    const results = optimizer.enhancedSearch("oranges");
    expect(results).toEqual([]);
  });

  it("supports batch fact insertion", () => {
    const facts = [
      { fact: "First fact about AI", tags: ["tech"] },
      { fact: "Second fact about ML", tags: ["tech"] },
      { fact: "Third fact about programming", tags: ["tech"] },
    ];

    optimizer.addBatch(facts);

    const results = optimizer.enhancedSearch("tech");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns structured result objects with all metadata", () => {
    optimizer.addFact("Test fact", {
      tags: ["test"],
      time: "2026-05-20T00:00:00.000Z",
    });

    const results = optimizer.enhancedSearch("test", {
      reranking: {
        recencyWeight: 0.2,
        currentTime: "2026-05-20T00:00:00.000Z",
      },
    });

    expect(results[0]).toMatchObject({
      id: expect.any(Number),
      fact: "Test fact",
      tags: ["test"],
      time: "2026-05-20T00:00:00.000Z",
      score: expect.any(Number),
      finalScore: expect.any(Number),
    });
  });

  it("supports LIKE fallback when FTS fails", () => {
    optimizer.addFact("Special fact with unique keywords");

    const results = optimizer.enhancedSearch("unique keywords");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("Fts5Optimizer - Edit distance utility", () => {
  it("calculates Levenshtein distance correctly", async () => {
    const { levenshteinDistance } = await import("../lib/memory/fts5-optimizer.js");

    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("programming", "programing")).toBe(1);
    expect(levenshteinDistance("same", "same")).toBe(0);
    expect(levenshteinDistance("", "test")).toBe(4);
  });
});
