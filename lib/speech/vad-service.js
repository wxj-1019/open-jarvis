/**
 * vad-service.js — VAD 语音活动检测服务
 *
 * 基于 Web Audio API 的能量检测 VAD（阶段1）
 * 使用 RMS (Root Mean Square) 计算音频能量，
 * 通过阈值和时间窗口判定语音/静音状态。
 *
 * 架构：
 *   前端 AudioWorklet → 音频 chunk → IPC → VADService.onAudioData()
 *   VADService 根据能量检测触发 speechstart/speechend 事件
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("vad-service");

// ── 默认配置 ──

export const DEFAULT_VAD_CONFIG = Object.freeze({
  silenceThreshold: 0.01,
  silenceDurationMs: 1500,
  speechDurationMs: 300,
  sampleRate: 16000,
});

// ── 状态枚举 ──

export const VAD_STATE = Object.freeze({
  SILENCE: "silence",
  SPEECH: "speech",
  UNKNOWN: "unknown",
});

/**
 * @typedef {object} VADOptions
 * @property {number} [silenceThreshold] - 静音能量阈值 (0-1, 默认 0.01)
 * @property {number} [silenceDurationMs] - 持续静音判定时间 (默认 1500ms)
 * @property {number} [speechDurationMs] - 持续语音判定时间 (默认 300ms)
 * @property {number} [sampleRate] - 采样率 (默认 16000)
 */

export class VADService extends EventEmitter {
  /**
   * @param {VADOptions} [opts]
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(20);

    /** @type {number} 静音能量阈值 */
    this._silenceThreshold = opts.silenceThreshold ?? DEFAULT_VAD_CONFIG.silenceThreshold;

    /** @type {number} 持续静音判定时间 (ms) */
    this._silenceDurationMs = opts.silenceDurationMs ?? DEFAULT_VAD_CONFIG.silenceDurationMs;

    /** @type {number} 持续语音判定时间 (ms) */
    this._speechDurationMs = opts.speechDurationMs ?? DEFAULT_VAD_CONFIG.speechDurationMs;

    /**
     * @type {number} 采样率
     * 由前端 AudioWorklet 传入，用于日志记录和音频时序计算。
     * 当前 VAD 阶段1基于纯能量检测，不依赖采样率做 RMS 计算，
     * 但保留此字段以兼容未来基于频域的特征分析和日志记录。
     */
    this._sampleRate = opts.sampleRate ?? DEFAULT_VAD_CONFIG.sampleRate;

    /** @type {'silence'|'speech'|'unknown'} */
    this._state = VAD_STATE.UNKNOWN;

    /** @type {boolean} 是否正在运行 */
    this._running = false;

    /** @type {ReturnType<typeof setTimeout>|null} 语音判定定时器 */
    this._speechTimer = null;

    /** @type {ReturnType<typeof setTimeout>|null} 静音判定定时器 */
    this._silenceTimer = null;

    /** @type {boolean} 是否已经触发过 speechstart */
    this._speechStarted = false;

    moduleLog?.info?.("VADService initialized");
  }

  // ── 公共 API ──

  /**
   * 开始 VAD 监听。
   */
  start() {
    if (this._running) {
      return;
    }

    this._running = true;
    this._speechStarted = false;
    this._setState(VAD_STATE.SILENCE);

    moduleLog?.info?.("VAD started");
  }

  /**
   * 停止 VAD 监听。
   */
  stop() {
    if (!this._running) {
      return;
    }

    this._running = false;
    this._clearTimers();
    this._speechStarted = false;
    this._setState(VAD_STATE.UNKNOWN);

    moduleLog?.info?.("VAD stopped");
  }

  /**
   * 获取当前状态。
   * @returns {'silence'|'speech'|'unknown'}
   */
  getState() {
    return this._state;
  }

  /**
   * 重置 VAD 内部状态。
   * 清除所有计时器，重置标志位。
   * 如果正在运行，状态重置为 SILENCE。
   */
  reset() {
    this._clearTimers();
    this._speechStarted = false;

    if (this._running) {
      this._setState(VAD_STATE.SILENCE);
    }

    moduleLog?.info?.("VAD reset");
  }

  /**
   * 处理音频数据（由前端通过 IPC 送入）。
   * @param {Float32Array} audioData - PCM 音频数据
   */
  onAudioData(audioData) {
    if (!this._running) {
      return;
    }

    if (!audioData || typeof audioData.length !== "number") {
      moduleLog?.warn?.("onAudioData: invalid input, expected array-like");
      return;
    }

    if (audioData.length === 0) {
      return;
    }

    const rms = this._calculateRMS(audioData);
    this._processEnergy(rms);
  }

  /**
   * 处理 RMS 能量值（spec 兼容别名）。
   * @param {number} rms - RMS 能量值
   */
  processAudio(rms) {
    if (!this._running) {
      return;
    }

    if (typeof rms !== "number" || !Number.isFinite(rms) || rms < 0) {
      moduleLog?.warn?.("processAudio: invalid rms value, expected finite number >= 0");
      return;
    }

    this._processEnergy(rms);
  }

  // ── 内部方法 ──

  /**
   * 根据能量值判定语音/静音状态。
   * @param {number} energy - RMS 能量值
   */
  _processEnergy(energy) {
    const isSpeech = energy >= this._silenceThreshold;

    if (isSpeech) {
      this._handleSpeechDetected();
    } else {
      this._handleSilenceDetected();
    }
  }

  // ── 内部方法 ──

  /**
   * 计算 RMS (Root Mean Square) 能量值。
   * @param {Float32Array} audioData
   * @returns {number}
   */
  _calculateRMS(audioData) {
    if (audioData.length === 0) {
      return 0;
    }

    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * 处理检测到语音。
   */
  _handleSpeechDetected() {
    // 清除静音定时器
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }

    // 如果已经是 SPEECH 状态，不需要重复处理
    if (this._state === VAD_STATE.SPEECH) {
      return;
    }

    // 启动语音判定定时器
    if (!this._speechTimer) {
      this._speechTimer = setTimeout(() => {
        this._onSpeechDurationReached();
      }, this._speechDurationMs);
    }
  }

  /**
   * 处理检测到静音。
   */
  _handleSilenceDetected() {
    // 清除语音定时器
    if (this._speechTimer) {
      clearTimeout(this._speechTimer);
      this._speechTimer = null;
    }

    // 如果已经是 SILENCE 状态，不需要重复处理
    if (this._state === VAD_STATE.SILENCE) {
      return;
    }

    // 启动静音判定定时器
    if (!this._silenceTimer) {
      this._silenceTimer = setTimeout(() => {
        this._onSilenceDurationReached();
      }, this._silenceDurationMs);
    }
  }

  /**
   * 语音持续时间达到阈值，切换到 SPEECH 状态。
   */
  _onSpeechDurationReached() {
    this._speechTimer = null;

    if (this._state !== VAD_STATE.SPEECH && this._running) {
      this._setState(VAD_STATE.SPEECH);
      this._speechStarted = true;
      this.emit("speechstart");
      moduleLog?.info?.("Speech detected");
    }
  }

  /**
   * 静音持续时间达到阈值，切换到 SILENCE 状态。
   */
  _onSilenceDurationReached() {
    this._silenceTimer = null;

    if (this._state !== VAD_STATE.SILENCE && this._running) {
      const wasSpeech = this._state === VAD_STATE.SPEECH;
      this._setState(VAD_STATE.SILENCE);

      if (wasSpeech) {
        this.emit("speechend");
        moduleLog?.info?.("Speech ended");
      }

      this.emit("silence");
    }
  }

  /**
   * 清除所有定时器。
   */
  _clearTimers() {
    if (this._speechTimer) {
      clearTimeout(this._speechTimer);
      this._speechTimer = null;
    }
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  /**
   * 设置状态并触发事件。
   * @param {'silence'|'speech'|'unknown'} state
   */
  _setState(state) {
    if (this._state !== state) {
      const prev = this._state;
      this._state = state;
      this.emit("statechange", { state, prev });
    }
  }
}
