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
const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_FTS_WEIGHT = 0.4;

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
  }

  /**
   * Embedding dimension
   * @returns {number}
   */
  get dimension() {
    return this._dimension;
  }

  /**
   * Store embedding for a fact
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

    const buffer = Buffer.from(embedding.buffer);
    this._stmts.upsert.run({
      factId,
      embedding: buffer,
      time: metadata.time || null,
      dimension: this._dimension,
    });
  }

  /**
   * Delete embedding for a fact
   * @param {number} factId
   */
  deleteEmbedding(factId) {
    this._stmts.delete.run(factId);
  }

  /**
   * Search by vector similarity
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

    const queryBuffer = Buffer.from(queryEmbedding.buffer);

    let dateWhere = "";
    const params = { query: queryBuffer, limit };
    if (dateRange?.from) {
      dateWhere += " AND time >= @dateFrom";
      params.dateFrom = dateRange.from;
    }
    if (dateRange?.to) {
      dateWhere += " AND time <= @dateTo";
      params.dateTo = dateRange.to;
    }

    const sql = `
      SELECT 
        fact_id,
        time,
        cosine_similarity(embedding, :query) as vectorScore
      FROM embeddings
      WHERE dimension = :dimension${dateWhere}
      ORDER BY vectorScore DESC
      LIMIT :limit
    `;

    const rows = this.db.prepare(sql).all({
      query: queryBuffer,
      dimension: this._dimension,
      ...params,
    });

    return rows.map((row) => ({
      factId: row.fact_id,
      vectorScore: row.vectorScore,
      time: row.time,
    }));
  }

  /**
   * Hybrid search combining vector and FTS results
   * @param {Float32Array} queryEmbedding - Query embedding
   * @param {Array<object>} ftsResults - FTS search results with {id, rank}
   * @param {number} [limit=20] - Maximum results
   * @param {object} [opts]
   * @param {number} [opts.vectorWeight] - Weight for vector score (default: 0.6)
   * @param {number} [opts.ftsWeight] - Weight for FTS score (default: 0.4)
   * @param {object} [opts.dateRange] - Optional date range filter
   * @returns {Array<{factId: number, hybridScore: number, vectorScore: number, ftsScore: number}>}
   */
  hybridSearch(queryEmbedding, ftsResults, limit = 20, opts = {}) {
    const vectorWeight = opts.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
    const ftsWeight = opts.ftsWeight ?? DEFAULT_FTS_WEIGHT;

    const vectorResults = this.searchByVector(
      queryEmbedding,
      limit * 2,
      opts.dateRange,
    );

    const ftsMap = new Map();
    let maxRank = 1;
    for (const result of ftsResults) {
      ftsMap.set(result.id, result);
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

    for (const fResult of ftsResults) {
      const existing = combinedMap.get(fResult.id);
      if (existing) {
        existing.ftsScore = 1 - (fResult.rank / maxRank);
      } else {
        combinedMap.set(fResult.id, {
          factId: fResult.id,
          vectorScore: 0,
          ftsScore: 1 - (fResult.rank / maxRank),
          time: null,
        });
      }
    }

    const combined = Array.from(combinedMap.values()).map((item) => ({
      ...item,
      hybridScore: item.vectorScore * vectorWeight + item.ftsScore * ftsWeight,
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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_embeddings_dimension ON embeddings(dimension);
      CREATE INDEX IF NOT EXISTS idx_embeddings_time ON embeddings(time);
    `);

    this.db.exec(`
      CREATE VIEW IF NOT EXISTS cosine_similarity AS
      SELECT 1;
    `);

    try {
      this.db.exec(`DROP VIEW IF EXISTS cosine_similarity`);
    } catch {
      // ignore
    }

    this.db.function("cosine_similarity", (a, b) => {
      if (!a || !b) return 0;

      const vecA = new Float32Array(a);
      const vecB = new Float32Array(b);

      if (vecA.length !== vecB.length) return 0;

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }

      if (normA === 0 || normB === 0) return 0;

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    });
  }

  _prepareStatements() {
    this._stmts = {
      upsert: this.db.prepare(`
        INSERT INTO embeddings (fact_id, embedding, dimension, time)
        VALUES (@factId, @embedding, @dimension, @time)
        ON CONFLICT(fact_id) DO UPDATE SET
          embedding = excluded.embedding,
          dimension = excluded.dimension,
          time = excluded.time,
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
