import { EventEmitter } from "node:events";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("event-aggregator");

/**
 * @typedef {object} AggregatorOptions
 * @property {number} [minIntervalMs=200]  最小捕获间隔（防风暴）
 * @property {number} [maxIntervalMs=10000]  最大捕获间隔（兜底）
 */

export class EventAggregator extends EventEmitter {
  /**
   * @param {AggregatorOptions} [options]
   */
  constructor(options = {}) {
    super();
    this._minIntervalMs = options.minIntervalMs ?? 200;
    this._maxIntervalMs = options.maxIntervalMs ?? 10000;
    /** @type {Map<string, number>} 事件类型 → 最后发射时间 */
    this._lastEmitTime = new Map();
    /** @type {Map<string, object>} 事件类型 → 待合并事件 */
    this._pendingMerge = new Map();
    /** @type {Map<string, ReturnType<setTimeout>>} */
    this._debounceTimers = new Map();
  }

  /**
   * 摄入原始事件，经过去重/合并/节流后发射
   * @param {object} event
   * @param {string} event.type  事件类型，如 "app:switch"
   * @param {number} event.timestamp
   */
  ingest(event) {
    const now = Date.now();
    const key = this._makeKey(event);
    const lastTime = this._lastEmitTime.get(key) ?? 0;

    // 最小间隔节流
    if (now - lastTime < this._minIntervalMs) {
      log.log("throttled", { type: event.type, key });
      return;
    }

    // 去重：同类型同目标事件在 debounce 窗口内只发一次
    const debounceMs = this._getDebounceMs(event.type);
    const pending = this._pendingMerge.get(key);

    if (pending) {
      // 更新待合并事件（保留最早时间戳）
      pending.timestamp = Math.min(pending.timestamp, event.timestamp);
      // 合并额外字段
      Object.assign(pending, event);
      pending.timestamp = event.timestamp; // 但用最新的
      log.log("merged", { type: event.type, key });
      return;
    }

    // 首次收到，设置 debounce 定时器
    this._pendingMerge.set(key, { ...event });
    const timer = setTimeout(() => {
      const finalEvent = this._pendingMerge.get(key);
      if (finalEvent) {
        this._lastEmitTime.set(key, now);
        this._pendingMerge.delete(key);
        this.emit("event", finalEvent);
        log.log("emitted", { type: finalEvent.type, key });
      }
      this._debounceTimers.delete(key);
    }, debounceMs);

    this._debounceTimers.set(key, timer);
  }

  /**
   * 生成事件去重键
   * @param {object} event
   * @returns {string}
   */
  _makeKey(event) {
    switch (event.type) {
      case "app:switch":
        return `app:switch|${event.app}`;
      case "window:focus":
        return `window:focus|${event.app}|${event.title}`;
      case "ui:click":
        return `ui:click|${event.app}`;
      case "input:typing":
        return `input:typing|${event.app}`;
      case "ui:scroll":
        return `ui:scroll|${event.app}`;
      case "clipboard:copy":
        return `clipboard:copy|${event.contentHash ?? "unknown"}`;
      case "idle:fallback":
        return `idle:fallback|${event.app}`;
      default:
        return `${event.type}|${event.app ?? "unknown"}`;
    }
  }

  /**
   * 根据事件类型返回 debounce 时间
   * @param {string} eventType
   * @returns {number}
   */
  _getDebounceMs(eventType) {
    const map = {
      "app:switch": 300,
      "window:focus": 300,
      "ui:click": 200,
      "input:typing": 500,
      "ui:scroll": 400,
      "clipboard:copy": 200,
      "idle:fallback": 5000,
    };
    return map[eventType] ?? 300;
  }

  /**
   * 清空所有待处理事件和定时器
   */
  flush() {
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
    for (const event of this._pendingMerge.values()) {
      this.emit("event", event);
    }
    this._pendingMerge.clear();
  }

  /**
   * 销毁
   */
  destroy() {
    this.flush();
    this.removeAllListeners();
  }
}

