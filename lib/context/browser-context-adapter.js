import { EventEmitter } from "node:events";
import { readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("browser-context");

/**
 * @typedef {object} BrowserContext
 * @property {"browser:context"} type
 * @property {string} url
 * @property {string} title
 * @property {string|null} searchQuery
 * @property {string|null} selection
 * @property {object|null} article
 * @property {number} timestamp
 */

export class BrowserContextAdapter extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string} [options.fallbackDir]  降级文件目录
   * @param {number} [options.pollIntervalMs=1000]
   */
  constructor(options = {}) {
    super();
    this._fallbackDir = options.fallbackDir ?? join(homedir(), ".openjarvis", "browser-bridge");
    this._fallbackFile = join(this._fallbackDir, "messages.jsonl");
    this._pollIntervalMs = options.pollIntervalMs ?? 1000;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._poll();
    log.log("started polling", { file: this._fallbackFile });
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * 轮询降级文件
   * @private
   */
  async _poll() {
    if (!this._running) return;

    try {
      const messages = await this.pollMessages();
      for (const msg of messages) {
        this.processMessage(msg);
      }
    } catch (err) {
      log.error("poll failed", err.message);
    }

    this._timer = setTimeout(() => this._poll(), this._pollIntervalMs);
  }

  /**
   * 读取并清空降级文件
   * @returns {Promise<object[]>}
   */
  async pollMessages() {
    if (!existsSync(this._fallbackFile)) return [];

    const content = readFileSync(this._fallbackFile, "utf8");
    if (!content.trim()) return [];

    // 清空文件（原子性读取后删除）
    unlinkSync(this._fallbackFile);

    // 解析 JSONL
    const messages = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        messages.push(JSON.parse(line));
      } catch {
        log.warn("invalid JSON line", line.slice(0, 100));
      }
    }

    return messages;
  }

  /**
   * 处理单条浏览器消息
   * @param {object} message
   * @returns {object|null} 标准化后的 BrowserContext，或 null（无 data 时跳过）
   */
  processMessage(message) {
    if (!message.data) return null;

    const context = this._normalizeContext(message.data);
    log.log("browser context", { url: context.url, title: context.title });
    this.emit("context", context);
    return context;
  }

  /**
   * 批量处理浏览器消息
   * @param {object[]} messages
   * @returns {object[]} 有效处理结果列表
   */
  processMessages(messages) {
    const results = [];
    for (const msg of messages) {
      const ctx = this.processMessage(msg);
      if (ctx) results.push(ctx);
    }
    return results;
  }

  /**
   * 标准化浏览器上下文
   * @private
   */
  _normalizeContext(data) {
    return {
      type: "browser:context",
      url: data.url ?? "",
      title: data.title ?? "",
      searchQuery: data.searchQuery ?? null,
      selection: data.selection ?? null,
      article: data.article ?? null,
      timestamp: data.timestamp ?? Date.now(),
    };
  }
}
