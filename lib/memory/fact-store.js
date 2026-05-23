/**
 * fact-store.js — 深度记忆存储（元事实 + 标签）
 *
 * v2 记忆系统的 archival 层。每条记忆是一个"元事实"，
 * 附带标签和时间，通过标签匹配 + FTS5 全文搜索检索。
 *
 * 替代 v1 的 store.js（SQLite + sqlite-vec 向量搜索）。
 * 不使用 embedding / 向量 / score / decay / hit_count。
 */

import { createRequire } from "module";
import { scrubPII } from "../pii-guard.js";
import { createModuleLogger } from "../debug-log.js";
import { EmbeddingModelManager } from "./embedding-model.js";
import { VectorSearchEngine } from "./vector-search.js";
import { Fts5Optimizer } from "./fts5-optimizer.js";
import { createQualityScorer } from "./quality-scorer.js";
import { ForgettingCurveEngine, DEFAULT_FORGETTING_SCHEDULE } from "./forgetting-curve.js";
import { MemoryArchiveManager } from "./memory-archive.js";

const log = createModuleLogger("fact-store");

const require = createRequire(import.meta.url);
let BetterSqliteDatabase = null;

export function loadBetterSqliteDatabase() {
  if (!BetterSqliteDatabase) {
    const mod = require("better-sqlite3");
    BetterSqliteDatabase = mod?.default || mod;
  }
  return BetterSqliteDatabase;
}

/**
 * 当前 schema 版本。每次改表结构时递增，
 * 并在 _migrate() 里添加对应的迁移逻辑。
 */
const SCHEMA_VERSION = 4;

const CJK_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

function normalizeSearchText(text) {
  return String(text || "").normalize("NFKC").trim();
}

function parseTags(rawTags) {
  try {
    const tags = Array.isArray(rawTags) ? rawTags : JSON.parse(rawTags || "[]");
    return Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function cjkNgrams(text) {
  const tokens = [];
  CJK_RUN_RE.lastIndex = 0;
  for (const match of normalizeSearchText(text).matchAll(CJK_RUN_RE)) {
    const chars = Array.from(match[0]);
    for (const size of [2, 3]) {
      if (chars.length < size) continue;
      for (let i = 0; i <= chars.length - size; i++) {
        tokens.push(chars.slice(i, i + size).join(""));
      }
    }
  }
  return tokens;
}

function uniqueTokens(tokens) {
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    const normalized = normalizeSearchText(token);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function buildFactSearchText(fact, tags = []) {
  const base = [fact, ...tags].map(normalizeSearchText).filter(Boolean).join(" ");
  const grams = cjkNgrams(base);
  return uniqueTokens([base, ...grams]).join(" ");
}

function buildFtsQuery(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return "";

  const lexicalTokens = normalized.split(/\s+/);
  const grams = cjkNgrams(normalized);
  return uniqueTokens([...lexicalTokens, ...grams])
    .map((w) => `"${w.replace(/"/g, '""')}"`)
    .join(" OR ");
}

function hasCjk(text) {
  CJK_RUN_RE.lastIndex = 0;
  return CJK_RUN_RE.test(normalizeSearchText(text));
}

export class FactStore {
  /**
   * @param {string} dbPath - facts.db 的路径
   * @param {{ Database?: import("better-sqlite3"), vectorDbPath?: string, embeddingModel?: EmbeddingModelManager, forgettingCurveConfig?: object, qualityConfig?: object, enableFts5Optimization?: boolean, synonymMap?: object }} [opts]
   */
  constructor(dbPath, opts = {}) {
    const Database = opts.Database || loadBetterSqliteDatabase();
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -16000");     // 16MB（默认 ~2MB）
    this.db.pragma("temp_store = MEMORY");
    this.db.pragma("mmap_size = 30000000");    // 30MB mmap I/O
    this._initSchema();
    this._migrate();
    this._createFtsTriggers();

    this._vectorEngine = null;
    this._embeddingModel = opts.embeddingModel || null;
    this._qualityScorer = createQualityScorer(opts.qualityConfig);

    if (opts.vectorDbPath) {
      try {
        this._vectorEngine = new VectorSearchEngine(opts.vectorDbPath);
        log?.info?.("Vector search engine initialized");
      } catch (err) {
        log?.warn?.(`Vector search unavailable: ${err.message}`);
      }
    }

    this._ftsOptimizer = null;
    if (opts.enableFts5Optimization) {
      try {
        this._ftsOptimizer = new Fts5Optimizer({
          dbPath: dbPath.replace(/\.db$/, "-optimized.db"),
          synonymMap: opts.synonymMap || {},
        });
        log?.info?.("FTS5 optimizer initialized");
      } catch (err) {
        log?.warn?.(`FTS5 optimizer unavailable: ${err.message}`);
      }
    }

    this._forgettingCurve = null;
    this._archiveManager = null;

    if (opts.forgettingCurveConfig?.enabled) {
      this._initForgettingCurve(dbPath, opts.forgettingCurveConfig);
    }

    // _prepareStatements 必须在 _initForgettingCurve 之后，
    // 因为后者会 ALTER TABLE 添加 hit_count / importance 等列。
    // SQLite 的 SELECT * 在 prepare 编译时确定列集合，
    // 提前编译会导致新列不在查询结果中。
    this._prepareStatements();
    this._tagSearchCache = new Map();          // tag 数量 → prepared statement
  }

  _initForgettingCurve(dbPath, config) {
    try {
      const path = require("path");
      const memoryDir = path.dirname(dbPath);
      const archivePath = path.join(memoryDir, "archived_facts.db");

      const forgettingCurve = new ForgettingCurveEngine(dbPath, {
        enabled: config.enabled ?? true,
        schedule: config.schedule || DEFAULT_FORGETTING_SCHEDULE,
        archiveThreshold: config.archiveThreshold ?? 0.25,
        protectedTags: config.protectedTags || [],
      });

      const archiveManager = new MemoryArchiveManager(archivePath);

      // 两个子组件都成功后才赋值，避免部分初始化导致每天静默空转
      this._forgettingCurve = forgettingCurve;
      this._archiveManager = archiveManager;

      log?.info?.("Forgetting curve engine initialized");
    } catch (err) {
      // 任一失败 → 两个都不赋值，Step 7 整体跳过
      this._forgettingCurve = null;
      this._archiveManager = null;
      log?.warn?.(`Forgetting curve unavailable: ${err.message}`);
    }
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        fact       TEXT NOT NULL,
        search_text TEXT NOT NULL DEFAULT '',
        tags       TEXT NOT NULL DEFAULT '[]',
        time       TEXT,
        effective_time TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_facts_time ON facts(time);
      CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(session_id);
    `);
    this._ensureSearchTextColumn();

    // FTS5 全文搜索：fact 保留原文，search_text 存储跨语言检索 token。
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE facts_fts USING fts5(
          fact,
          search_text,
          content=facts,
          content_rowid=id,
          tokenize='unicode61'
        );
      `);
    } catch {
      // 表已存在
    }

  }

  _createFtsTriggers() {
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, fact, search_text) VALUES (new.id, new.fact, new.search_text);
      END;
      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, fact, search_text) VALUES ('delete', old.id, old.fact, old.search_text);
      END;
      CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, fact, search_text) VALUES ('delete', old.id, old.fact, old.search_text);
        INSERT INTO facts_fts(rowid, fact, search_text) VALUES (new.id, new.fact, new.search_text);
      END;
    `);
  }

  _ensureSearchTextColumn() {
    const columns = this.db.pragma("table_info(facts)");
    if (!columns.some((col) => col.name === "search_text")) {
      this.db.exec("ALTER TABLE facts ADD COLUMN search_text TEXT NOT NULL DEFAULT ''");
    }
  }

  /**
   * Schema 迁移：读取 user_version，逐级执行迁移函数。
   * 每次改表结构时：
   *   1. SCHEMA_VERSION += 1
   *   2. 在 switch 里加一个 case
   */
  _migrate() {
    const current = this.db.pragma("user_version", { simple: true });
    if (current >= SCHEMA_VERSION) return;

    this.db.transaction(() => {
      let v = current;
      while (v < SCHEMA_VERSION) {
        switch (v) {
          case 0:
            // v0 → v1：初始 schema 标记（无实际变更，仅打版本戳）
            break;
          case 1:
            // v1 → v2：补充 CJK 友好的搜索文本，并重建 FTS 表到双列 schema。
            this._migrateToSearchText();
            break;
          case 2:
            // v2 → v3：添加质量评分列（specificity, recency, relevance, consistency, usage, composite, access_count）
            this._migrateToQualityScores();
            break;
          case 3:
            // v3 → v4：添加双时态字段 effective_time
            this._migrateToBitemporal();
            break;
        }
        v++;
      }
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();

    log.log(`schema migrated: v${current} → v${SCHEMA_VERSION}`);
  }

  _migrateToSearchText() {
    this._ensureSearchTextColumn();

    const rows = this.db.prepare("SELECT id, fact, tags FROM facts").all();
    const update = this.db.prepare("UPDATE facts SET search_text = ? WHERE id = ?");
    for (const row of rows) {
      update.run(buildFactSearchText(row.fact, parseTags(row.tags)), row.id);
    }

    this.db.exec(`
      DROP TRIGGER IF EXISTS facts_ai;
      DROP TRIGGER IF EXISTS facts_ad;
      DROP TRIGGER IF EXISTS facts_au;
      DROP TABLE IF EXISTS facts_fts;
      CREATE VIRTUAL TABLE facts_fts USING fts5(
        fact,
        search_text,
        content=facts,
        content_rowid=id,
        tokenize='unicode61'
      );
    `);
    this._createFtsTriggers();
    this.db.exec("INSERT INTO facts_fts(facts_fts) VALUES ('rebuild')");
  }

  _migrateToQualityScores() {
    const columns = this.db.pragma("table_info(facts)");
    const qualityColumns = ["quality_specificity", "quality_recency", "quality_relevance", "quality_consistency", "quality_usage", "quality_composite", "access_count"];

    for (const col of qualityColumns) {
      if (!columns.some((c) => c.name === col)) {
        const defaultValue = col === "access_count" ? "0" : "0.0";
        this.db.exec(`ALTER TABLE facts ADD COLUMN ${col} REAL NOT NULL DEFAULT ${defaultValue}`);
      }
    }

    if (!columns.some((c) => c.name === "user_feedback")) {
      this.db.exec(`ALTER TABLE facts ADD COLUMN user_feedback TEXT NOT NULL DEFAULT '{}'`);
    }

    const allFacts = this.db.prepare("SELECT * FROM facts ORDER BY time DESC").all().map((row) => this._rowToFact(row));
    if (allFacts.length > 0) {
      this.computeAndStoreQualityScores(allFacts);
    }

    log.log("quality score columns added and initial scoring completed");
  }

  _migrateToBitemporal() {
    const columns = this.db.pragma("table_info(facts)");
    if (!columns.some((col) => col.name === "effective_time")) {
      this.db.exec("ALTER TABLE facts ADD COLUMN effective_time TEXT");
    }
    this.db.exec("UPDATE facts SET effective_time = time WHERE effective_time IS NULL AND time IS NOT NULL");
  }

  computeAndStoreQualityScores(facts) {
    if (!facts || facts.length === 0) return;

    const updateStmt = this.db.prepare(`
      UPDATE facts SET 
        quality_specificity = @specificity,
        quality_recency = @recency,
        quality_relevance = @relevance,
        quality_consistency = @consistency,
        quality_usage = @usage,
        quality_composite = @composite
      WHERE id = ?
    `);

    const scored = this._qualityScorer.scoreBatch(facts);

    this.db.transaction(() => {
      for (const score of scored) {
        updateStmt.run(
          score.specificity,
          score.recency,
          score.relevance,
          score.consistency,
          score.usage,
          score.composite,
          score.factId,
        );
      }
    })();
  }

  incrementAccessCount(factId) {
    const result = this.db.prepare(`
      UPDATE facts SET access_count = access_count + 1 WHERE id = ?
    `).run(factId);
    return result.changes > 0;
  }

  _computeQualityForNewFact(id, factText, tags, createdAt) {
    try {
      const allFacts = this.getAll();
      const fact = { id, fact: factText, tags, created_at: createdAt, access_count: 0 };
      const scores = this._qualityScorer.score(fact, allFacts);

      this.db.prepare(`
        UPDATE facts SET 
          quality_specificity = ?,
          quality_recency = ?,
          quality_relevance = ?,
          quality_consistency = ?,
          quality_usage = ?,
          quality_composite = ?
        WHERE id = ?
      `).run(scores.specificity, scores.recency, scores.relevance, scores.consistency, scores.usage, scores.composite, id);
    } catch (err) {
      log?.warn?.(`Failed to compute quality score for fact ${id}: ${err.message}`);
    }
  }

  getQualityStats() {
    const row = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        AVG(quality_composite) as avgComposite,
        MIN(quality_composite) as minComposite,
        MAX(quality_composite) as maxComposite,
        AVG(quality_specificity) as avgSpecificity,
        AVG(quality_recency) as avgRecency,
        AVG(quality_relevance) as avgRelevance,
        AVG(quality_consistency) as avgConsistency,
        AVG(quality_usage) as avgUsage
      FROM facts
    `).get();

    return {
      total: row.total,
      averageQuality: row.avgComposite ? Math.round(row.avgComposite) : 0,
      minQuality: row.minComposite ? Math.round(row.minComposite) : 0,
      maxQuality: row.maxComposite ? Math.round(row.maxComposite) : 0,
      avgSpecificity: row.avgSpecificity ? Math.round(row.avgSpecificity) : 0,
      avgRecency: row.avgRecency ? Math.round(row.avgRecency) : 0,
      avgRelevance: row.avgRelevance ? Math.round(row.avgRelevance) : 0,
      avgConsistency: row.avgConsistency ? Math.round(row.avgConsistency) : 0,
      avgUsage: row.avgUsage ? Math.round(row.avgUsage) : 0,
    };
  }

  getLowQualityFacts(threshold) {
    const minScore = threshold || 40;
    const rows = this.db.prepare(`
      SELECT * FROM facts WHERE quality_composite < ? ORDER BY quality_composite ASC
    `).all(minScore);
    return rows.map((row) => this._rowToFact(row));
  }

  getQualityDistribution() {
    const rows = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN quality_composite >= 80 THEN 1 ELSE 0 END) as excellent,
        SUM(CASE WHEN quality_composite >= 60 AND quality_composite < 80 THEN 1 ELSE 0 END) as good,
        SUM(CASE WHEN quality_composite >= 40 AND quality_composite < 60 THEN 1 ELSE 0 END) as fair,
        SUM(CASE WHEN quality_composite < 40 THEN 1 ELSE 0 END) as poor
      FROM facts
    `).get();

    return {
      excellent: rows.excellent || 0,
      good: rows.good || 0,
      fair: rows.fair || 0,
      poor: rows.poor || 0,
    };
  }

  recomputeQualityForFact(factId) {
    const fact = this.getById(factId);
    if (!fact) return;

    const allFacts = this.getAll();
    const scores = this._qualityScorer.score(fact, allFacts);

    this.db.prepare(`
      UPDATE facts SET 
        quality_specificity = ?,
        quality_recency = ?,
        quality_relevance = ?,
        quality_consistency = ?,
        quality_usage = ?,
        quality_composite = ?
      WHERE id = ?
    `).run(
      scores.specificity,
      scores.recency,
      scores.relevance,
      scores.consistency,
      scores.usage,
      scores.composite,
      factId,
    );
  }

  markFactImportant(factId, reason) {
    const existing = this.getById(factId);
    if (!existing) return false;

    const feedback = existing._raw_user_feedback || {};
    feedback.important = true;
    feedback.importantReason = reason || "";
    feedback.importantAt = new Date().toISOString();

    this.db.prepare(`
      UPDATE facts SET user_feedback = ? WHERE id = ?
    `).run(JSON.stringify(feedback), factId);

    this.recomputeQualityForFact(factId);
    return true;
  }

  markFactUseless(factId, reason) {
    const existing = this.getById(factId);
    if (!existing) return false;

    const feedback = existing._raw_user_feedback || {};
    feedback.useless = true;
    feedback.uselessReason = reason || "";
    feedback.uselessAt = new Date().toISOString();

    this.db.prepare(`
      UPDATE facts SET user_feedback = ? WHERE id = ?
    `).run(JSON.stringify(feedback), factId);

    this.recomputeQualityForFact(factId);
    return true;
  }

  getUserFeedback(factId) {
    const fact = this.getById(factId);
    if (!fact) return null;
    return fact._raw_user_feedback || {};
  }

  getFactsWithFeedback(type) {
    const allFacts = this.getAll();
    return allFacts.filter((f) => {
      const fb = f._raw_user_feedback || {};
      return type === "important" ? fb.important : fb.useless;
    });
  }

  markAsOutdated(factId, reason = "contradiction") {
    const stmt = this.db.prepare(`
      UPDATE facts 
      SET user_feedback = json_set(
        COALESCE(user_feedback, '{}'), 
        '$.outdated', true,
        '$.outdated_reason', ?,
        '$.outdated_at', ?
      )
      WHERE id = ?
    `);
    stmt.run(reason, new Date().toISOString(), factId);
  }

  getPotentiallyContradictoryFacts(query, limit = 20) {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];

    const stmt = this.db.prepare(`
      SELECT f.*, 
             rank * -1 as relevance
      FROM facts f
      JOIN facts_fts ON f.id = facts_fts.rowid
      WHERE facts_fts MATCH ?
        AND json_extract(f.user_feedback, '$.outdated') IS NOT 1
      ORDER BY rank
      LIMIT ?
    `);

    return stmt.all(ftsQuery, limit).map(row => ({
      ...row,
      tags: parseTags(row.tags),
    }));
  }

  getFactByText(factText) {
    const stmt = this.db.prepare(`
      SELECT * FROM facts WHERE fact = ? LIMIT 1
    `);
    const row = stmt.get(factText);
    if (!row) return null;
    return {
      ...row,
      tags: parseTags(row.tags),
    };
  }

  _prepareStatements() {
    this._stmts = {
      insert: this.db.prepare(`
        INSERT INTO facts (fact, search_text, tags, time, effective_time, session_id, created_at)
        VALUES (@fact, @searchText, @tags, @time, @effectiveTime, @sessionId, @createdAt)
      `),
      getAll: this.db.prepare(`SELECT * FROM facts ORDER BY time DESC`),
      getById: this.db.prepare(`SELECT * FROM facts WHERE id = ?`),
      getBySession: this.db.prepare(`SELECT * FROM facts WHERE session_id = ? ORDER BY time DESC`),
      count: this.db.prepare(`SELECT COUNT(*) as cnt FROM facts`),
      deleteById: this.db.prepare(`DELETE FROM facts WHERE id = ?`),
      deleteAll: this.db.prepare(`DELETE FROM facts`),
      ftsSearch: this.db.prepare(`
        SELECT f.*, rank
        FROM facts_fts fts
        JOIN facts f ON f.id = fts.rowid
        WHERE facts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
    };
  }

  /**
   * 新增一条元事实
   * @param {{ fact: string, tags: string[], time?: string, session_id?: string }} entry
   * @returns {{ id: number }}
   */
  add(entry) {
    const { cleaned, detected } = scrubPII(entry.fact);
    if (detected.length > 0) {
      log.warn(`PII detected (${detected.join(", ")}), redacted before storage`);
    }

    const now = new Date().toISOString();
    const result = this._stmts.insert.run({
      fact: cleaned,
      searchText: buildFactSearchText(cleaned, entry.tags || []),
      tags: JSON.stringify(entry.tags || []),
      time: entry.time || null,
      effectiveTime: entry.effective_time || entry.time || null,
      sessionId: entry.session_id || null,
      createdAt: now,
    });

    const id = Number(result.lastInsertRowid);

    this._computeQualityForNewFact(id, cleaned, entry.tags || [], now);

    if (this._vectorEngine && this._embeddingModel?.isAvailable) {
      this._storeEmbeddingAsync(id, cleaned, entry.time);
    }

    return { id };
  }

  /**
   * 批量新增（事务）
   * @param {Array<{ fact: string, tags: string[], time?: string, session_id?: string }>} entries
   * @returns {number} 写入条数
   */
  addBatch(entries) {
    const run = this.db.transaction(() => {
      for (const entry of entries) {
        this.add(entry);
      }
    });
    run();
    return entries.length;
  }

  /**
   * 按标签搜索（精确匹配，OR 逻辑，按匹配数降序）
   *
   * 使用 json_each 精确匹配标签值，避免 LIKE 子串误匹配
   *
   * @param {string[]} queryTags - 查询标签
   * @param {{ from?: string, to?: string }} [dateRange] - 可选日期范围（YYYY-MM-DD 或 YYYY-MM-DDTHH:MM）
   * @param {number} [limit=20] - 最大返回数
   * @returns {Array<{ id, fact, tags, time, session_id, created_at, matchCount }>}
   */
  searchByTags(queryTags, dateRange, limit = 20) {
    if (!queryTags || queryTags.length === 0) return [];

    const stmt = this._getTagSearchStmt(queryTags.length, dateRange);

    const params = { limit };
    for (let i = 0; i < queryTags.length; i++) {
      params[`tag${i}`] = queryTags[i];
    }
    if (dateRange?.from) params.dateFrom = dateRange.from;
    if (dateRange?.to) params.dateTo = dateRange.to;

    const rows = stmt.all(params);
    return rows.map((row) => this._rowToFact(row));
  }

  /** 按 (tagCount, dateRangeType) 缓存 prepared statement */
  _getTagSearchStmt(tagCount, dateRange) {
    // dateRange 类型编码：0=无, 1=from, 2=to, 3=both
    const dateKey = (dateRange?.from ? 1 : 0) | (dateRange?.to ? 2 : 0);
    const cacheKey = `${tagCount}:${dateKey}`;

    let stmt = this._tagSearchCache.get(cacheKey);
    if (stmt) return stmt;

    const placeholders = Array.from({ length: tagCount }, (_, i) => `@tag${i}`).join(", ");
    let dateWhere = "";
    if (dateKey & 1) dateWhere += ` AND f.time >= @dateFrom`;
    if (dateKey & 2) dateWhere += ` AND f.time <= @dateTo`;

    const sql = `
      SELECT f.*, COUNT(DISTINCT je.value) as matchCount
      FROM facts f, json_each(f.tags) je
      WHERE je.value IN (${placeholders})${dateWhere}
      GROUP BY f.id
      ORDER BY matchCount DESC, f.time DESC
      LIMIT @limit
    `;

    stmt = this.db.prepare(sql);
    this._tagSearchCache.set(cacheKey, stmt);
    return stmt;
  }

  /**
   * Enhanced full-text search with FTS5 optimization
   *
   * @param {string} query - 搜索查询
   * @param {object} [opts] - 搜索选项
   * @param {number} [opts.limit=20] - 最大返回数
   * @param {object} [opts.columnWeights] - 列权重 { fact: 2.0, search_text: 1.0 }
   * @param {object} [opts.bm25Params] - BM25参数 { k1: 1.2, b: 0.75 }
   * @param {object} [opts.reranking] - 重排序选项
   * @param {number} [opts.reranking.recencyWeight] - 新近度权重 (0-1)
   * @param {number} [opts.reranking.tagWeight] - 标签相关性权重 (0-1)
   * @param {string[]} [opts.reranking.queryTags] - 查询标签
   * @param {string} [opts.reranking.currentTime] - 当前时间
   * @param {object} [opts.cjkOptions] - CJK分词选项
   * @param {boolean} [opts.cjkOptions.enable4Gram] - 是否启用4-gram
   * @param {object} [opts.queryExpansion] - 查询扩展选项
   * @param {boolean} [opts.queryExpansion.enable] - 是否启用查询扩展
   * @param {object} [opts.fuzzyMatching] - 模糊匹配选项
   * @param {boolean} [opts.fuzzyMatching.enable] - 是否启用模糊匹配
   * @param {number} [opts.fuzzyMatching.maxEditDistance] - 最大编辑距离
   * @returns {Array<{ id, fact, tags, time, session_id, created_at, score, finalScore }>}
   */
  enhancedSearchFullText(query, opts = {}) {
    if (this._ftsOptimizer) {
      return this._ftsOptimizer.enhancedSearch(query, opts);
    }

    return this.searchFullText(query, opts.limit || 20).map((r) => ({
      ...r,
      score: 0.5,
      finalScore: 0.5,
    }));
  }

  /**
   * 全文搜索（FTS5）
   *
   * @param {string} query - 搜索查询
   * @param {number} [limit=20]
   * @returns {Array<{ id, fact, tags, time, session_id, created_at }>}
   */
  searchFullText(query, limit = 20) {
    if (!query || !query.trim()) return [];

    try {
      const ftsQuery = buildFtsQuery(query);
      if (!ftsQuery) return [];

      const rows = this._stmts.ftsSearch.all(ftsQuery, limit);
      if (rows.length === 0 && hasCjk(query)) {
        return this._likeFallback(query, limit);
      }
      return rows.map((row) => this._rowToFact(row));
    } catch {
      // FTS 查询语法错误时降级为 LIKE
      return this._likeFallback(query, limit);
    }
  }

  /**
   * LIKE 降级搜索（FTS 失败时使用）
   */
  _likeFallback(query, limit) {
    const rows = this.db
      .prepare(`SELECT * FROM facts WHERE fact LIKE '%' || ? || '%' ORDER BY time DESC LIMIT ?`)
      .all(query, limit);
    return rows.map((row) => this._rowToFact(row));
  }

  /**
   * Hybrid search with vector + FTS
   * @param {string} query - Search query
   * @param {number} [limit=20]
   * @param {object} [dateRange] - Optional date range
   * @param {object} [extraOpts] - Extra options passed to hybridSearch (tagScores, tagWeight, etc.)
   * @returns {Array<{id, fact, tags, time, session_id, created_at, hybridScore}>}
   */
  async searchWithVectors(query, limit = 20, dateRange, extraOpts = {}) {
    if (!query || !query.trim()) return [];

    const ftsResults = this.searchFullText(query, limit * 2);

    if (!this._vectorEngine || !this._embeddingModel?.isAvailable) {
      return ftsResults.slice(0, limit).map((r) => ({
        ...r,
        hybridScore: 0.4,
      }));
    }

    try {
      const embedding = await this._embeddingModel.getEmbedding(query);
      if (!embedding) {
        return ftsResults.slice(0, limit).map((r) => ({
          ...r,
          hybridScore: 0.4,
        }));
      }

      const hybridResults = this._vectorEngine.hybridSearch(
        embedding,
        ftsResults.map((r, i) => ({ id: r.id, rank: i + 1, time: r.time })),
        limit,
        { dateRange, ...extraOpts },
      );

      const factIds = hybridResults.map((r) => r.factId);
      const factMap = new Map();
      if (factIds.length > 0) {
        const placeholders = factIds.map((_, i) => `?`).join(", ");
        const sql = `SELECT * FROM facts WHERE id IN (${placeholders})`;
        const rows = this.db.prepare(sql).all(...factIds);
        for (const row of rows) {
          factMap.set(row.id, this._rowToFact(row));
        }
      }

      return hybridResults
        .map((r) => {
          const fact = factMap.get(r.factId);
          if (!fact) return null;
          return {
            ...fact,
            hybridScore: r.hybridScore,
            vectorScore: r.vectorScore,
            ftsScore: r.ftsScore,
          };
        })
        .filter(Boolean);
    } catch (err) {
      log?.warn?.(`Vector search failed, falling back to FTS: ${err.message}`);
      return ftsResults.slice(0, limit).map((r) => ({
        ...r,
        hybridScore: 0.4,
      }));
    }
  }

  /**
   * Store embedding asynchronously (non-blocking)
   */
  async _storeEmbeddingAsync(factId, fact, time) {
    try {
      const embedding = await this._embeddingModel.getEmbedding(fact);
      if (embedding) {
        this._vectorEngine.storeEmbedding(factId, embedding, { time });
      }
    } catch (err) {
      log?.warn?.(`Failed to store embedding for fact ${factId}: ${err.message}`);
    }
  }

  /** 获取所有元事实（按时间降序） */
  getAll() {
    return this._stmts.getAll.all().map((row) => this._rowToFact(row));
  }

  /** 按 session_id 查询 */
  getBySession(sessionId) {
    return this._stmts.getBySession.all(sessionId).map((row) => this._rowToFact(row));
  }

  /** 按 id 查询 */
  getById(id) {
    const row = this._stmts.getById.get(id);
    return row ? this._rowToFact(row) : null;
  }

  get size() {
    return this._stmts.count.get().cnt;
  }

  /** 删除单条 */
  delete(id) {
    return this._stmts.deleteById.run(id).changes > 0;
  }

  /** 清空所有 */
  clearAll() {
    this.db.transaction(() => {
      this._stmts.deleteAll.run();
      // 重建 FTS 索引
      this.db.exec("INSERT INTO facts_fts(facts_fts) VALUES ('rebuild')");
    })();
  }

  /** 导出所有（不含内部字段），供 API 使用 */
  exportAll() {
    return this.getAll();
  }

  /**
   * 批量导入
   * @param {Array<{ fact, tags, time?, session_id? }>} entries
   */
  importAll(entries) {
    const run = this.db.transaction(() => {
      for (const entry of entries) {
        this.add({
          fact: entry.fact,
          tags: entry.tags || [],
          time: entry.time || null,
          session_id: entry.session_id || null,
        });
      }
    });
    run();
  }

  /** 关闭数据库连接 */
  close() {
    if (this.db?.open) this.db.close();
    if (this._vectorEngine) this._vectorEngine.close();
    if (this._embeddingModel) this._embeddingModel.close();
    if (this._ftsOptimizer) this._ftsOptimizer.close();
    if (this._forgettingCurve) this._forgettingCurve.close();
    if (this._archiveManager) this._archiveManager.close();
  }

  /** 行 → 对象 */
  _rowToFact(row) {
    let userFeedback = {};
    try {
      userFeedback = JSON.parse(row.user_feedback || "{}");
    } catch {
      userFeedback = {};
    }

    return {
      id: row.id,
      fact: row.fact,
      tags: (() => {
        try { return JSON.parse(row.tags); } catch { return []; }
      })(),
      time: row.time,
      effective_time: row.effective_time,
      session_id: row.session_id,
      created_at: row.created_at,
      matchCount: row.matchCount ?? undefined,
      quality_scores: {
        specificity: row.quality_specificity ?? 0,
        recency: row.quality_recency ?? 0,
        relevance: row.quality_relevance ?? 0,
        consistency: row.quality_consistency ?? 0,
        usage: row.quality_usage ?? 0,
        composite: row.quality_composite ?? 0,
      },
      access_count: row.access_count ?? 0,
      hit_count: row.hit_count ?? 0,
      importance: row.importance ?? 0,
      user_feedback: userFeedback,
      _raw_user_feedback: userFeedback,
    };
  }
}
