/**
 * turn-taking-manager.js — 话轮管理器
 *
 * 智能判断用户是否说完，处理填充词（"嗯"、"um"等），
 * 根据语义完整度动态调整静音等待时长。
 *
 * 架构：
 *   输入：VAD 事件 + STT 中间结果
 *   输出：turn_complete 事件
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("turn-taking");

const DEFAULT_FILLER_WORDS = [
  "嗯", "啊", "那个", "这个", "就是", "然后", "所以说",
  "um", "uh", "like", "you know", "so", "well", "I mean",
];

export class TurnTakingManager extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {string[]} [opts.fillerWords] - 填充词列表
   * @param {number} [opts.minUtteranceMs=500] - 最短有效语音时长
   * @param {number} [opts.completionSilenceMs=800] - 完整句子后等待时长
   * @param {number} [opts.incompleteSilenceMs=1500] - 不完整句子后等待时长
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(10);

    this._fillerWords = opts.fillerWords ?? DEFAULT_FILLER_WORDS;
    this._minUtteranceMs = opts.minUtteranceMs ?? 500;
    this._completionSilenceMs = opts.completionSilenceMs ?? 800;
    this._incompleteSilenceMs = opts.incompleteSilenceMs ?? 1500;

    /** @type {number|null} */
    this._speechStartTs = null;
    /** @type {number|null} */
    this._silenceTimer = null;
    /** @type {string} */
    this._interimText = "";
    /** @type {boolean} */
    this._active = false;
  }

  /**
   * VAD 检测到语音开始。
   */
  onVadSpeechStart() {
    if (!this._active) return;
    this._speechStartTs = Date.now();
    this._clearSilenceTimer();
  }

  /**
   * VAD 检测到静音，根据语义完整度决定是否结束话轮。
   * @param {number} durationMs - 已静音时长
   */
  onVadSilence(durationMs) {
    if (!this._active) return;

    const speechDuration = this._speechStartTs
      ? Date.now() - this._speechStartTs
      : 0;

    // 语音太短，忽略（可能是噪声）
    if (speechDuration < this._minUtteranceMs) {
      return;
    }

    // 根据文本完整度选择等待时长
    const isComplete = this._isTextComplete(this._interimText);
    const waitMs = isComplete
      ? this._completionSilenceMs
      : this._incompleteSilenceMs;

    if (durationMs >= waitMs) {
      this._emitTurnComplete();
    } else if (!this._silenceTimer) {
      const remaining = waitMs - durationMs;
      this._silenceTimer = setTimeout(() => {
        this._silenceTimer = null;
        this._emitTurnComplete();
      }, remaining);
    }
  }

  /**
   * STT 中间结果更新。
   * @param {string} text - 当前识别文本
   */
  onInterimText(text) {
    if (!this._active) return;
    this._interimText = text || "";

    // 填充词检测：如果整个文本都是填充词，延长等待
    if (this._isOnlyFillerWords(this._interimText)) {
      this._clearSilenceTimer();
    }
  }

  /**
   * 启动话轮管理。
   */
  start() {
    this._active = true;
    this._speechStartTs = null;
    this._interimText = "";
    this._clearSilenceTimer();
    moduleLog?.info?.("TurnTakingManager started");
  }

  /**
   * 停止话轮管理。
   */
  stop() {
    this._active = false;
    this._speechStartTs = null;
    this._interimText = "";
    this._clearSilenceTimer();
    moduleLog?.info?.("TurnTakingManager stopped");
  }

  /**
   * 判断文本是否以完整句子结尾。
   * @param {string} text
   * @returns {boolean}
   */
  _isTextComplete(text) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    return /[。！？!?\n]$/.test(trimmed);
  }

  /**
   * 判断文本是否全部是填充词。
   * @param {string} text
   * @returns {boolean}
   */
  _isOnlyFillerWords(text) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return false;
    return this._fillerWords.some((fw) => trimmed === fw.toLowerCase());
  }

  _emitTurnComplete() {
    const text = this._interimText.trim();
    this._clearSilenceTimer();
    this._speechStartTs = null;
    this._interimText = "";

    if (text && !this._isOnlyFillerWords(text)) {
      moduleLog?.info?.(`Turn complete: "${text.slice(0, 50)}"`);
      this.emit("turn_complete", { text });
    }
  }

  _clearSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }
}
