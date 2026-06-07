/**
 * vector-search.js — Vector-based semantic search engine
 *
 * Stores embeddings in SQLite and performs cosine similarity search.
 * Supports hybrid search combining vector scores with FTS5 results.
 */

import { createRequire } from "module";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("vector-search");

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
const DEFAULT_VECTOR_WEIGHT = 0.5;
const DEFAULT_FTS_WEIGHT = 0.3;
const DEFAULT_TAG_WEIGHT = 0.2;

// ── L2 归一化辅助函数 ──

/**
 * L2-normalize a Float32Array vector in-place.
 * After normalization, dot product equals cosine similarity.
 * @param {Float32Array} vec
 * @returns {Float32Array} The same array (normalized in-place)
 */
function normalizeL2(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

/**
 * L2-normalize and return a NEW Float32Array (safe copy).
 */
function normalizeL2Copy(vec) {
  const copy = new Float32Array(vec);
  return normalizeL2(copy);
}

// ── 分桶近似索引 ──

const BUCKET_DIM = 8;
const BUCKET_SUB_DIM = Math.ceil(DEFAULT_DIMENSION / BUCKET_DIM); // 48

/**
 * 将 384 维向量降维为 8 维粗糙桶坐标。
 * 每 48 维取平均，符号位 (+1 或 -1) 作为桶坐标。
 * @param {Float32Array} embedding - 已 L2 归一化的向量
 * @returns {string} 逗号分隔的桶坐标（如 "1,-1,-1,1,-1,1,1,-1"）
 */
function computeBucket(embedding) {
  const signs = [];
  for (let d = 0; d < BUCKET_DIM; d++) {
    let sum = 0;
    const start = d * BUCKET_SUB_DIM;
    const end = Math.min(start + BUCKET_SUB_DIM, embedding.length);
    for (let i = start; i < end; i++) sum += embedding[i];
    signs.push(sum >= 0 ? 1 : -1);
  }
  return signs.join(",");
}

/**
 * 生成候选桶集合：翻转 0~n 个符号位
 */
function expandBuckets(bucketStr, maxFlips) {
  const signs = bucketStr.split(",").map(Number);
  const result = [bucketStr];
  if (maxFlips <= 0) return result;

  // 翻转 1 位
  for (let i = 0; i < BUCKET_DIM; i++) {
    const variant = [...signs];
    variant[i] = -variant[i];
    result.push(variant.join(","));
  }

  if (maxFlips <= 1) return result;

  // 翻转 2 位
  for (let i = 0; i < BUCKET_DIM; i++) {
    for (let j = i + 1; j < BUCKET_DIM; j++) {
      const variant = [...signs];
      variant[i] = -variant[i];
      variant[j] = -variant[j];
      result.push(variant.join(","));
    }
  }

  return result;
}

export class VectorSearchEngine {
  /**
   * @param {string} dbPath - Path to vector embeddings database
   * @param {object} [opts]
   * @param {number} [opts.dimension] - Embedding dimension (default: 384)
   */
  constructor(dbPath, opts = {}) {
    const Database = opts.Database || loadBetterSqliteDatabase();
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this._dimension = opts.dimension || DEFAULT_DIMENSION;
    this._initSchema();
    this._prepareStatements();
    this._backfillBuckets();
  }

  /**
   * Embedding dimension
   * @returns {number}
   */
  get dimension() {
    return this._dimension;
  }

  /**
   * Store embedding for a fact (L2-normalized before storage)
   * @param {number} factId - Fact ID from fact-store
   * @param {Float32Array} embedding - Embedding vector
   * @param {object} [metadata] - Optional metadata (e.g., time)
   */
  storeEmbedding(factId, embedding, metadata = {}) {
    if (embedding.length !== this._dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this._dimension}, got ${embedding.length}`,
      );
    }

    // L2 归一化后存储，使余弦相似度退化为点积
    const normalized = normalizeL2Copy(embedding);
    const bucket = computeBucket(normalized);
    const buffer = Buffer.from(
      new Uint8Array(normalized.buffer, normalized.byteOffset, normalized.byteLength),
    );
    this._stmts.upsert.run({
      factId,
      embedding: buffer,
      bucket,
      time: metadata.time || null,
      dimension: this._dimension,
    });
  }

  /**
   * Batch store embeddings (single transaction, L2-normalized)
   * @param {Array<{factId: number, embedding: Float32Array, time?: string}>} items
   */
  storeEmbeddings(items) {
    if (!items || items.length === 0) return;

    const insert = this.db.prepare(`
      INSERT INTO embeddings (fact_id, embedding, dimension, time, indexed_bucket)
      VALUES (@factId, @embedding, @dimension, @time, @bucket)
      ON CONFLICT(fact_id) DO UPDATE SET
        embedding = excluded.embedding,
        dimension = excluded.dimension,
        time = excluded.time,
        indexed_bucket = excluded.indexed_bucket,
        created_at = datetime('now')
    `);

    const transaction = this.db.transaction((records) => {
      for (const item of records) {
        if (item.embedding.length !== this._dimension) {
          throw new Error(`Dimension mismatch for fact ${item.factId}`);
        }
        const normalized = normalizeL2Copy(item.embedding);
        const bucket = computeBucket(normalized);
        const buffer = Buffer.from(
          new Uint8Array(normalized.buffer, normalized.byteOffset, normalized.byteLength),
        );
        insert.run({
          factId: item.factId,
          embedding: buffer,
          bucket,
          dimension: this._dimension,
          time: item.time || null,
        });
      }
    });

    transaction(items);
  }

  /**
   * Delete embedding for a fact
   * @param {number} factId
   */
  deleteEmbedding(factId) {
    this._stmts.delete.run(factId);
  }

  /**
   * Search by vector similarity with bucket-indexed approximate search.
   *
   * Phase 1: 在查询向量所在桶 + 相邻 1-bit 翻转桶内搜索 (命中 ~1/256*29 ≈ 11% 数据)
   * Phase 2: 如果结果不足，扩展到 2-bit 翻转桶
   * Phase 3: 仍不足时全表扫描兜底
   *
   * @param {Float32Array} queryEmbedding - Query embedding
   * @param {number} [limit=20] - Maximum results
   * @param {object} [dateRange] - Optional date range filter
   * @param {string} [dateRange.from] - Start date
   * @param {string} [dateRange.to] - End date
   * @returns {Array<{factId: number, vectorScore: number, time?: string}>}
   */
  searchByVector(queryEmbedding, limit = 20, dateRange) {
    if (queryEmbedding.length !== this._dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this._dimension}, got ${queryEmbedding.length}`,
      );
    }

    // 查询向量也做 L2 归一化
    const normalized = normalizeL2Copy(queryEmbedding);
    const queryBuffer = Buffer.from(
      new Uint8Array(normalized.buffer, normalized.byteOffset, normalized.byteLength),
    );
    const queryBucket = computeBucket(normalized);

    let dateWhere = "";
    const params = { query: queryBuffer, dimension: this._dimension };
    if (dateRange?.from) { dateWhere += " AND time >= @dateFrom"; params.dateFrom = dateRange.from; }
    if (dateRange?.to) { dateWhere += " AND time <= @dateTo"; params.dateTo = dateRange.to; }

    const seen = new Set();
    const allRows = [];

    // Phase 1: 同桶 + 1-bit 翻转（~11% 数据量）
    const phase1Buckets = expandBuckets(queryBucket, 1);
    this._searchInBuckets(phase1Buckets, dateWhere, params, limit * 3, allRows, seen);

    // Phase 2: 2-bit 翻转（结果不够时）
    if (allRows.length < limit) {
      const phase2Buckets = expandBuckets(queryBucket, 2)
        .filter(b => !phase1Buckets.includes(b));
      if (phase2Buckets.length > 0) {
        this._searchInBuckets(phase2Buckets, dateWhere, params, limit * 2, allRows, seen);
      }
    }

    // Phase 3: 全表扫描兜底
    if (allRows.length < limit) {
      const bucketList = expandBuckets(queryBucket, 2);
      const bucketExclude = bucketList.map(b => `'${b}'`).join(",");
      const sql = `
        SELECT fact_id, time, cosine_similarity(embedding, :query) as vectorScore
        FROM embeddings
        WHERE dimension = :dimension
          AND indexed_bucket NOT IN (${bucketExclude})
          ${dateWhere}
        ORDER BY vectorScore DESC
        LIMIT :remaining
      `;
      try {
        const moreRows = this.db.prepare(sql).all({
          query: queryBuffer,
          dimension: this._dimension,
          ...params,
          remaining: limit - allRows.length,
        });
        for (const row of moreRows) {
          if (!seen.has(row.fact_id)) {
            seen.add(row.fact_id);
            allRows.push(row);
          }
        }
      } catch { /* 兜底失败静默处理 */ }
    }

    // 最终排序（确保跨阶段结果正确排序）
    allRows.sort((a, b) => b.vectorScore - a.vectorScore);
    return allRows.slice(0, limit).map((row) => ({
      factId: row.fact_id,
      vectorScore: row.vectorScore,
      time: row.time,
    }));
  }

  /**
   * 在指定桶集合中搜索
   */
  _searchInBuckets(buckets, dateWhere, params, limit, rows, seen) {
    const bucketFilter = buckets.map(b => `'${b}'`).join(",");
    const sql = `
      SELECT fact_id, time, cosine_similarity(embedding, :query) as vectorScore
      FROM embeddings
      WHERE dimension = :dimension
        AND indexed_bucket IN (${bucketFilter})
        ${dateWhere}
      ORDER BY vectorScore DESC
      LIMIT :bucketLimit
    `;
    try {
      const result = this.db.prepare(sql).all({ ...params, bucketLimit: limit });
      for (const row of result) {
        if (!seen.has(row.fact_id)) {
          seen.add(row.fact_id);
          rows.push(row);
        }
      }
    } catch { /* 桶搜索失败静默处理，后续阶段会兜底 */ }
  }

  /**
   * Hybrid search combining vector and FTS results
   * @param {Float32Array} queryEmbedding - Query embedding
   * @param {Array<object>} ftsResults - FTS search results with {id, rank}
   * @param {number} [limit=20] - Maximum results
   * @param {object} [opts]
   * @param {number} [opts.vectorWeight] - Weight for vector score (default: 0.5)
   * @param {number} [opts.ftsWeight] - Weight for FTS score (default: 0.3)
   * @param {number} [opts.tagWeight] - Weight for tag relevance score (default: 0 when tagScores not provided)
   * @param {object} [opts.tagScores] - Map of factId → tag match score (0-1)
   * @param {object} [opts.dateRange] - Optional date range filter
   * @returns {Array<{factId: number, hybridScore: number, vectorScore: number, ftsScore: number}>}
   */
  hybridSearch(queryEmbedding, ftsResults, limit = 20, opts = {}) {
    const vectorWeight = opts.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
    const ftsWeight = opts.ftsWeight ?? DEFAULT_FTS_WEIGHT;
    const tagWeight = opts.tagWeight ?? 0;
    const tagScores = opts.tagScores || {};

    const vectorResults = this.searchByVector(
      queryEmbedding,
      limit * 2,
      opts.dateRange,
    );

    const filteredFtsResults = opts.dateRange
      ? ftsResults.filter((r) => {
          if (!r.time) return true;
          if (opts.dateRange.from && r.time < opts.dateRange.from) return false;
          if (opts.dateRange.to && r.time > opts.dateRange.to) return false;
          return true;
        })
      : ftsResults;

    let maxRank = 1;
    for (const result of filteredFtsResults) {
      if (result.rank > maxRank) maxRank = result.rank;
    }

    const combinedMap = new Map();

    for (const vResult of vectorResults) {
      combinedMap.set(vResult.factId, {
        factId: vResult.factId,
        vectorScore: vResult.vectorScore,
        ftsScore: 0,
        time: vResult.time,
      });
    }

    for (const fResult of filteredFtsResults) {
      const existing = combinedMap.get(fResult.id);
      if (existing) {
        existing.ftsScore = 1 - (fResult.rank / maxRank);
      } else {
        combinedMap.set(fResult.id, {
          factId: fResult.id,
          vectorScore: 0,
          ftsScore: 1 - (fResult.rank / maxRank),
          time: fResult.time || null,
        });
      }
    }

    const combined = Array.from(combinedMap.values()).map((item) => ({
      ...item,
      tagScore: tagWeight > 0 ? (tagScores[item.factId] || 0) : 0,
      hybridScore:
        item.vectorScore * vectorWeight
        + item.ftsScore * ftsWeight
        + (tagWeight > 0 ? (tagScores[item.factId] || 0) * tagWeight : 0),
    }));

    combined.sort((a, b) => b.hybridScore - a.hybridScore);

    return combined.slice(0, limit);
  }

  /**
   * Get total embedding count
   * @returns {number}
   */
  getEmbeddingCount() {
    return this._stmts.count.get().cnt;
  }

  /**
   * Check if fact has embedding
   * @param {number} factId
   * @returns {boolean}
   */
  hasEmbedding(factId) {
    const row = this._stmts.exists.get(factId);
    return row?.cnt > 0;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db?.open) {
      try { this.db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
      this.db.close();
    }
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        fact_id INTEGER PRIMARY KEY,
        embedding BLOB NOT NULL,
        dimension INTEGER NOT NULL,
        time TEXT,
        indexed_bucket TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_embeddings_dimension ON embeddings(dimension);
      CREATE INDEX IF NOT EXISTS idx_embeddings_time ON embeddings(time);
      CREATE INDEX IF NOT EXISTS idx_embeddings_bucket ON embeddings(indexed_bucket);
    `);

    // ── 简化余弦相似度：向量已 L2 归一化存储，点积 = 余弦相似度 ──
    // 使用 DataView 加速浮点数读取，避免每次新建 Float32Array
    this.db.function("cosine_similarity", (a, b) => {
      if (!a || !b) return 0;

      const byteLen = a.byteLength;
      if (byteLen === 0 || byteLen !== b.byteLength) return 0;

      // DataView 读取 Float32 (little-endian x86)
      const viewA = new DataView(a.buffer, a.byteOffset, byteLen);
      const viewB = new DataView(b.buffer, b.byteOffset, byteLen);
      const len = byteLen / 4;

      let dotProduct = 0;
      for (let i = 0; i < len; i++) {
        dotProduct += viewA.getFloat32(i * 4, true) * viewB.getFloat32(i * 4, true);
      }

      return dotProduct; // 归一化后点积即余弦相似度
    });
  }

  _backfillBuckets() {
    const cnt = this._stmts.count.get()?.cnt || 0;
    if (cnt === 0) return;

    // 用 exec 检查是否有空桶（避免额外预处理语句）
    const checkRow = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM embeddings WHERE indexed_bucket = '' OR indexed_bucket IS NULL"
    ).get();
    if (!checkRow?.cnt) return;

    log?.log?.(`backfilling bucket index for ${checkRow.cnt} embeddings...`);

    // 逐批回填，用 exec 避免预处理语句文件锁定
    const stmt = this.db.prepare(
      "UPDATE embeddings SET indexed_bucket = ? WHERE fact_id = ?"
    );
    const rows = this.db.prepare(
      "SELECT fact_id, embedding FROM embeddings WHERE indexed_bucket = '' OR indexed_bucket IS NULL"
    ).all();

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        const emb = new Float32Array(row.embedding);
        stmt.run(computeBucket(emb), row.fact_id);
      }
    });
    tx();
    log?.log?.(`bucket index backfill complete (${rows.length} rows)`);
  }

  _prepareStatements() {
    this._stmts = {
      upsert: this.db.prepare(`
        INSERT INTO embeddings (fact_id, embedding, dimension, time, indexed_bucket)
        VALUES (@factId, @embedding, @dimension, @time, @bucket)
        ON CONFLICT(fact_id) DO UPDATE SET
          embedding = excluded.embedding,
          dimension = excluded.dimension,
          time = excluded.time,
          indexed_bucket = excluded.indexed_bucket,
          created_at = datetime('now')
      `),
      delete: this.db.prepare(`DELETE FROM embeddings WHERE fact_id = ?`),
      count: this.db.prepare(`SELECT COUNT(*) as cnt FROM embeddings`),
      exists: this.db.prepare(
        `SELECT COUNT(*) as cnt FROM embeddings WHERE fact_id = ?`,
      ),
    };
  }
}
