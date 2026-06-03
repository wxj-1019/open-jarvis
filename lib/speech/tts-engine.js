/**
 * tts-engine.js — TTS 文字转语音引擎
 *
 * 核心状态机和队列管理，不依赖 DOM/Web Speech API。
 * 通过事件接口与渲染进程通信，由 IPC 桥接层转发。
 *
 * 架构：
 *   Server(TTSEngine) --事件--> IPC Bridge --IPC--> Renderer(speechSynthesis)
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";
import { TTSCache } from "./tts-cache.js";

const moduleLog = createModuleLogger("tts-engine");

// ── 状态枚举 ──

export const TTS_STATE = Object.freeze({
  IDLE: "idle",
  SPEAKING: "speaking",
  PAUSED: "paused",
});

/**
 * @typedef {object} TTSSpeakOptions
 * @property {string} [voice] - 偏好的语音名称
 * @property {'zh-CN'|'zh-TW'|'en-US'|string} [lang] - 偏好的语言
 * @property {number} [rate] - 语速 (0.1-10, 默认 1.0)
 * @property {number} [pitch] - 音高 (0-2, 默认 1.0)
 * @property {number} [volume] - 音量 (0-1, 默认 1.0)
 */

export class TTSEngine extends EventEmitter {
  /** @param {object} [opts] */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(20);

    /** @type {TTSSpeakOptions} */
    this._defaultOpts = {
      rate: opts.rate ?? 1.0,
      pitch: opts.pitch ?? 1.0,
      volume: opts.volume ?? 1.0,
      lang: opts.lang ?? "zh-CN",
    };

    /** @type {Array<{text: string, opts: TTSSpeakOptions, resolve: Function, reject: Function}>} */
    this._queue = [];

    /** @type {'idle'|'speaking'|'paused'} */
    this._state = TTS_STATE.IDLE;

    /** @type {TTSSpeakOptions|null} 当前正在播放的项 */
    this._current = null;

    this._paused = false;

    /** @type {TTSCache|null} */
    this._cache = opts.cacheOptions === false ? null : new TTSCache(opts.cacheOptions);

    moduleLog?.info?.("TTSEngine initialized");
  }

  // ── 公共 API ──

  /**
   * 将文本加入播放队列。
   * 返回 Promise，在"播放完成"事件确认后 resolve。
   *
   * @param {string} text
   * @param {TTSSpeakOptions} [opts]
   * @returns {Promise<void>}
   */
  speak(text, opts = {}) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return Promise.resolve();
    }

    const mergedOpts = { ...this._defaultOpts, ...opts };
    const cacheKey = TTSCache.makeKey(trimmed, mergedOpts.voice, mergedOpts.rate, mergedOpts.pitch);

    // Check cache first
    if (this._cache) {
      const cachedAudio = this._cache.get(cacheKey);
      if (cachedAudio !== null) {
        this.emit("speak-cached", trimmed, mergedOpts, cachedAudio);
        return Promise.resolve();
      }
    }

    return new Promise((resolve, reject) => {
      this._queue.push({ text: trimmed, opts: mergedOpts, resolve, reject, cacheKey });

      if (this._state === TTS_STATE.IDLE) {
        this._processQueue();
      }
    });
  }

  /**
   * 停止所有播放（清空队列 + 中断当前）。
   */
  stop() {
    // 队列中待播的所有 Promise：静默完成（不再拒绝，避免未处理的 reject）
    const cancelled = this._queue.splice(0);
    for (const item of cancelled) {
      item.resolve();
    }

    // 当前正在播的：静默完成
    if (this._current) {
      this._current.resolve();
      this._current = null;
    }

    this._paused = false;
    this._setState(TTS_STATE.IDLE);
    this.emit("stop");
  }

  /**
   * 暂停当前播放。
   */
  pause() {
    if (this._state === TTS_STATE.SPEAKING) {
      this._paused = true;
      this._setState(TTS_STATE.PAUSED);
      this.emit("pause");
    }
  }

  /**
   * 恢复暂停的播放。
   */
  resume() {
    if (this._state === TTS_STATE.PAUSED && this._paused) {
      this._paused = false;
      this._setState(TTS_STATE.SPEAKING);
      this.emit("resume");
    }
  }

  /**
   * 获取当前状态。
   * @returns {'idle'|'speaking'|'paused'}
   */
  getState() {
    return this._state;
  }

  /**
   * 获取待播队列长度。
   * @returns {number}
   */
  getQueueLength() {
    return this._queue.length;
  }

  /**
   * 获取默认选项。
   * @returns {TTSSpeakOptions}
   */
  getDefaultOpts() {
    return { ...this._defaultOpts };
  }

  /**
   * 更新默认选项。
   * @param {Partial<TTSSpeakOptions>} opts
   */
  updateDefaultOpts(opts) {
    Object.assign(this._defaultOpts, opts);
  }

  /**
   * 获取缓存统计信息。
   * @returns {{size: number, maxSize: number, hitCount: number, missCount: number, hitRate: number}|null}
   */
  getCacheStats() {
    return this._cache ? this._cache.getStats() : null;
  }

  // ── 语音选择（纯逻辑，供渲染进程使用） ──

  /**
   * 从可用语音列表中选择最佳匹配。
   *
   * @param {Array<{name: string, lang: string, default?: boolean}>} availableVoices
   * @param {string} [preferredLang] - 偏好的语言标签，如 'zh-CN'
   * @returns {{name: string, lang: string}|null}
   */
  static selectVoice(availableVoices, preferredLang = "zh-CN") {
    if (!Array.isArray(availableVoices) || availableVoices.length === 0) {
      return null;
    }

    // 优先级：偏好语言精确匹配 > 偏好语言前缀匹配 > 中文 > 英文 > 默认 > 第一个
    const langPriority = [
      preferredLang,
      preferredLang.split("-")[0], // zh
      "zh-CN",
      "zh-TW",
      "zh-HK",
      "zh",
      "en-US",
      "en-GB",
      "en",
    ];

    for (const lang of langPriority) {
      if (!lang) continue;
      const exact = availableVoices.find(
        (v) => v.lang?.toLowerCase() === lang.toLowerCase()
      );
      if (exact) return exact;
    }

    for (const lang of langPriority) {
      if (!lang) continue;
      const prefix = availableVoices.find((v) =>
        v.lang?.toLowerCase().startsWith(lang.toLowerCase())
      );
      if (prefix) return prefix;
    }

    // fallback: 默认语音 → 第一个
    const def = availableVoices.find((v) => v.default === true);
    return def || availableVoices[0] || null;
  }

  /**
   * 获取可用语言的语音数量统计。
   *
   * @param {Array<{lang: string}>} voices
   * @returns {Record<string, number>} 如 { "zh-CN": 3, "en-US": 2 }
   */
  static summarizeVoices(voices) {
    const summary = {};
    for (const v of voices) {
      const lang = v.lang || "unknown";
      summary[lang] = (summary[lang] || 0) + 1;
    }
    return summary;
  }

  // ── 内部方法 ──

  /**
   * 处理队列：逐个取出并发射 "speak" 事件。
   * 渲染进程监听 "speak" 事件后调用 speechSynthesis.speak()。
   * 渲染进程播放完成后通过 confirmPlayed() 通知引擎继续下一个。
   */
  _processQueue() {
    if (this._queue.length === 0) {
      this._current = null;
      this._setState(TTS_STATE.IDLE);
      return;
    }

    if (this._paused) return;

    const item = this._queue.shift();
    this._current = item;
    this._setState(TTS_STATE.SPEAKING);

    // 发射事件给 IPC 桥接层，由渲染进程实际播放
    this.emit("speak", item.text, item.opts, {
      /** 渲染进程播放完成后调用此回调 */
      confirmPlayed: (audio) => {
        if (this._current === item) {
          // Cache the audio result if cache is enabled
          if (this._cache && item.cacheKey) {
            this._cache.set(item.cacheKey, item.text, audio);
          }
          this._current = null;
          item.resolve();
          this._processQueue();
        }
      },
      /** 渲染进程播放出错时调用此回调 */
      confirmError: (err) => {
        if (this._current === item) {
          this._current = null;
          item.reject(err || new Error("TTS playback failed"));
          this._processQueue();
        }
      },
    });
  }

  _setState(state) {
    if (this._state !== state) {
      const prev = this._state;
      this._state = state;
      this.emit("statechange", { state, prev });
    }
  }

  /**
   * 销毁引擎，清理所有资源。
   */
  destroy() {
    this.stop();
    if (this._cache) {
      this._cache.destroy();
      this._cache = null;
    }
    this.removeAllListeners();
    moduleLog?.info?.("TTSEngine destroyed");
  }
}
