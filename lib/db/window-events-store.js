import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Window Events 数据存储
 * 封装 better-sqlite3 操作
 */
export class WindowEventsStore {
  /**
   * @param {import("better-sqlite3").Database} db
   */
  constructor(db) {
    this._db = db;
  }

  /**
   * 初始化表结构
   */
  init() {
    const sql = readFileSync(
      join(__dirname, "migrations", "window-events-table.sql"),
      "utf8"
    );
    this._db.exec(sql);
  }

  /**
   * 插入事件
   * @param {object} event
   */
  insert(event) {
    const stmt = this._db.prepare(`
      INSERT INTO window_events (app, title, timestamp, duration_ms, a11y_text, ocr_text, content_hash, privacy_level, platform, event_type)
      VALUES (@app, @title, @timestamp, @duration_ms, @a11y_text, @ocr_text, @content_hash, @privacy_level, @platform, @event_type)
    `);

    stmt.run({
      app: event.app ?? "unknown",
      title: event.title ?? null,
      timestamp: event.timestamp ?? Date.now(),
      duration_ms: event.duration_ms ?? 0,
      a11y_text: event.a11y_text ?? null,
      ocr_text: event.ocr_text ?? null,
      content_hash: event.content_hash ?? null,
      privacy_level: event.privacy_level ?? "standard",
      platform: event.platform ?? null,
      event_type: event.event_type ?? "app_switch",
    });
  }

  /**
   * 批量插入
   * @param {object[]} events
   */
  insertBatch(events) {
    const insert = this._db.prepare(`
      INSERT INTO window_events (app, title, timestamp, duration_ms, a11y_text, ocr_text, content_hash, privacy_level, platform, event_type)
      VALUES (@app, @title, @timestamp, @duration_ms, @a11y_text, @ocr_text, @content_hash, @privacy_level, @platform, @event_type)
    `);

    const insertMany = this._db.transaction((items) => {
      for (const item of items) {
        insert.run({
          app: item.app ?? "unknown",
          title: item.title ?? null,
          timestamp: item.timestamp ?? Date.now(),
          duration_ms: item.duration_ms ?? 0,
          a11y_text: item.a11y_text ?? null,
          ocr_text: item.ocr_text ?? null,
          content_hash: item.content_hash ?? null,
          privacy_level: item.privacy_level ?? "standard",
          platform: item.platform ?? null,
          event_type: item.event_type ?? "app_switch",
        });
      }
    });

    insertMany(events);
  }

  /**
   * 查询最近 N 条
   * @param {number} limit
   * @returns {object[]}
   */
  queryRecent(limit = 100) {
    return this._db
      .prepare("SELECT * FROM window_events ORDER BY timestamp DESC LIMIT ?")
      .all(limit);
  }

  /**
   * 按时间范围查询
   * @param {number} startTime
   * @param {number} endTime
   * @returns {object[]}
   */
  queryRange(startTime, endTime) {
    return this._db
      .prepare("SELECT * FROM window_events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp")
      .all(startTime, endTime);
  }

  /**
   * 获取应用使用时长统计
   * @param {number} startTime
   * @param {number} endTime
   * @returns {Record<string, number>} app -> duration_ms
   */
  getAppDurationStats(startTime, endTime) {
    const rows = this._db
      .prepare(`
        SELECT app, SUM(duration_ms) as total_duration
        FROM window_events
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY app
      `)
      .all(startTime, endTime);

    const result = {};
    for (const row of rows) {
      result[row.app] = row.total_duration;
    }
    return result;
  }

  /**
   * 获取应用切换次数
   * @param {number} startTime
   * @param {number} endTime
   * @returns {number}
   */
  getSwitchCount(startTime, endTime) {
    const row = this._db
      .prepare("SELECT COUNT(*) as count FROM window_events WHERE timestamp >= ? AND timestamp <= ?")
      .get(startTime, endTime);
    return row.count;
  }

  /**
   * 获取每日事件数
   * @param {number} days
   * @returns {Array<{date: string, count: number}>}
   */
  getDailyCounts(days = 7) {
    return this._db
      .prepare(`
        SELECT date(timestamp / 1000, 'unixepoch') as date, COUNT(*) as count
        FROM window_events
        WHERE timestamp >= ?
        GROUP BY date
        ORDER BY date DESC
      `)
      .all(Date.now() - days * 86400000);
  }
}
