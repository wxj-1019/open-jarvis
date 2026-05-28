import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("data-retention");

/**
 * 数据保留管理器
 * 按时间分层管理数据：7 天完整 / 30 天摘要 / 之后删除
 */
export class DataRetentionManager {
  /**
   * @param {object} [options]
   * @param {number} [options.fullRetentionDays=7]
   * @param {number} [options.summaryRetentionDays=30]
   * @param {object} [options.db]  better-sqlite3 Database 实例
   */
  constructor(options = {}) {
    this._fullRetentionDays = options.fullRetentionDays ?? 7;
    this._summaryRetentionDays = options.summaryRetentionDays ?? 30;
    this._db = options.db ?? null;
    this._timer = null;
  }

  /**
   * 启动定时清理
   * @param {number} [intervalMs=86400000]  默认每天检查一次
   */
  start(intervalMs = 86400000) {
    if (this._timer) return;

    this._timer = setInterval(() => {
      this.cleanup().catch((err) => {
        log.error(`scheduled cleanup failed: ${err.message}`);
      });
    }, intervalMs);

    log.log("retention manager started", {
      fullDays: this._fullRetentionDays,
      summaryDays: this._summaryRetentionDays,
    });
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * 执行清理
   */
  async cleanup() {
    if (!this._db) {
      log.log("no database configured, skipping cleanup");
      return { deleted: 0, summarized: 0 };
    }

    const now = Date.now();
    const fullCutoff = now - this._fullRetentionDays * 86400000;
    const summaryCutoff = now - this._summaryRetentionDays * 86400000;

    let summarized = 0;
    let deleted = 0;

    try {
      // 1. 7-30 天的数据：保留摘要，删除详细内容
      const summarizeResult = this._db.prepare(`
        UPDATE window_events
        SET a11y_text = NULL, ocr_text = NULL, content_hash = NULL
        WHERE timestamp < ? AND timestamp >= ?
          AND (a11y_text IS NOT NULL OR ocr_text IS NOT NULL)
      `).run(fullCutoff, summaryCutoff);
      summarized = summarizeResult.changes;

      // 2. >30 天的数据：完全删除
      const deleteResult = this._db.prepare(`
        DELETE FROM window_events
        WHERE timestamp < ?
      `).run(summaryCutoff);
      deleted = deleteResult.changes;

      log.log("cleanup completed", { summarized, deleted });
    } catch (err) {
      log.error(`cleanup failed: ${err.message}`);
      throw err;
    }

    return { summarized, deleted };
  }
}
