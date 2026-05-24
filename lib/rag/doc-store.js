/**
 * doc-store.js — RAG 文档块存储
 *
 * 管理文档分块及其向量嵌入，支持 FTS5 全文搜索和向量语义搜索。
 * 复用 EmbeddingModelManager 实例（由 FactStore 传入），共享嵌入模型。
 */

import { createRequire } from "module";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("doc-store");

const require = createRequire(import.meta.url);
let BetterSqliteDatabase = null;

function loadBetterSqliteDatabase() {
  if (!BetterSqliteDatabase) {
    const mod = require("better-sqlite3");
    BetterSqliteDatabase = mod?.default || mod;
  }
  return BetterSqliteDatabase;
}

const DEFAULT_DIMENSION = 384;

// ── 工具函数 ──

function normalizeSearchText(text) {
  return String(text || "").normalize("NFKC").trim();
}

export class DocStore {
  /**
   * @param {string} dbPath - rag_docs.db 路径
   * @param {object} [opts]
   * @param {import('../memory/embedding-model.js').EmbeddingModelManager} [opts.embeddingModel]
   * @param {number} [opts.dimension] - 嵌入维度 (默认 384)
   */
  constructor(dbPath, opts = {}) {
    const Database = opts.Database || loadBetterSqliteDatabase();
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this._dimension = opts.dimension || DEFAULT_DIMENSION;
    this._embeddingModel = opts.embeddingModel || null;

    this._initSchema();
    this._registerCosineFunction();
    this._prepareStatements();
    log?.info?.("DocStore initialized");
  }

  /** 嵌入维度 */
  get dimension() { return this._dimension; }

  /** 嵌入模型是否可用 */
  get embeddingAvailable() {
    return this._embeddingModel?.isAvailable === true;
  }

  // ── Schema ──

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_chunks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_name    TEXT NOT NULL,
        doc_path    TEXT NOT NULL,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        chunk_text  TEXT NOT NULL,
        chunk_size  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_doc_chunks_path ON doc_chunks(doc_path);
      CREATE INDEX IF NOT EXISTS idx_doc_chunks_name ON doc_chunks(doc_name);
    `);

    // FTS5 全文搜索表
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunks_fts USING fts5(
          chunk_text,
          content=doc_chunks,
          content_rowid=id,
          tokenize='unicode61'
        );
      `);
    } catch (err) {
      // 忽略"表已存在"错误，其他错误记录警告
      if (!err.message.includes("already exists")) {
        log?.warn?.(`FTS5 table creation failed: ${err.message}`);
      }
    }

    // 触发器：保持 FTS 同步
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS doc_chunks_ai AFTER INSERT ON doc_chunks BEGIN
        INSERT INTO doc_chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
      END;
      CREATE TRIGGER IF NOT EXISTS doc_chunks_ad AFTER DELETE ON doc_chunks BEGIN
        INSERT INTO doc_chunks_fts(doc_chunks_fts, rowid, chunk_text) VALUES ('delete', old.id, old.chunk_text);
      END;
      CREATE TRIGGER IF NOT EXISTS doc_chunks_au AFTER UPDATE ON doc_chunks BEGIN
        INSERT INTO doc_chunks_fts(doc_chunks_fts, rowid, chunk_text) VALUES ('delete', old.id, old.chunk_text);
        INSERT INTO doc_chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
      END;
    `);

    // 嵌入存储表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        chunk_id   INTEGER PRIMARY KEY,
        embedding  BLOB NOT NULL,
        dimension  INTEGER NOT NULL DEFAULT ${this._dimension},
        FOREIGN KEY (chunk_id) REFERENCES doc_chunks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chunk_emb_dim ON chunk_embeddings(dimension);
    `);
  }

  _registerCosineFunction() {
    try {
      this.db.function("cosine_similarity_chunk", (a, b) => {
        const bufA = a instanceof Buffer ? a : Buffer.from(a || []);
        const bufB = b instanceof Buffer ? b : Buffer.from(b || []);
        const dim = this._dimension;
        if (bufA.length !== dim * 4 || bufB.length !== dim * 4) return 0;

        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < dim * 4; i += 4) {
          const va = bufA.readFloatLE(i);
          const vb = bufB.readFloatLE(i);
          dot += va * vb;
          normA += va * va;
          normB += vb * vb;
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
      });
    } catch {
      // 函数已注册
    }
  }

  _prepareStatements() {
    this._stmts = {
      insert: this.db.prepare(`
        INSERT INTO doc_chunks (doc_name, doc_path, chunk_index, chunk_text, chunk_size, created_at)
        VALUES (@docName, @docPath, @chunkIndex, @chunkText, @chunkSize, @createdAt)
      `),
      insertEmbedding: this.db.prepare(`
        INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding, dimension)
        VALUES (@chunkId, @embedding, @dimension)
      `),
      getById: this.db.prepare("SELECT * FROM doc_chunks WHERE id = ?"),
      getByIdsCache: new Map(), // 缓存 prepared statements
      getByIds: (ids) => {
        if (!ids || ids.length === 0) return [];
        const key = ids.length;
        if (!this.queries.getByIdsCache.has(key)) {
          const placeholders = ids.map(() => "?").join(",");
          this.queries.getByIdsCache.set(
            key,
            this.db.prepare(`SELECT * FROM doc_chunks WHERE id IN (${placeholders}) ORDER BY doc_path, chunk_index`)
          );
        }
        return this.queries.getByIdsCache.get(key).all(...ids);
      },
      deleteByPath: this.db.prepare("DELETE FROM doc_chunks WHERE doc_path = ?"),
      getAllDocs: this.db.prepare(`
        SELECT DISTINCT doc_name, doc_path, COUNT(*) as chunk_count,
               MIN(created_at) as first_ingested
        FROM doc_chunks GROUP BY doc_path ORDER BY first_ingested DESC
      `),
    };
  }

  // ── 写入 ──

  /**
   * 批量新增文档块
   * @param {Array<{ docName: string, docPath: string, chunkIndex: number, chunkText: string, chunkSize: number }>} chunks
   * @returns {number[]} 插入的 chunk ID 数组
   */
  addChunks(chunks) {
    if (!chunks || chunks.length === 0) return [];

    const now = new Date().toISOString();
    const ids = [];

    const run = this.db.transaction(() => {
      for (const c of chunks) {
        if (!c.docName || !c.chunkText) {
          log?.warn?.("Skipping chunk with empty docName or chunkText");
          continue;
        }
        const result = this._stmts.insert.run({
          docName: c.docName,
          docPath: c.docPath || "",
          chunkIndex: c.chunkIndex ?? 0,
          chunkText: c.chunkText,
          chunkSize: c.chunkSize ?? c.chunkText.length,
          createdAt: now,
        });
        ids.push(Number(result.lastInsertRowid));
      }
    });
    run();
    return ids;
  }

  /**
   * 存储块的向量嵌入
   * @param {number} chunkId
   * @param {Float32Array} embedding
   */
  storeEmbedding(chunkId, embedding) {
    if (embedding.length !== this._dimension) {
      throw new Error(`Embedding dimension mismatch: expected ${this._dimension}, got ${embedding.length}`);
    }
    const buffer = Buffer.from(
      new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength),
    );
    this._stmts.insertEmbedding.run({
      chunkId,
      embedding: buffer,
      dimension: this._dimension,
    });
  }

  /**
   * 存储多个块的向量嵌入
   * @param {Array<{ chunkId: number, embedding: Float32Array }>} items
   */
  storeEmbeddings(items) {
    const run = this.db.transaction(() => {
      for (const item of items) {
        this.storeEmbedding(item.chunkId, item.embedding);
      }
    });
    run();
  }

  // ── 搜索 ──

  /**
   * FTS5 全文搜索
   * @param {string} query
   * @param {number} [limit=20]
   * @returns {Array<{ id: number, chunkText: string, docName: string, docPath: string, chunkIndex: number, rank: number }>}
   */
  searchFts(query, limit = 20) {
    const normalized = normalizeSearchText(query);
    if (!normalized) return [];

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const ftsQuery = tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");

    try {
      const rows = this.db.prepare(`
        SELECT dc.*, rank
        FROM doc_chunks_fts fts
        JOIN doc_chunks dc ON dc.id = fts.rowid
        WHERE doc_chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit);

      return rows.map((r) => ({
        id: r.id,
        chunkText: r.chunk_text,
        docName: r.doc_name,
        docPath: r.doc_path,
        chunkIndex: r.chunk_index,
        rank: r.rank,
      }));
    } catch {
      // FTS5 query syntax error (e.g. special characters) — fall back to LIKE
      log?.warn?.(`FTS5 query syntax error, falling back to LIKE: "${normalized.slice(0, 100)}"`);
      return this._likeFallback(normalized, limit);
    }
  }

  /**
   * LIKE 降级搜索（FTS5 查询语法错误时使用）
   * @param {string} query
   * @param {number} limit
   * @returns {Array<object>}
   */
  _likeFallback(query, limit) {
    const rows = this.db.prepare(
      `SELECT * FROM doc_chunks WHERE chunk_text LIKE '%' || ? || '%' ORDER BY created_at DESC LIMIT ?`
    ).all(query, limit);
    return rows.map((r) => ({
      id: r.id,
      chunkText: r.chunk_text,
      docName: r.doc_name,
      docPath: r.doc_path,
      chunkIndex: r.chunk_index,
      rank: 0,
    }));
  }

  /**
   * 向量语义搜索
   * @param {Float32Array} queryEmbedding
   * @param {number} [limit=20]
   * @returns {Array<{ chunkId: number, vectorScore: number }>}
   */
  searchVector(queryEmbedding, limit = 20) {
    if (queryEmbedding.length !== this._dimension) {
      throw new Error(`Embedding dimension mismatch: expected ${this._dimension}, got ${queryEmbedding.length}`);
    }

    const queryBuffer = Buffer.from(
      new Uint8Array(queryEmbedding.buffer, queryEmbedding.byteOffset, queryEmbedding.byteLength),
    );

    const rows = this.db.prepare(`
      SELECT
        chunk_id,
        cosine_similarity_chunk(embedding, ?) as vectorScore
      FROM chunk_embeddings
      WHERE dimension = ?
      ORDER BY vectorScore DESC
      LIMIT ?
    `).all(queryBuffer, this._dimension, limit);

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      vectorScore: row.vectorScore,
    }));
  }

  // ── 读取 ──

  /**
   * 按 ID 获取文档块
   * @param {number} id
   * @returns {object|null}
   */
  getChunkById(id) {
    const row = this._stmts.getById.get(id);
    if (!row) return null;
    return this._rowToChunk(row);
  }

  /**
   * 按 ID 数组批量获取文档块
   * @param {number[]} ids
   * @returns {object[]}
   */
  getChunksByIds(ids) {
    const rows = this._stmts.getByIds(ids);
    return rows.map((r) => this._rowToChunk(r));
  }

  /**
   * 列出所有已摄入的文档
   * @returns {Array<{ docName: string, docPath: string, chunkCount: number, firstIngested: string }>}
   */
  getAllDocs() {
    return this._stmts.getAllDocs.all();
  }

  /**
   * 删除指定路径的文档及其全部分块
   * @param {string} docPath
   * @returns {boolean}
   */
  deleteDoc(docPath) {
    const result = this._stmts.deleteByPath.run(docPath);
    return result.changes > 0;
  }

  /**
   * 文档块行转对象
   */
  _rowToChunk(row) {
    return {
      id: row.id,
      docName: row.doc_name,
      docPath: row.doc_path,
      chunkIndex: row.chunk_index,
      chunkText: row.chunk_text,
      chunkSize: row.chunk_size,
      createdAt: row.created_at,
    };
  }

  /** 关闭数据库 */
  close() {
    if (this.db?.open) this.db.close();
  }
}
