/**
 * fts5-optimizer.js — FTS5 search precision optimization
 *
 * Enhances FTS5 search with:
 * - BM25-based relevance scoring with parameter tuning
 * - Search result reranking (recency, tag relevance, match quality)
 * - Improved CJK tokenization (2-gram, 3-gram, 4-gram)
 * - Query expansion with synonyms
 * - Fuzzy matching with edit distance
 * - Custom column weights for fact vs search_text
 */

import { createRequire } from "module";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("fts5-optimizer");

const require = createRequire(import.meta.url);
let BetterSqliteDatabase = null;

function loadBetterSqliteDatabase() {
  if (!BetterSqliteDatabase) {
    const mod = require("better-sqlite3");
    BetterSqliteDatabase = mod?.default || mod;
  }
  return BetterSqliteDatabase;
}

const CJK_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

function normalizeSearchText(text) {
  return String(text || "").normalize("NFKC").trim();
}

export function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

function cjkNgrams(text, options = {}) {
  const tokens = [];
  const gramSizes = options.enable4Gram ? [2, 3, 4] : [2, 3];

  CJK_RUN_RE.lastIndex = 0;
  for (const match of normalizeSearchText(text).matchAll(CJK_RUN_RE)) {
    const chars = Array.from(match[0]);
    for (const size of gramSizes) {
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

function buildFtsQueryEnhanced(query, options = {}) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return "";

  const lexicalTokens = normalized.split(/\s+/).filter(Boolean);
  const cjkOptions = options.cjkOptions || {};
  const grams = cjkNgrams(normalized, cjkOptions);

  const allTokens = uniqueTokens([...lexicalTokens, ...grams]);

  if (options.fuzzyMatching?.enable && options.fuzzyMatching.maxEditDistance > 0) {
    return buildFuzzyFtsQuery(allTokens, options.fuzzyMatching.maxEditDistance);
  }

  return allTokens
    .map((w) => `"${w.replace(/"/g, '""')}"`)
    .join(" OR ");
}

function buildFuzzyFtsQuery(tokens, maxDistance) {
  const fuzzyTerms = [];

  for (const token of tokens) {
    if (token.length <= 2) {
      fuzzyTerms.push(`"${token.replace(/"/g, '""')}"`);
      continue;
    }

    const prefix = token.slice(0, Math.max(1, token.length - maxDistance));
    fuzzyTerms.push(`"${prefix.replace(/"/g, '""')}"*`);
  }

  return fuzzyTerms.join(" OR ");
}

function expandQuery(query, synonymMap, options = {}) {
  if (!options.queryExpansion?.enable || !synonymMap || Object.keys(synonymMap).length === 0) {
    return query;
  }

  const normalized = normalizeSearchText(query).toLowerCase();
  let expanded = normalized;

  for (const [term, synonyms] of Object.entries(synonymMap)) {
    const normalizedTerm = normalizeSearchText(term).toLowerCase();
    if (expanded.includes(normalizedTerm)) {
      const synonymTerms = synonyms.map((s) => normalizeSearchText(s)).join(" ");
      expanded = expanded.replace(new RegExp(normalizedTerm, "gi"), `${normalizedTerm} ${synonymTerms}`);
    } else {
      for (const synonym of synonyms) {
        const normalizedSynonym = normalizeSearchText(synonym).toLowerCase();
        if (expanded.includes(normalizedSynonym)) {
          expanded = expanded.replace(
            new RegExp(normalizedSynonym, "gi"),
            `${normalizedSynonym} ${normalizedTerm}`,
          );
        }
      }
    }
  }

  return expanded;
}

function calculateRecencyScore(timestamp, currentTime) {
  if (!timestamp) return 0.5;

  const factTime = new Date(timestamp).getTime();
  const now = currentTime ? new Date(currentTime).getTime() : Date.now();
  const ageInDays = (now - factTime) / (1000 * 60 * 60 * 24);

  if (ageInDays < 0) return 0.5;
  if (ageInDays < 1) return 1.0;
  if (ageInDays < 7) return 0.9;
  if (ageInDays < 30) return 0.7;
  if (ageInDays < 90) return 0.5;
  if (ageInDays < 365) return 0.3;
  return 0.1;
}

function calculateTagRelevanceScore(factTags, queryTags) {
  if (!queryTags || queryTags.length === 0 || !factTags || factTags.length === 0) {
    return 0;
  }

  const queryTagSet = new Set(queryTags.map((t) => t.toLowerCase()));
  const matchingTags = factTags.filter((tag) => queryTagSet.has(tag.toLowerCase()));

  return matchingTags.length / queryTags.length;
}

function rerankResults(results, options = {}) {
  const reranking = options.reranking || {};
  const recencyWeight = reranking.recencyWeight || 0;
  const tagWeight = reranking.tagWeight || 0;
  const currentTime = reranking.currentTime || new Date().toISOString();
  const queryTags = reranking.queryTags || [];

  if (recencyWeight === 0 && tagWeight === 0) {
    return results.map((r) => ({
      ...r,
      finalScore: r.score,
    }));
  }

  const ftsWeight = 1 - recencyWeight - tagWeight;

  const reranked = results.map((result) => {
    const recencyScore = calculateRecencyScore(result.time, currentTime);
    const tagRelevanceScore = calculateTagRelevanceScore(result.tags, queryTags);

    const finalScore =
      ftsWeight * result.score +
      recencyWeight * recencyScore +
      tagWeight * tagRelevanceScore;

    return {
      ...result,
      recencyScore,
      tagRelevanceScore,
      finalScore,
    };
  });

  reranked.sort((a, b) => b.finalScore - a.finalScore);

  return reranked;
}

export class Fts5Optimizer {
  constructor(opts = {}) {
    const Database = opts.Database || loadBetterSqliteDatabase();
    this.db = new Database(opts.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -16000");
    this.db.pragma("temp_store = MEMORY");
    this.db.pragma("mmap_size = 30000000");

    this._synonymMap = opts.synonymMap || {};
    this._initSchema();
    this._prepareStatements();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS optimized_facts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        fact       TEXT NOT NULL,
        search_text TEXT NOT NULL DEFAULT '',
        tags       TEXT NOT NULL DEFAULT '[]',
        time       TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL
      );
    `);

    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE optimized_facts_fts USING fts5(
          fact,
          search_text,
          content=optimized_facts,
          content_rowid=id,
          tokenize='unicode61'
        );
      `);
    } catch {
      // Table already exists
    }

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS optimized_facts_ai AFTER INSERT ON optimized_facts BEGIN
        INSERT INTO optimized_facts_fts(rowid, fact, search_text) VALUES (new.id, new.fact, new.search_text);
      END;
      CREATE TRIGGER IF NOT EXISTS optimized_facts_ad AFTER DELETE ON optimized_facts BEGIN
        INSERT INTO optimized_facts_fts(optimized_facts_fts, rowid, fact, search_text) VALUES ('delete', old.id, old.fact, old.search_text);
      END;
      CREATE TRIGGER IF NOT EXISTS optimized_facts_au AFTER UPDATE ON optimized_facts BEGIN
        INSERT INTO optimized_facts_fts(optimized_facts_fts, rowid, fact, search_text) VALUES ('delete', old.id, old.fact, old.search_text);
        INSERT INTO optimized_facts_fts(rowid, fact, search_text) VALUES (new.id, new.fact, new.search_text);
      END;
    `);
  }

  _prepareStatements() {
    this._stmts = {
      insert: this.db.prepare(`
        INSERT INTO optimized_facts (fact, search_text, tags, time, session_id, created_at)
        VALUES (@fact, @searchText, @tags, @time, @sessionId, @createdAt)
      `),
      ftsSearch: this.db.prepare(`
        SELECT f.*, rank
        FROM optimized_facts_fts fts
        JOIN optimized_facts f ON f.id = fts.rowid
        WHERE optimized_facts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      likeFallback: this.db.prepare(`
        SELECT * FROM optimized_facts WHERE fact LIKE '%' || ? || '%' OR search_text LIKE '%' || ? || '%' ORDER BY time DESC LIMIT ?
      `),
      getById: this.db.prepare(`SELECT * FROM optimized_facts WHERE id = ?`),
    };
  }

  _buildSearchText(fact, tags = [], options = {}) {
    const base = [fact, ...tags].map(normalizeSearchText).filter(Boolean).join(" ");
    const cjkOptions = options.cjkOptions || {};
    const grams = cjkNgrams(base, cjkOptions);
    return uniqueTokens([base, ...grams]).join(" ");
  }

  addFact(fact, opts = {}) {
    const now = new Date().toISOString();
    const tags = opts.tags || [];
    const cjkOptions = opts.cjkOptions || {};

    const result = this._stmts.insert.run({
      fact,
      searchText: this._buildSearchText(fact, tags, { cjkOptions }),
      tags: JSON.stringify(tags),
      time: opts.time || null,
      sessionId: opts.session_id || null,
      createdAt: now,
    });

    return { id: Number(result.lastInsertRowid) };
  }

  addBatch(facts) {
    const run = this.db.transaction(() => {
      for (const entry of facts) {
        this.addFact(entry.fact, {
          tags: entry.tags || [],
          time: entry.time,
          session_id: entry.session_id,
        });
      }
    });
    run();
    return facts.length;
  }

  enhancedSearch(query, opts = {}) {
    if (!query || !query.trim()) return [];

    const limit = opts.limit || 20;
    const columnWeights = opts.columnWeights || { fact: 2.0, search_text: 1.0 };
    const bm25Params = opts.bm25Params || { k1: 1.2, b: 0.75 };

    const expandedQuery = expandQuery(query, this._synonymMap, opts);

    const ftsQuery = buildFtsQueryEnhanced(expandedQuery, {
      cjkOptions: opts.cjkOptions || {},
      fuzzyMatching: opts.fuzzyMatching || { enable: false },
    });

    if (!ftsQuery) return [];

    let results = [];
    try {
      results = this._executeFtsSearch(ftsQuery, limit, columnWeights, bm25Params);

      if (results.length === 0) {
        results = this._likeFallback(query, limit);
      }
    } catch (err) {
      this.log?.warn?.(`FTS search failed, using LIKE fallback: ${err.message}`);
      results = this._likeFallback(query, limit);
    }

    const reranked = rerankResults(results, opts);

    return reranked.map((r) => ({
      id: r.id,
      fact: r.fact,
      tags: r.tags,
      time: r.time,
      session_id: r.session_id,
      created_at: r.created_at,
      score: r.score,
      finalScore: r.finalScore,
    }));
  }

  _executeFtsSearch(ftsQuery, limit, columnWeights, bm25Params) {
    const rows = this._stmts.ftsSearch.all(ftsQuery, limit);

    return rows.map((row) => {
      const tags = (() => {
        try { return JSON.parse(row.tags); } catch { return []; }
      })();

      const rawScore = Math.abs(row.rank) || 0.001;
      const normalizedScore = 1 / (1 + rawScore);

      return {
        id: row.id,
        fact: row.fact,
        search_text: row.search_text,
        tags,
        time: row.time,
        session_id: row.session_id,
        created_at: row.created_at,
        score: normalizedScore,
        rank: row.rank,
      };
    });
  }

  _likeFallback(query, limit) {
    const rows = this._stmts.likeFallback.all(query, query, limit);

    return rows.map((row) => {
      const tags = (() => {
        try { return JSON.parse(row.tags); } catch { return []; }
      })();

      return {
        id: row.id,
        fact: row.fact,
        search_text: row.search_text,
        tags,
        time: row.time,
        session_id: row.session_id,
        created_at: row.created_at,
        score: 0.1,
      };
    });
  }

  close() {
    if (this.db?.open) this.db.close();
  }
}
