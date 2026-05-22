/**
 * memory-archive.js — Archive management for forgotten memories
 *
 * Archived memories are moved to a separate table/database for potential
 * restoration. Supports export/import for backup and transfer.
 */

import { createRequire } from "module";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("memory-archive");

const require = createRequire(import.meta.url);
let BetterSqliteDatabase = null;

function loadBetterSqliteDatabase() {
  if (!BetterSqliteDatabase) {
    const mod = require("better-sqlite3");
    BetterSqliteDatabase = mod?.default || mod;
  }
  return BetterSqliteDatabase;
}

function parseTags(rawTags) {
  try {
    const tags = typeof rawTags === "string" ? JSON.parse(rawTags) : rawTags;
    return Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export class MemoryArchiveManager {
  /**
   * @param {string} archivePath - Path to the archive database
   */
  constructor(archivePath) {
    const Database = loadBetterSqliteDatabase();
    this.db = new Database(archivePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -16000");
    this.db.pragma("temp_store = MEMORY");

    this._initSchema();
    this._prepareStatements();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS archived_facts (
        original_id  INTEGER,
        fact         TEXT NOT NULL,
        tags         TEXT NOT NULL DEFAULT '[]',
        time         TEXT,
        session_id   TEXT,
        created_at   TEXT NOT NULL,
        archived_at  TEXT NOT NULL,
        reason       TEXT NOT NULL DEFAULT 'decay_below_threshold',
        hit_count    INTEGER NOT NULL DEFAULT 0,
        importance   REAL NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_archived_time ON archived_facts(created_at);
      CREATE INDEX IF NOT EXISTS idx_archived_session ON archived_facts(session_id);
      CREATE INDEX IF NOT EXISTS idx_archived_at ON archived_facts(archived_at);
    `);
  }

  _prepareStatements() {
    this._stmts = {
      insert: this.db.prepare(`
        INSERT INTO archived_facts (original_id, fact, tags, time, session_id, created_at, archived_at, reason, hit_count, importance)
        VALUES (@originalId, @fact, @tags, @time, @sessionId, @createdAt, @archivedAt, @reason, @hitCount, @importance)
      `),
      getAll: this.db.prepare(`
        SELECT * FROM archived_facts ORDER BY archived_at DESC
      `),
      count: this.db.prepare(`
        SELECT COUNT(*) as cnt FROM archived_facts
      `),
      searchByFact: this.db.prepare(`
        SELECT * FROM archived_facts WHERE fact LIKE '%' || ? || '%' ORDER BY archived_at DESC
      `),
      searchBySession: this.db.prepare(`
        SELECT * FROM archived_facts WHERE session_id = ? ORDER BY archived_at DESC
      `),
      getById: this.db.prepare(`
        SELECT * FROM archived_facts WHERE original_id = ?
      `),
      deleteById: this.db.prepare(`
        DELETE FROM archived_facts WHERE original_id = ?
      `),
      clearAll: this.db.prepare(`
        DELETE FROM archived_facts
      `),
      cleanupOld: this.db.prepare(`
        DELETE FROM archived_facts WHERE archived_at < datetime(?, ?)
      `),
    };
  }

  /**
   * Archive a single fact
   * @param {{
   *   id: number,
   *   fact: string,
   *   tags: string[],
   *   time?: string,
   *   session_id?: string,
   *   created_at: string,
   *   hit_count: number,
   *   importance: number
   * }} fact
   * @param {string} reason - Reason for archiving
   */
  archiveFact(fact, reason = "decay_below_threshold") {
    const now = new Date().toISOString();
    this._stmts.insert.run({
      originalId: fact.id,
      fact: fact.fact,
      tags: JSON.stringify(fact.tags || []),
      time: fact.time || null,
      sessionId: fact.session_id || null,
      createdAt: fact.created_at,
      archivedAt: now,
      reason,
      hitCount: fact.hit_count ?? 0,
      importance: fact.importance ?? 0,
    });
    this.log?.info?.(`Archived fact ${fact.id}: ${fact.fact.slice(0, 50)}...`);
  }

  /**
   * Archive multiple facts in a transaction
   * @param {Array<object>} facts
   * @param {string} reason
   * @returns {number} Number of facts archived
   */
  archiveBatch(facts, reason = "decay_below_threshold") {
    const run = this.db.transaction(() => {
      for (const fact of facts) {
        this.archiveFact(fact, reason);
      }
    });
    run();
    return facts.length;
  }

  /**
   * Get all archived facts
   * @returns {Array<{
   *   original_id: number,
   *   fact: string,
   *   tags: string[],
   *   time: string,
   *   session_id: string,
   *   created_at: string,
   *   archived_at: string,
   *   reason: string,
   *   hit_count: number,
   *   importance: number
   * }>}
   */
  getAll() {
    return this._stmts.getAll.all().map((row) => this._rowToFact(row));
  }

  /**
   * Get count of archived facts
   * @returns {number}
   */
  getCount() {
    return this._stmts.count.get().cnt;
  }

  /**
   * Search archived facts by fact content
   * @param {string} query
   * @returns {Array<object>}
   */
  searchByFact(query) {
    if (!query || !query.trim()) return [];
    return this._stmts.searchByFact.all(query.trim()).map((row) => this._rowToFact(row));
  }

  /**
   * Search archived facts by tags
   * @param {string[]} queryTags
   * @returns {Array<object>}
   */
  searchByTags(queryTags) {
    if (!queryTags || queryTags.length === 0) return [];

    const all = this._stmts.getAll.all();
    return all
      .filter((row) => {
        const tags = parseTags(row.tags);
        return queryTags.some((qt) => tags.includes(qt));
      })
      .map((row) => this._rowToFact(row));
  }

  /**
   * Search archived facts by session_id
   * @param {string} sessionId
   * @returns {Array<object>}
   */
  searchBySession(sessionId) {
    if (!sessionId) return [];
    return this._stmts.searchBySession.all(sessionId).map((row) => this._rowToFact(row));
  }

  /**
   * Restore a fact from archive
   * @param {number} originalId
   * @returns {object|null} Restored fact data, or null if not found
   */
  restoreFact(originalId) {
    const row = this._stmts.getById.get(originalId);
    if (!row) return null;

    const fact = this._rowToFact(row);
    this._stmts.deleteById.run(originalId);

    this.log?.info?.(`Restored archived fact ${originalId}`);
    return fact;
  }

  /**
   * Restore multiple facts from archive
   * @param {number[]} originalIds
   * @returns {Array<object>} Restored facts
   */
  restoreBatch(originalIds) {
    const restored = [];
    const run = this.db.transaction(() => {
      for (const id of originalIds) {
        const fact = this.restoreFact(id);
        if (fact) restored.push(fact);
      }
    });
    run();
    return restored;
  }

  /**
   * Export all archived facts as JSON string
   * @returns {string} JSON string
   */
  exportAll() {
    const facts = this.getAll();
    return JSON.stringify(facts, null, 2);
  }

  /**
   * Import archived facts from JSON string
   * @param {string} jsonData - JSON string of archived facts
   * @returns {number} Number of facts imported
   */
  importAll(jsonData) {
    let facts;
    try {
      facts = JSON.parse(jsonData);
    } catch (err) {
      this.log?.warn?.(`Failed to parse import JSON: ${err.message}`);
      return 0;
    }

    if (!Array.isArray(facts) || facts.length === 0) return 0;

    const run = this.db.transaction(() => {
      for (const fact of facts) {
        this._stmts.insert.run({
          originalId: fact.original_id ?? null,
          fact: fact.fact,
          tags: JSON.stringify(fact.tags || []),
          time: fact.time || null,
          sessionId: fact.session_id || null,
          createdAt: fact.created_at || new Date().toISOString(),
          archivedAt: fact.archived_at || new Date().toISOString(),
          reason: fact.reason || "manual_import",
          hitCount: fact.hit_count ?? 0,
          importance: fact.importance ?? 0,
        });
      }
    });
    run();

    this.log?.info?.(`Imported ${facts.length} archived facts`);
    return facts.length;
  }

  /**
   * Remove archived facts older than specified days
   * @param {number} daysOld
   * @returns {number} Number of facts removed
   */
  cleanupOldArchives(daysOld) {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    const beforeCount = this.getCount();
    this._stmts.cleanupOld.run(cutoffDate, `+${daysOld} days`);
    const afterCount = this.getCount();
    const removed = beforeCount - afterCount;
    if (removed > 0) {
      this.log?.info?.(`Cleaned up ${removed} old archived facts`);
    }
    return removed;
  }

  /**
   * Delete a specific archived fact
   * @param {number} originalId
   * @returns {boolean}
   */
  deleteFact(originalId) {
    const result = this._stmts.deleteById.run(originalId);
    return result.changes > 0;
  }

  /**
   * Clear all archived facts
   */
  clearAll() {
    this._stmts.clearAll.run();
    this.log?.info?.("Cleared all archived facts");
  }

  /** Row to fact object */
  _rowToFact(row) {
    return {
      original_id: row.original_id,
      fact: row.fact,
      tags: parseTags(row.tags),
      time: row.time,
      session_id: row.session_id,
      created_at: row.created_at,
      archived_at: row.archived_at,
      reason: row.reason,
      hit_count: row.hit_count,
      importance: row.importance,
    };
  }

  /** Close database connection */
  close() {
    if (this.db?.open) this.db.close();
  }
}
