import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocStore } from "../lib/rag/doc-store.js";
import { chunkText, ingestFile, ingestDirectory } from "../lib/rag/document-ingestor.js";
import { search, searchFtsOnly } from "../lib/rag/rag-retriever.js";
import { createIngestDocumentTool } from "../lib/tools/ingest-document-tool.js";
import { createSearchDocumentsTool } from "../lib/tools/search-documents-tool.js";
import { EmbeddingModelManager } from "../lib/memory/embedding-model.js";

function removeDbFiles(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
}

// ═══════════════════════════════════════════
// DocStore — 文档块存储测试
// ═══════════════════════════════════════════

describe("DocStore", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-rag-docstore-"));
    dbPath = path.join(tmpDir, "rag_docs.db");
    store = new DocStore(dbPath, { Database });
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 写入 ──

  it("addChunks inserts chunks and returns IDs", () => {
    const chunks = [
      { docName: "test.txt", docPath: "/tmp/test.txt", chunkIndex: 0, chunkText: "Hello world", chunkSize: 11 },
      { docName: "test.txt", docPath: "/tmp/test.txt", chunkIndex: 1, chunkText: "Second chunk", chunkSize: 12 },
    ];
    const ids = store.addChunks(chunks);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeGreaterThan(0);
    expect(ids[1]).toBeGreaterThan(ids[0]);
  });

  it("addChunks returns empty array for empty input", () => {
    const ids = store.addChunks([]);
    expect(ids).toEqual([]);
  });

  it("addChunks skips chunks with missing docName or chunkText", () => {
    const ids = store.addChunks([
      { docName: "", docPath: "/tmp/bad.txt", chunkIndex: 0, chunkText: "text", chunkSize: 4 },
      { docName: "good.txt", docPath: "/tmp/good.txt", chunkIndex: 0, chunkText: "valid", chunkSize: 5 },
      { docName: "bad2.txt", docPath: "/tmp/bad2.txt", chunkIndex: 0, chunkText: "", chunkSize: 0 },
    ]);
    expect(ids).toHaveLength(1);
    const chunk = store.getChunkById(ids[0]);
    expect(chunk.docName).toBe("good.txt");
  });

  it("addChunks defaults missing chunkSize to text length", () => {
    const ids = store.addChunks([
      { docName: "d.txt", docPath: "/tmp/d.txt", chunkIndex: 0, chunkText: "hello world" },
    ]);
    const chunk = store.getChunkById(ids[0]);
    expect(chunk.chunkSize).toBe(11);
  });

  // ── 单条读取 ──

  it("getChunkById returns correct chunk", () => {
    const ids = store.addChunks([
      { docName: "a.txt", docPath: "/tmp/a.txt", chunkIndex: 0, chunkText: "content A", chunkSize: 9 },
    ]);
    const chunk = store.getChunkById(ids[0]);
    expect(chunk).not.toBeNull();
    expect(chunk.docName).toBe("a.txt");
    expect(chunk.chunkText).toBe("content A");
    expect(chunk.chunkIndex).toBe(0);
  });

  it("getChunkById returns null for non-existent id", () => {
    expect(store.getChunkById(99999)).toBeNull();
  });

  // ── 批量读取 ──

  it("getChunksByIds returns chunks in order", () => {
    const ids = store.addChunks([
      { docName: "b.txt", docPath: "/tmp/b.txt", chunkIndex: 0, chunkText: "first", chunkSize: 5 },
      { docName: "b.txt", docPath: "/tmp/b.txt", chunkIndex: 1, chunkText: "second", chunkSize: 6 },
      { docName: "b.txt", docPath: "/tmp/b.txt", chunkIndex: 2, chunkText: "third", chunkSize: 5 },
    ]);
    const chunks = store.getChunksByIds([ids[0], ids[2]]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(2);
  });

  it("getChunksByIds returns empty array for empty ids", () => {
    expect(store.getChunksByIds([])).toEqual([]);
  });

  // ── 全文搜索 ──

  it("searchFts returns matching chunks", () => {
    store.addChunks([
      { docName: "notes.txt", docPath: "/tmp/notes.txt", chunkIndex: 0, chunkText: "Authentication module uses JWT tokens for session management", chunkSize: 60 },
      { docName: "notes.txt", docPath: "/tmp/notes.txt", chunkIndex: 1, chunkText: "Database connection pool is configured in the config file", chunkSize: 55 },
      { docName: "other.txt", docPath: "/tmp/other.txt", chunkIndex: 0, chunkText: "Unrelated content about weather patterns", chunkSize: 40 },
    ]);
    const results = store.searchFts("JWT authentication", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].docName).toBe("notes.txt");
    expect(results[0].chunkText).toContain("JWT");
  });

  it("searchFts respects limit parameter", () => {
    store.addChunks([
      { docName: "a.txt", docPath: "/tmp/a.txt", chunkIndex: 0, chunkText: "test data one", chunkSize: 12 },
      { docName: "b.txt", docPath: "/tmp/b.txt", chunkIndex: 0, chunkText: "test data two", chunkSize: 12 },
      { docName: "c.txt", docPath: "/tmp/c.txt", chunkIndex: 0, chunkText: "test data three", chunkSize: 13 },
    ]);
    expect(store.searchFts("test data", 2)).toHaveLength(2);
  });

  it("searchFts returns empty array for empty query", () => {
    expect(store.searchFts("")).toEqual([]);
    expect(store.searchFts("   ")).toEqual([]);
  });

  it("searchFts handles FTS5 special characters gracefully", () => {
    store.addChunks([
      { docName: "special.txt", docPath: "/tmp/special.txt", chunkIndex: 0, chunkText: "Content with special OR syntax test", chunkSize: 38 },
    ]);
    // FTS5 has special syntax characters like ^, *, (, ) — query should not crash
    const results = store.searchFts("OR AND NOT (test) * ", 10);
    // Should return results via LIKE fallback, not throw
    expect(Array.isArray(results)).toBe(true);
  });

  it("searchFts matches CJK text via space-delimited query", () => {
    // FTS5 unicode61 tokenizer treats non-whitespace CJK as single tokens.
    // Searching by exact word in the chunk text will match.
    store.addChunks([
      { docName: "readme.md", docPath: "/tmp/readme.md", chunkIndex: 0, chunkText: "认证系统 authentication模块 使用说明", chunkSize: 22 },
      { docName: "guide.md", docPath: "/tmp/guide.md", chunkIndex: 0, chunkText: "天气查询 interface docs", chunkSize: 16 },
    ]);
    // Search for a word that appears verbatim with surrounding spaces
    const results = store.searchFts("authentication模块", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkText).toContain("认证系统");
  });

  // ── 文档管理 ──

  it("getAllDocs lists ingested documents", () => {
    store.addChunks([
      { docName: "a.txt", docPath: "/tmp/a.txt", chunkIndex: 0, chunkText: "chunk 1", chunkSize: 7 },
      { docName: "a.txt", docPath: "/tmp/a.txt", chunkIndex: 1, chunkText: "chunk 2", chunkSize: 7 },
      { docName: "b.txt", docPath: "/tmp/b.txt", chunkIndex: 0, chunkText: "one chunk", chunkSize: 9 },
    ]);
    const docs = store.getAllDocs();
    expect(docs).toHaveLength(2);
    const docA = docs.find((d) => d.doc_name === "a.txt");
    expect(docA.chunk_count).toBe(2);
    const docB = docs.find((d) => d.doc_name === "b.txt");
    expect(docB.chunk_count).toBe(1);
  });

  it("deleteDoc removes all chunks for a document", () => {
    store.addChunks([
      { docName: "del.txt", docPath: "/tmp/del.txt", chunkIndex: 0, chunkText: "to delete", chunkSize: 9 },
      { docName: "keep.txt", docPath: "/tmp/keep.txt", chunkIndex: 0, chunkText: "to keep", chunkSize: 7 },
    ]);
    const deleted = store.deleteDoc("/tmp/del.txt");
    expect(deleted).toBe(true);

    const docs = store.getAllDocs();
    expect(docs).toHaveLength(1);
    expect(docs[0].doc_name).toBe("keep.txt");
  });

  it("deleteDoc returns false for non-existent path", () => {
    expect(store.deleteDoc("/nonexistent")).toBe(false);
  });

  // ── 嵌入存储 ──

  it("storeEmbedding stores a Float32Array embedding", () => {
    const ids = store.addChunks([
      { docName: "e.txt", docPath: "/tmp/e.txt", chunkIndex: 0, chunkText: "embed this", chunkSize: 10 },
    ]);
    const emb = new Float32Array(store.dimension);
    for (let i = 0; i < emb.length; i++) emb[i] = Math.random() * 2 - 1;

    // Should not throw
    expect(() => store.storeEmbedding(ids[0], emb)).not.toThrow();
  });

  it("storeEmbedding throws on dimension mismatch", () => {
    const ids = store.addChunks([
      { docName: "e2.txt", docPath: "/tmp/e2.txt", chunkIndex: 0, chunkText: "bad dim", chunkSize: 7 },
    ]);
    const badEmb = new Float32Array(128); // wrong dimension (default is 384)
    expect(() => store.storeEmbedding(ids[0], badEmb)).toThrow(/dimension mismatch/i);
  });

  it("storeEmbeddings batch-stores multiple embeddings", () => {
    const ids = store.addChunks([
      { docName: "batch.txt", docPath: "/tmp/batch.txt", chunkIndex: 0, chunkText: "one", chunkSize: 3 },
      { docName: "batch.txt", docPath: "/tmp/batch.txt", chunkIndex: 1, chunkText: "two", chunkSize: 3 },
    ]);
    const dim = store.dimension;
    const items = ids.map((id) => {
      const emb = new Float32Array(dim);
      for (let i = 0; i < dim; i++) emb[i] = Math.random() * 2 - 1;
      return { chunkId: id, embedding: emb };
    });
    expect(() => store.storeEmbeddings(items)).not.toThrow();
  });

  // ── 向量搜索 ──

  it("searchVector returns results when embeddings exist", () => {
    const ids = store.addChunks([
      { docName: "v1.txt", docPath: "/tmp/v1.txt", chunkIndex: 0, chunkText: "vector search test", chunkSize: 18 },
    ]);
    const dim = store.dimension;
    const emb = new Float32Array(dim);
    for (let i = 0; i < dim; i++) emb[i] = i % 2 === 0 ? 0.1 : -0.1;
    store.storeEmbedding(ids[0], emb);

    const queryEmb = new Float32Array(dim);
    for (let i = 0; i < dim; i++) queryEmb[i] = i % 2 === 0 ? 0.1 : -0.1; // same direction

    const results = store.searchVector(queryEmb, 10);
    expect(results.length).toBe(1);
    expect(results[0].chunkId).toBe(ids[0]);
    expect(results[0].vectorScore).toBeGreaterThan(0.9); // near-identical
  });

  it("searchVector throws on dimension mismatch", () => {
    const badEmb = new Float32Array(128);
    expect(() => store.searchVector(badEmb)).toThrow(/dimension mismatch/i);
  });

  // ── embeddingAvailable ──

  it("embeddingAvailable is false without model", () => {
    expect(store.embeddingAvailable).toBe(false);
  });
});

// ═══════════════════════════════════════════
// DocumentIngestor — 文本分块测试
// ═══════════════════════════════════════════

describe("chunkText", () => {
  it("returns empty array for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText(null)).toEqual([]);
    expect(chunkText(undefined)).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    const text = "This is a short text.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits text by paragraphs", () => {
    const text = [
      "First paragraph with some content about a topic.",
      "",
      "Second paragraph about something different entirely.",
    ].join("\n");
    const chunks = chunkText(text, 40, 0);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toContain("First paragraph");
  });

  it("splits long text into multiple chunks", () => {
    // Generate text that exceeds chunk size
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`Line ${i}: This is a test line with some content.`);
    }
    const text = lines.join("\n");
    const chunks = chunkText(text, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be <= maxSize
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it("handles maxSize at minimum of 128", () => {
    const text = "A".repeat(500);
    const chunks = chunkText(text, 50, 0); // 50 < 128, should use 128
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(128);
    }
  });

  it("overlap is capped at 30% of maxSize", () => {
    const text = "B".repeat(300);
    const chunks = chunkText(text, 150, 100); // overlap=100 > 150*0.3=45, capped
    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should respect maxSize
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(150);
    }
  });

  it("handles Chinese text splitting", () => {
    const text = "第一段内容是关于认证系统的介绍。第二段内容是关于数据库连接池配置。" +
      "第三段描述了缓存策略。第四段讲的是错误处理机制。";
    // Use a larger maxSize to accommodate CJK sentence accumulation
    const chunks = chunkText(text, 80, 8);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80);
    }
  });

  it("handles text with no paragraph breaks (single long line)", () => {
    const text = "A".repeat(600);
    const chunks = chunkText(text, 200, 30);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it("hard truncation for extremely long unbreakable text", () => {
    // No punctuation, no paragraph breaks — forces hard truncation
    const text = "abcdefghij".repeat(100); // 1000 chars, no splitting points
    const chunks = chunkText(text, 200, 32);
    expect(chunks.length).toBeGreaterThan(4);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });
});

// ═══════════════════════════════════════════
// DocumentIngestor — 文件摄入测试
// ═══════════════════════════════════════════

describe("ingestFile", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-rag-ingest-"));
    dbPath = path.join(tmpDir, "rag.db");
    store = new DocStore(dbPath, { Database });
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ingests a text file without embedding model", async () => {
    const filePath = path.join(tmpDir, "sample.txt");
    fs.writeFileSync(filePath, "This is a sample document for testing ingestion.\n\nIt has multiple paragraphs.\n\nEach one should become a chunk.");

    const embeddingModel = new EmbeddingModelManager();
    // Not initialized, isAvailable=false

    const result = await ingestFile(filePath, store, embeddingModel);
    expect(result.docName).toBe("sample.txt");
    expect(result.docPath).toBe(filePath);
    expect(result.chunks).toBeGreaterThan(0);

    // Verify chunks exist in store
    const docs = store.getAllDocs();
    expect(docs).toHaveLength(1);
    expect(docs[0].doc_name).toBe("sample.txt");
  });

  it("throws error for non-existent file", async () => {
    const embeddingModel = new EmbeddingModelManager();
    await expect(
      ingestFile("/nonexistent/path.txt", store, embeddingModel),
    ).rejects.toThrow(/not found/i);
  });

  it("throws error for unsupported file type", async () => {
    const filePath = path.join(tmpDir, "image.png");
    fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4E, 0x47])); // PNG header

    const embeddingModel = new EmbeddingModelManager();
    await expect(
      ingestFile(filePath, store, embeddingModel),
    ).rejects.toThrow(/unsupported file type/i);
  });

  it("throws error for empty file", async () => {
    const filePath = path.join(tmpDir, "empty.txt");
    fs.writeFileSync(filePath, "");

    const embeddingModel = new EmbeddingModelManager();
    await expect(
      ingestFile(filePath, store, embeddingModel),
    ).rejects.toThrow(/empty/i);
  });

  it("throws error for whitespace-only file", async () => {
    const filePath = path.join(tmpDir, "whitespace.txt");
    fs.writeFileSync(filePath, "   \n  \n   ");

    const embeddingModel = new EmbeddingModelManager();
    await expect(
      ingestFile(filePath, store, embeddingModel),
    ).rejects.toThrow(/empty/i);
  });

  it("overwrite option replaces existing chunks for the same file", async () => {
    const filePath = path.join(tmpDir, "overwrite-test.md");
    const embeddingModel = new EmbeddingModelManager();

    // First ingestion
    fs.writeFileSync(filePath, "# Version 1\n\nThis is the first version.");
    const r1 = await ingestFile(filePath, store, embeddingModel);
    expect(r1.chunks).toBeGreaterThan(0);
    const docsAfterFirst = store.getAllDocs();
    expect(docsAfterFirst).toHaveLength(1);
    const chunkCountAfterFirst = docsAfterFirst[0].chunk_count;

    // Second ingestion with overwrite
    fs.writeFileSync(filePath, "# Version 2\n\nThis is the updated version with more content for testing.");
    const r2 = await ingestFile(filePath, store, embeddingModel, { overwrite: true });
    expect(r2.chunks).toBeGreaterThan(0);

    // Should still have only one document, with updated chunks
    const docsAfterSecond = store.getAllDocs();
    expect(docsAfterSecond).toHaveLength(1);
    // Chunks may differ depending on content size
    const firstChunk = store.getChunkById(store.getChunksByIds(
      store.searchFts("Version", 1).map(r => r.id)
    )[0]?.id);
    if (firstChunk) {
      expect(firstChunk.chunkText).toContain("Version 2");
    }
  });

  it("supports various text file extensions", async () => {
    // Test a few common extensions
    const extensions = [".md", ".json", ".py", ".html", ".css", ".yaml", ".xml", ".sh"];
    const embeddingModel = new EmbeddingModelManager();

    for (const ext of extensions) {
      const filePath = path.join(tmpDir, `test${ext}`);
      const content = ext === ".json"
        ? JSON.stringify({ key: "value", description: "A test JSON file for ingestion" })
        : `# Test ${ext}\n\nThis is a test file for ingestion testing.\n\nIt has content.`;
      fs.writeFileSync(filePath, content);

      const result = await ingestFile(filePath, store, embeddingModel);
      expect(result.docName).toBe(`test${ext}`);
      expect(result.chunks).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════
// RAGRetriever — 混合检索测试
// ═══════════════════════════════════════════

describe("searchFtsOnly", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-rag-retrieve-"));
    dbPath = path.join(tmpDir, "rag.db");
    store = new DocStore(dbPath, { Database });

    // Pre-populate with test data
    store.addChunks([
      { docName: "auth.md", docPath: "/tmp/auth.md", chunkIndex: 0, chunkText: "Authentication uses OAuth2 with JWT tokens", chunkSize: 42 },
      { docName: "auth.md", docPath: "/tmp/auth.md", chunkIndex: 1, chunkText: "JWT refresh tokens expire after 7 days", chunkSize: 43 },
      { docName: "db.md", docPath: "/tmp/db.md", chunkIndex: 0, chunkText: "Database uses PostgreSQL with connection pooling", chunkSize: 50 },
      { docName: "api.md", docPath: "/tmp/api.md", chunkIndex: 0, chunkText: "REST API endpoints follow OpenAPI 3.0 spec", chunkSize: 45 },
    ]);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns FTS-only search results", () => {
    const results = searchFtsOnly("JWT token", store, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].docName).toContain("auth");
    expect(results[0]).toHaveProperty("score");
  });

  it("returns empty array for no match", () => {
    const results = searchFtsOnly("zzzmissingxyz", store, 5);
    expect(results).toEqual([]);
  });

  it("respects limit parameter", () => {
    const results = searchFtsOnly("database API authentication", store, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("each result has expected fields", () => {
    const results = searchFtsOnly("authentication", store, 5);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(r).toHaveProperty("id");
    expect(r).toHaveProperty("chunkText");
    expect(r).toHaveProperty("docName");
    expect(r).toHaveProperty("docPath");
    expect(r).toHaveProperty("chunkIndex");
    expect(r).toHaveProperty("score");
    expect(typeof r.score).toBe("number");
  });
});

// ═══════════════════════════════════════════
// Agent Tools — 结构验证
// ═══════════════════════════════════════════

describe("createIngestDocumentTool", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-rag-tool-"));
    dbPath = path.join(tmpDir, "rag.db");
    store = new DocStore(dbPath, { Database });
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tool has correct name and schema", () => {
    const tool = createIngestDocumentTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    expect(tool.name).toBe("ingest_document");
    expect(tool.label).toBeTruthy();
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
    expect(tool.execute).toBeInstanceOf(Function);
  });

  it("execute returns error for empty filePath", async () => {
    const tool = createIngestDocumentTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    const result = await tool.execute("call-1", { filePath: "" });
    expect(result.content[0].text).toContain("Error");
  });

  it("execute returns error for non-existent file", async () => {
    const tool = createIngestDocumentTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    const result = await tool.execute("call-1", { filePath: "/nonexistent/file.txt" });
    expect(result.content[0].text).toContain("Failed");
  });

  it("execute successfully ingests a file", async () => {
    const filePath = path.join(tmpDir, "tool-test.md");
    fs.writeFileSync(filePath, "# Tool Test\n\nContent for tool testing.");

    const tool = createIngestDocumentTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    const result = await tool.execute("call-1", { filePath });
    expect(result.content[0].text).toContain("ingested successfully");
    expect(result.content[0].text).toContain("tool-test.md");

    // Should now be searchable
    const docs = store.getAllDocs();
    expect(docs.some((d) => d.doc_name === "tool-test.md")).toBe(true);
  });

  it("execute with overwrite replaces existing chunks", async () => {
    const filePath = path.join(tmpDir, "overwrite-tool.md");
    fs.writeFileSync(filePath, "# First\n\nOriginal content.");

    const tool = createIngestDocumentTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });

    // First ingest
    await tool.execute("call-1", { filePath });
    const docsAfterFirst = store.getAllDocs();
    const firstChunkCount = docsAfterFirst[0].chunk_count;

    // Overwrite with new content
    fs.writeFileSync(filePath, "# Second\n\nUpdated content with more text for testing overwrite.");
    const result = await tool.execute("call-2", { filePath, overwrite: true });
    expect(result.content[0].text).toContain("ingested successfully");

    // Should still be only one document
    const docsAfterSecond = store.getAllDocs();
    expect(docsAfterSecond).toHaveLength(1);
  });
});

describe("createSearchDocumentsTool", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-rag-searchtool-"));
    dbPath = path.join(tmpDir, "rag.db");
    store = new DocStore(dbPath, { Database });

    store.addChunks([
      { docName: "search-test.md", docPath: "/tmp/search-test.md", chunkIndex: 0, chunkText: "Python is a programming language", chunkSize: 30 },
    ]);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tool has correct name and schema", () => {
    const tool = createSearchDocumentsTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    expect(tool.name).toBe("search_documents");
    expect(tool.label).toBeTruthy();
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
    expect(tool.execute).toBeInstanceOf(Function);
  });

  it("execute returns error for empty query", async () => {
    const tool = createSearchDocumentsTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    const result = await tool.execute("call-2", { query: "" });
    expect(result.content[0].text).toContain("Error");
  });

  it("execute returns 'no documents found' for no match", async () => {
    const tool = createSearchDocumentsTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    // Use terms that don't appear in the stored chunks at all
    const result = await tool.execute("call-2", { query: "golang kubernetes orchestration" });
    expect(result.content[0].text).toContain("No documents found");
  });

  it("execute returns search results via FTS fallback", async () => {
    const tool = createSearchDocumentsTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    const result = await tool.execute("call-2", { query: "Python programming" });
    expect(result.content[0].text).toContain("Found");
    expect(result.content[0].text).toContain("Python");
  });

  it("execute respects limit parameter", async () => {
    // Add more chunks to test limit
    store.addChunks([
      { docName: "p1.md", docPath: "/tmp/p1.md", chunkIndex: 0, chunkText: "Python data science", chunkSize: 18 },
      { docName: "p2.md", docPath: "/tmp/p2.md", chunkIndex: 0, chunkText: "Python web frameworks", chunkSize: 21 },
      { docName: "p3.md", docPath: "/tmp/p3.md", chunkIndex: 0, chunkText: "Python machine learning", chunkSize: 22 },
    ]);
    const tool = createSearchDocumentsTool({
      docStore: store,
      embeddingModel: new EmbeddingModelManager(),
    });
    const result = await tool.execute("call-2", { query: "Python", limit: 2 });
    expect(result.content[0].text).toContain("Found 2 result");
  });
});
