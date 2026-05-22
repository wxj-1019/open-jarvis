/**
 * forgetting-curve.js — Ebbinghaus-inspired forgetting curve engine
 *
 * Models memory decay over time with configurable schedule points.
 * Memories below the threshold are candidates for archival (not deletion).
 * Frequently accessed or high-importance memories get reinforcement.
 */

import { createRequire } from "module";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("forgetting-curve");

const require = createRequire(import.meta.url);
let BetterSqliteDatabase = null;

function loadBetterSqliteDatabase() {
  if (!BetterSqliteDatabase) {
    const mod = require("better-sqlite3");
    BetterSqliteDatabase = mod?.default || mod;
  }
  return BetterSqliteDatabase;
}

export const DEFAULT_FORGETTING_SCHEDULE = [
  { days: 1, retentionRate: 0.5 },
  { days: 3, retentionRate: 0.3 },
  { days: 7, retentionRate: 0.2 },
  { days: 30, retentionRate: 0.1 },
];

const MIN_RETENTION_BOOST = 0;
const MAX_RETENTION = 1.0;

export class ForgettingCurveEngine {
  /**
   * @param {string} dbPath - facts.db path
   * @param {{
   *   enabled: boolean,
   *   schedule: Array<{days: number, retentionRate: number}>,
   *   archiveThreshold: number,
   *   protectedTags: string[]
   * }} config
   */
  constructor(dbPath, config) {
    const Database = loadBetterSqliteDatabase();
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this._config = config;
    this._schedule = [...(config.schedule || DEFAULT_FORGETTING_SCHEDULE)].sort(
      (a, b) => a.days - b.days,
    );
    this._archiveThreshold = typeof config.archiveThreshold === "number"
      ? Math.max(0, Math.min(1, config.archiveThreshold))
      : 0.25;
    this._protectedTags = Array.isArray(config.protectedTags) ? config.protectedTags : [];

    this._migrateSchema();
    this._prepareStatements();
  }

  _migrateSchema() {
    const columns = this.db.pragma("table_info(facts)");
    const columnNames = new Set(columns.map((c) => c.name));

    const additions = [
      { name: "hit_count", sql: "ALTER TABLE facts ADD COLUMN hit_count INTEGER NOT NULL DEFAULT 0" },
      { name: "last_accessed_at", sql: "ALTER TABLE facts ADD COLUMN last_accessed_at TEXT" },
      { name: "importance", sql: "ALTER TABLE facts ADD COLUMN importance REAL NOT NULL DEFAULT 0" },
      { name: "last_decay_check", sql: "ALTER TABLE facts ADD COLUMN last_decay_check TEXT" },
    ];

    for (const col of additions) {
      if (!columnNames.has(col.name)) {
        try {
          this.db.exec(col.sql);
          this.log?.info?.(`Added column: ${col.name}`);
        } catch (err) {
          this.log?.warn?.(`Failed to add column ${col.name}: ${err.message}`);
        }
      }
    }
  }

  _prepareStatements() {
    this._stmts = {
      getAllForDecay: this.db.prepare(`
        SELECT id, fact, tags, time, created_at, hit_count, last_accessed_at, importance, last_decay_check
        FROM facts
        WHERE last_decay_check IS NULL OR last_decay_check < datetime('now', '-1 day')
        ORDER BY created_at ASC
      `),
      updateDecayCheck: this.db.prepare(`
        UPDATE facts SET last_decay_check = datetime('now') WHERE id = ?
      `),
      recordAccess: this.db.prepare(`
        UPDATE facts
        SET hit_count = hit_count + 1, last_accessed_at = datetime('now')
        WHERE id = ?
      `),
      setImportance: this.db.prepare(`
        UPDATE facts SET importance = ? WHERE id = ?
      `),
      getFactById: this.db.prepare(`
        SELECT id, fact, tags, hit_count, importance, last_accessed_at
        FROM facts WHERE id = ?
      `),
    };
  }

  /**
   * Calculate base retention rate for a given age in days
   * @param {number} ageDays - Age of memory in days
   * @returns {number} Retention rate (0-1)
   */
  calculateRetention(ageDays) {
    if (ageDays <= 0) return MAX_RETENTION;

    const schedule = this._schedule;
    if (schedule.length === 0) return MAX_RETENTION;

    const lastPoint = schedule[schedule.length - 1];
    if (ageDays >= lastPoint.days) {
      return Math.max(lastPoint.retentionRate, 0);
    }

    for (let i = 0; i < schedule.length - 1; i++) {
      const current = schedule[i];
      const next = schedule[i + 1];

      if (ageDays >= current.days && ageDays < next.days) {
        const ratio = (ageDays - current.days) / (next.days - current.days);
        return current.retentionRate - ratio * (current.retentionRate - next.retentionRate);
      }
    }

    return schedule[0].retentionRate;
  }

  /**
   * Calculate retention with importance boost
   * @param {number} ageDays
   * @param {number} importance - 0 to 1
   * @returns {number}
   */
  calculateRetentionWithImportance(ageDays, importance) {
    const base = this.calculateRetention(ageDays);
    const boost = importance * 0.3;
    return Math.min(base + boost, MAX_RETENTION);
  }

  /**
   * Calculate retention with hit count boost
   * @param {number} ageDays
   * @param {number} hitCount
   * @returns {number}
   */
  calculateRetentionWithHits(ageDays, hitCount) {
    const base = this.calculateRetention(ageDays);
    if (hitCount <= 0) return base;
    const boost = Math.log10(1 + hitCount) / 10;
    return Math.min(base + boost, MAX_RETENTION);
  }

  /**
   * Calculate retention with combined reinforcement
   * @param {number} ageDays
   * @param {number} importance
   * @param {number} hitCount
   * @returns {number}
   */
  calculateRetentionWithReinforcement(ageDays, importance, hitCount) {
    const base = this.calculateRetention(ageDays);
    const importanceBoost = importance * 0.3;
    const hitBoost = hitCount > 0 ? Math.log10(1 + hitCount) / 10 : 0;
    return Math.min(base + importanceBoost + hitBoost, MAX_RETENTION);
  }

  /**
   * Check if a memory is protected by tags
   * @param {string[]} tags
   * @returns {boolean}
   */
  isMemoryProtected(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return false;
    const protectedSet = new Set(this._protectedTags);
    return tags.some((tag) => protectedSet.has(tag));
  }

  /**
   * Parse tags from JSON string
   * @param {string} tagsJson
   * @returns {string[]}
   */
  _parseTags(tagsJson) {
    try {
      const tags = typeof tagsJson === "string" ? JSON.parse(tagsJson) : tagsJson;
      return Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [];
    } catch {
      return [];
    }
  }

  /**
   * Calculate age in days from created_at timestamp
   * @param {string} createdAt
   * @returns {number}
   */
  _ageInDays(createdAt) {
    if (!createdAt) return 0;
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    return (now - created) / (24 * 60 * 60 * 1000);
  }

  /**
   * Evaluate all facts for forgetting
   * @returns {{
   *   toArchive: Array<object>,
   *   healthy: Array<object>,
   *   protected: Array<object>
   * }}
   */
  evaluateForgetting() {
    const result = {
      toArchive: [],
      healthy: [],
      protected: [],
    };

    if (!this._config.enabled) {
      const allFacts = this._stmts.getAllForDecay.all();
      result.healthy = allFacts.map((row) => this._rowToFact(row));
      return result;
    }

    const facts = this._stmts.getAllForDecay.all();

    for (const row of facts) {
      const fact = this._rowToFact(row);
      const tags = this._parseTags(row.tags);
      const ageDays = this._ageInDays(row.created_at);

      this._stmts.updateDecayCheck.run(row.id);

      if (this.isMemoryProtected(tags)) {
        result.protected.push(fact);
        continue;
      }

      const retention = this.calculateRetentionWithReinforcement(
        ageDays,
        row.importance || 0,
        row.hit_count || 0,
      );

      if (retention < this._archiveThreshold) {
        result.toArchive.push(fact);
      } else {
        result.healthy.push(fact);
      }
    }

    this.log?.info?.(
      `Forgetting evaluation: ${result.toArchive.length} to archive, ${result.healthy.length} healthy, ${result.protected.length} protected`,
    );

    return result;
  }

  /**
   * Record a memory access (increment hit count)
   * @param {number} factId
   */
  recordAccess(factId) {
    this._stmts.recordAccess.run(factId);
    this.log?.debug?.(`Recorded access to fact ${factId}`);
  }

  /**
   * Set importance for a fact
   * @param {number} factId
   * @param {number} importance - 0 to 1
   */
  setImportance(factId, importance) {
    const value = Math.max(MIN_RETENTION_BOOST, Math.min(MAX_RETENTION, importance));
    this._stmts.setImportance.run(value, factId);
    this.log?.info?.(`Set importance ${value} for fact ${factId}`);
  }

  /**
   * Get the current config
   * @returns {object}
   */
  getConfig() {
    return {
      enabled: this._config.enabled,
      schedule: this._schedule,
      archiveThreshold: this._archiveThreshold,
      protectedTags: this._protectedTags,
    };
  }

  /**
   * Update config dynamically
   * @param {object} newConfig
   */
  updateConfig(newConfig) {
    if (typeof newConfig.enabled === "boolean") {
      this._config.enabled = newConfig.enabled;
    }
    if (Array.isArray(newConfig.schedule) && newConfig.schedule.length > 0) {
      this._schedule = [...newConfig.schedule].sort((a, b) => a.days - b.days);
    }
    if (typeof newConfig.archiveThreshold === "number") {
      this._archiveThreshold = Math.max(0, Math.min(1, newConfig.archiveThreshold));
    }
    if (Array.isArray(newConfig.protectedTags)) {
      this._protectedTags = newConfig.protectedTags;
    }
  }

  /** Row to fact object */
  _rowToFact(row) {
    return {
      id: row.id,
      fact: row.fact,
      tags: this._parseTags(row.tags),
      time: row.time,
      session_id: row.session_id,
      created_at: row.created_at,
      hit_count: row.hit_count ?? 0,
      importance: row.importance ?? 0,
      last_accessed_at: row.last_accessed_at,
    };
  }

  /** Close database connection */
  close() {
    if (this.db?.open) this.db.close();
  }
}
