/**
 * voice-error-recovery.js — 语音错误恢复服务
 *
 * 处理语音对话中的网络故障、服务中断等问题，提供自动重试与降级策略。
 *
 * 特性:
 * - 指数退避重试（最大 5 次重试，30s 最大延迟，随机抖动）
 * - 状态快照保存与恢复（5 分钟 TTL）
 * - 服务降级策略（stt→webspeech, tts→webspeech, vad→rms）
 * - 错误分类与智能恢复
 */

import { EventEmitter } from "events";

// ── 错误类型枚举 ──

export const ERROR_TYPES = Object.freeze({
  NETWORK_ERROR: "network_error",
  SERVICE_UNAVAILABLE: "service_unavailable",
  TIMEOUT_ERROR: "timeout_error",
  RATE_LIMIT_ERROR: "rate_limit_error",
  UNKNOWN_ERROR: "unknown_error",
});

// ── 恢复状态枚举 ──

export const RECOVERY_STATE = Object.freeze({
  IDLE: "idle",
  RETRYING: "retrying",
  DEGRADED: "degraded",
  RECOVERED: "recovered",
  FAILED: "failed",
});

// ── 降级映射 ──

const DEGRADATION_MAP = Object.freeze({
  stt: "webspeech",
  tts: "webspeech",
  vad: "rms",
});

// ── 默认配置 ──

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MAX_DELAY = 30000;
const DEFAULT_BASE_DELAY = 1000;
const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @typedef {object} RecoveryOptions
 * @property {number} [maxRetries] - 最大重试次数 (默认 5)
 * @property {number} [maxDelay] - 最大延迟毫秒数 (默认 30000)
 * @property {number} [baseDelay] - 基础延迟毫秒数 (默认 1000)
 */

/**
 * 语音错误恢复服务。
 * @extends EventEmitter
 */
export class VoiceErrorRecovery extends EventEmitter {
  /**
   * @param {RecoveryOptions} [opts]
   */
  constructor(opts = {}) {
    super();

    /** @type {number} */
    this._maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

    /** @type {number} */
    this._maxDelay = opts.maxDelay ?? DEFAULT_MAX_DELAY;

    /** @type {number} */
    this._baseDelay = opts.baseDelay ?? DEFAULT_BASE_DELAY;

    /** @type {RECOVERY_STATE[keyof RECOVERY_STATE]} */
    this._state = RECOVERY_STATE.IDLE;

    /** @type {number} */
    this._retryCount = 0;

    /** @type {boolean} */
    this._aborted = false;

    /** @type {object|null} */
    this._savedState = null;

    /** @type {number|null} */
    this._savedStateTimestamp = null;

    /** @type {string|null} */
    this._degradedService = null;

    /** @type {string|null} */
    this._degradedFallback = null;
  }

  // ── 公共 API ──

  /**
   * 使用指数退避策略重试异步函数。
   * @param {Function} fn - 要重试的异步函数
   * @param {object} [opts]
   * @param {number} [opts.baseDelay] - 覆盖默认基础延迟
   * @returns {Promise<*>} 函数执行结果
   */
  async retryWithBackoff(fn, opts = {}) {
    const baseDelay = opts.baseDelay ?? this._baseDelay;
    this._retryCount = 0;
    this._aborted = false;

    while (this._retryCount <= this._maxRetries) {
      if (this._aborted) {
        this._setState(RECOVERY_STATE.FAILED);
        throw new Error("Retry aborted");
      }

      try {
        const result = await fn();
        if (this._retryCount > 0) {
          this._setState(RECOVERY_STATE.RECOVERED);
          this.emit("recovered", {
            attempts: this._retryCount + 1,
            errorType: this._lastErrorType,
          });
        }
        return result;
      } catch (err) {
        this._lastErrorType = this._classifyError(err);

        if (this._retryCount >= this._maxRetries) {
          this._setState(RECOVERY_STATE.FAILED);
          this.emit("failed", {
            attempts: this._retryCount + 1,
            errorType: this._lastErrorType,
            error: err,
          });
          throw err;
        }

        this._retryCount++;
        const delay = this._calculateBackoff(this._retryCount, baseDelay);

        this._setState(RECOVERY_STATE.RETRYING);
        this.emit("retry", {
          attempt: this._retryCount,
          delay,
          errorType: this._lastErrorType,
        });

        await this._sleep(delay);
      }
    }
  }

  /**
   * 保存当前状态快照。
   * @param {object} snapshot - 状态数据
   */
  saveState(snapshot) {
    this._savedState = snapshot;
    this._savedStateTimestamp = Date.now();
  }

  /**
   * 恢复状态快照（如果未过期）。
   * @returns {object|null} 快照数据，过期则返回 null
   */
  restoreState() {
    if (!this._savedState || this._savedStateTimestamp === null) {
      return null;
    }

    const elapsed = Date.now() - this._savedStateTimestamp;
    if (elapsed > STATE_TTL_MS) {
      this._savedState = null;
      this._savedStateTimestamp = null;
      return null;
    }

    return this._savedState;
  }

  /**
   * 降级指定服务到备用方案。
   * @param {string} service - 服务名称 (stt|tts|vad)
   * @returns {{ service: string, fallback: string }|null} 降级信息，不支持的服务返回 null
   */
  degrade(service) {
    const fallback = DEGRADATION_MAP[service];
    if (!fallback) {
      return null;
    }

    this._degradedService = service;
    this._degradedFallback = fallback;
    this._setState(RECOVERY_STATE.DEGRADED);

    this.emit("degraded", { service, fallback });

    return { service, fallback };
  }

  /**
   * 中止当前重试循环。
   */
  abort() {
    this._aborted = true;
  }

  /**
   * 获取当前恢复状态。
   * @returns {RECOVERY_STATE[keyof RECOVERY_STATE]}
   */
  getState() {
    return this._state;
  }

  /**
   * 获取当前重试次数。
   * @returns {number}
   */
  getRetryCount() {
    return this._retryCount;
  }

  // ── 内部方法 ──

  /**
   * 分类错误类型。
   * @param {Error} err
   * @returns {ERROR_TYPES[keyof ERROR_TYPES]}
   * @private
   */
  _classifyError(err) {
    if (!err || typeof err !== "object") {
      return ERROR_TYPES.UNKNOWN_ERROR;
    }

    const message = (err.message || "").toLowerCase();
    const code = (err.code || "").toLowerCase();
    const name = (err.name || "").toLowerCase();

    // 网络错误
    if (
      code === "econnrefused" ||
      code === "enotfound" ||
      code === "econnreset" ||
      code === "enetwork" ||
      code === "network_error" ||
      message.includes("network") ||
      message.includes("connection refused") ||
      message.includes("fetch failed") ||
      name.includes("networkerror")
    ) {
      return ERROR_TYPES.NETWORK_ERROR;
    }

    // 超时错误
    if (
      code === "etimedout" ||
      code === "timeout" ||
      code === "esockettimedout" ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      name.includes("timeouterror") ||
      name === "aborterror"
    ) {
      return ERROR_TYPES.TIMEOUT_ERROR;
    }

    // 速率限制
    if (
      err.statusCode === 429 ||
      err.status === 429 ||
      code === "rate_limit" ||
      code === "rate_limited" ||
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("429")
    ) {
      return ERROR_TYPES.RATE_LIMIT_ERROR;
    }

    // 服务不可用
    if (
      err.statusCode === 503 ||
      err.status === 503 ||
      err.statusCode === 502 ||
      err.status === 502 ||
      code === "service_unavailable" ||
      message.includes("service unavailable") ||
      message.includes("bad gateway") ||
      message.includes("503") ||
      message.includes("502")
    ) {
      return ERROR_TYPES.SERVICE_UNAVAILABLE;
    }

    return ERROR_TYPES.UNKNOWN_ERROR;
  }

  /**
   * 计算指数退避延迟（含随机抖动）。
   * @param {number} attempt - 当前重试次数（从 1 开始）
   * @param {number} baseDelay - 基础延迟
   * @returns {number} 延迟毫秒数
   * @private
   */
  _calculateBackoff(attempt, baseDelay) {
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this._maxDelay);

    // 添加 0-30% 的随机抖动
    const jitter = Math.random() * 0.3 * cappedDelay;

    return Math.round(cappedDelay + jitter);
  }

  /**
   * 设置状态并触发事件。
   * @param {RECOVERY_STATE[keyof RECOVERY_STATE]} newState
   * @private
   */
  _setState(newState) {
    if (this._state !== newState) {
      this._state = newState;
      this.emit("statechange", newState);
    }
  }

  /**
   * 可覆盖的 sleep 实现（便于测试）。
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
