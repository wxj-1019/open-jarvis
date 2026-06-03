/**
 * vad-service-v2.js — 增强版 VAD 语音活动检测服务
 *
 * 支持三种模式：
 *   - 'rms':    纯能量检测（与原 VADService 一致）
 *   - 'hybrid': RMS 预过滤 + Silero VAD 精确检测
 *   - 'silero': 纯 Silero VAD（需要 @ricky0123/vad-web）
 *
 * 架构：
 *   前端 AudioWorklet → 音频 chunk → IPC → VADServiceV2.onAudioData()
 *   VADServiceV2 根据模式路由到 RMS 或 Silero 引擎
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("vad-service-v2");

// ── 模式枚举 ──

export const VAD_MODE = Object.freeze({
  RMS: "rms",
  HYBRID: "hybrid",
  SILERO: "silero",
});

const VALID_MODES = Object.values(VAD_MODE);

// ── 状态枚举 ──

export const VAD_STATE_V2 = Object.freeze({
  SILENCE: "silence",
  SPEECH: "speech",
  UNKNOWN: "unknown",
});

// ── 默认配置 ──

export const DEFAULT_VAD_V2_CONFIG = Object.freeze({
  mode: VAD_MODE.RMS,
  silenceThreshold: 0.01,
  silenceDurationMs: 1500,
  speechDurationMs: 300,
  sampleRate: 16000,
  /**
   * Silero VAD 判定阈值 (0-1)。
   * 高于此值判定为语音。
   */
  vadThreshold: 0.5,
  /**
   * VAD 模式: 'strict' | 'normal' | 'loose'
   * 控制 Silero 的灵敏度。
   */
  vadMode: "normal",
});

/**
 * @typedef {object} VADServiceV2Options
 * @property {'rms'|'hybrid'|'silero'} [mode] - VAD 模式 (默认 'rms')
 * @property {number} [silenceThreshold] - 静音能量阈值 (0-1, 默认 0.01)
 * @property {number} [silenceDurationMs] - 持续静音判定时间 (默认 1500ms)
 * @property {number} [speechDurationMs] - 持续语音判定时间 (默认 300ms)
 * @property {number} [sampleRate] - 采样率 (默认 16000)
 * @property {number} [vadThreshold] - Silero VAD 阈值 (默认 0.5)
 * @property {'strict'|'normal'|'loose'} [vadMode] - Silero 灵敏度 (默认 'normal')
 */

/**
 * @class VADServiceV2
 * 增强版 VAD 服务，支持多模式语音活动检测。
 * @extends EventEmitter
 */
export class VADServiceV2 extends EventEmitter {
  /**
   * @param {VADServiceV2Options} [opts]
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(20);

    // ── 基础参数 ──
    /** @type {number} */
    this._silenceThreshold = opts.silenceThreshold ?? DEFAULT_VAD_V2_CONFIG.silenceThreshold;
    /** @type {number} */
    this._silenceDurationMs = opts.silenceDurationMs ?? DEFAULT_VAD_V2_CONFIG.silenceDurationMs;
    /** @type {number} */
    this._speechDurationMs = opts.speechDurationMs ?? DEFAULT_VAD_V2_CONFIG.speechDurationMs;
    /** @type {number} */
    this._sampleRate = opts.sampleRate ?? DEFAULT_VAD_V2_CONFIG.sampleRate;

    // ── 状态 ──
    /** @type {'silence'|'speech'|'unknown'} */
    this._state = VAD_STATE_V2.UNKNOWN;
    /** @type {boolean} */
    this._running = false;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._speechTimer = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._silenceTimer = null;
    /** @type {boolean} */
    this._speechStarted = false;

    // ── 模式 ──
    /** @type {'rms'|'hybrid'|'silero'} */
    this._mode = this._validateMode(opts.mode ?? DEFAULT_VAD_V2_CONFIG.mode);

    // ── Silero 相关 ──
    /** @type {boolean} Silero VAD 是否已就绪 */
    this._sileroReady = false;
    /** @type {object|null} Silero VAD 实例 */
    this._sileroVad = null;
    /** @type {number|null} 最近一次 Silero 语音概率 */
    this._sileroSpeechProb = null;
    /** @type {boolean} 是否正在初始化 */
    this._initializing = false;
    /** @type {Promise<void>|null} 初始化 Promise */
    this._initPromise = null;

    // ── Silero 配置 ──
    /** @type {number} */
    this._vadThreshold = opts.vadThreshold ?? DEFAULT_VAD_V2_CONFIG.vadThreshold;
    /** @type {'strict'|'normal'|'loose'} */
    this._vadMode = opts.vadMode ?? DEFAULT_VAD_V2_CONFIG.vadMode;

    moduleLog?.info?.("VADServiceV2 initialized with mode: %s", this._mode);
  }

  // ── 公共 API ──

  /**
   * 异步初始化 Silero VAD（针对 hybrid/silero 模式）。
   * 对于 rms 模式，此方法直接返回。
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._mode === VAD_MODE.RMS) {
      moduleLog?.debug?.("RMS mode, no Silero initialization needed");
      return;
    }

    if (this._initializing || this._initPromise) {
      return this._initPromise;
    }

    this._initializing = true;
    this._initPromise = this._loadSileroVad();

    try {
      await this._initPromise;
    } catch (err) {
      moduleLog?.warn?.("Silero VAD initialization failed, falling back to RMS: %s", err.message);
      this._sileroReady = false;
      this._sileroVad = null;
      this._mode = VAD_MODE.RMS;
    } finally {
      this._initializing = false;
    }
  }

  /**
   * 开始 VAD 监听。
   */
  start() {
    if (this._running) {
      return;
    }

    this._running = true;
    this._speechStarted = false;
    this._setState(VAD_STATE_V2.SILENCE);

    moduleLog?.info?.("VAD v2 started (mode: %s)", this._mode);
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
    this._sileroSpeechProb = null;
    this._setState(VAD_STATE_V2.UNKNOWN);

    moduleLog?.info?.("VAD v2 stopped");
  }

  /**
   * 获取当前状态。
   * @returns {'silence'|'speech'|'unknown'}
   */
  getState() {
    return this._state;
  }

  /**
   * 处理音频数据（由前端通过 IPC 送入）。
   * 根据当前模式路由到 RMS 或 Silero 引擎。
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

    switch (this._mode) {
      case VAD_MODE.SILERO:
        this._onAudioDataSilero(audioData);
        break;
      case VAD_MODE.HYBRID:
        this._onAudioDataHybrid(audioData);
        break;
      case VAD_MODE.RMS:
      default:
        this._onAudioDataRms(audioData);
        break;
    }
  }

  /**
   * 设置 VAD 模式。
   * 如果切换到 hybrid/silero 模式但 Silero 未就绪，会保持当前模式。
   * @param {'rms'|'hybrid'|'silero'} mode
   * @returns {boolean} 是否成功切换
   */
  setMode(mode) {
    const validated = this._validateMode(mode);
    if (!validated) {
      moduleLog?.warn?.("setMode: invalid mode '%s', ignored", mode);
      return false;
    }

    // 如果切换到需要 Silero 的模式但未就绪
    if (
      (validated === VAD_MODE.HYBRID || validated === VAD_MODE.SILERO) &&
      !this._sileroReady
    ) {
      moduleLog?.warn?.(
        "setMode: Silero not ready, cannot switch to '%s'. Call initialize() first.",
        validated
      );
      return false;
    }

    this._mode = validated;
    moduleLog?.info?.("VAD mode changed to: %s", this._mode);
    this.emit("modechange", { mode: this._mode });
    return true;
  }

  /**
   * 获取当前 VAD 模式。
   * @returns {'rms'|'hybrid'|'silero'}
   */
  getMode() {
    return this._mode;
  }

  /**
   * 检查 Silero VAD 是否已就绪。
   * @returns {boolean}
   */
  isSileroReady() {
    return this._sileroReady;
  }

  /**
   * 重置 VAD 内部状态。
   * 清除所有计时器，重置标志位。
   * 如果正在运行，状态重置为 SILENCE。
   */
  reset() {
    this._clearTimers();
    this._speechStarted = false;
    this._sileroSpeechProb = null;

    if (this._running) {
      this._setState(VAD_STATE_V2.SILENCE);
    }

    moduleLog?.info?.("VAD v2 reset");
  }

  /**
   * 销毁 VAD 服务，释放所有资源。
   */
  async destroy() {
    this.stop();

    if (this._sileroVad) {
      try {
        if (typeof this._sileroVad.destroy === "function") {
          await this._sileroVad.destroy();
        }
      } catch (err) {
        moduleLog?.warn?.("Error destroying Silero VAD: %s", err.message);
      }
      this._sileroVad = null;
      this._sileroReady = false;
    }

    this.removeAllListeners();
    moduleLog?.info?.("VAD v2 destroyed");
  }

  // ── 内部方法：Silero 加载 ──

  /**
   * 动态加载 Silero VAD。
   * @private
   */
  async _loadSileroVad() {
    try {
      // 动态导入 @ricky0123/vad-web
      // 此库是浏览器专用，在 Node.js 环境中会失败，此时回退到 RMS
      const { VadNet } = await import("@ricky0123/vad-web");

      const vadNet = new VadNet();

      // 将 VadNet 包装成 VADRecorder 兼容接口
      const model = await vadNet.loader.load();

      this._sileroVad = {
        model,
        vadNet,
      };

      this._sileroReady = true;
      moduleLog?.info?.("Silero VAD loaded successfully");
    } catch (err) {
      // 在 Node.js 或加载失败时，静默回退到 RMS
      moduleLog?.debug?.("Silero VAD not available: %s", err.message);
      throw err;
    }
  }

  // ── 内部方法：模式路由 ──

  /**
   * RMS 模式处理音频。
   * @param {Float32Array} audioData
   * @private
   */
  _onAudioDataRms(audioData) {
    const rms = this._calculateRMS(audioData);
    this._processEnergy(rms);
  }

  /**
   * Hybrid 模式处理音频：RMS 预过滤 + Silero 精确检测。
   * @param {Float32Array} audioData
   * @private
   */
  _onAudioDataHybrid(audioData) {
    const rms = this._calculateRMS(audioData);

    // 如果 Silero 未就绪，回退到纯 RMS
    if (!this._sileroReady) {
      this._processEnergy(rms);
      return;
    }

    // RMS 预过滤：如果能量很低，直接判定为静音
    const preFilterThreshold = this._silenceThreshold * 0.5;
    if (rms < preFilterThreshold) {
      this._processEnergy(0);
      return;
    }

    // 能量足够高，使用 Silero 做精确检测
    this._processSilero(audioData);
  }

  /**
   * Silero 模式处理音频。
   * @param {Float32Array} audioData
   * @private
   */
  _onAudioDataSilero(audioData) {
    // 如果 Silero 未就绪，回退到 RMS
    if (!this._sileroReady) {
      const rms = this._calculateRMS(audioData);
      this._processEnergy(rms);
      return;
    }

    this._processSilero(audioData);
  }

  /**
   * 使用 Silero VAD 处理音频。
   * @param {Float32Array} audioData
   * @private
   */
  _processSilero(audioData) {
    if (!this._sileroVad || !this._sileroReady) {
      this._processEnergy(0);
      return;
    }

    try {
      // 调用 Silero VAD 获取语音概率
      const { isSpeech, prob } = this._runSileroFrame(audioData);

      this._sileroSpeechProb = prob;

      if (isSpeech) {
        this._handleSpeechDetected();
      } else {
        this._handleSilenceDetected();
      }
    } catch (err) {
      // Silero 处理失败，回退到 RMS
      moduleLog?.warn?.("Silero processing failed, falling back to RMS: %s", err.message);
      const rms = this._calculateRMS(audioData);
      this._processEnergy(rms);
    }
  }

  /**
   * 运行 Silero VAD 对单帧音频进行推理。
   * 在浏览器环境中使用实际的 Silero 模型，
   * 在非浏览器环境中使用模拟实现。
   * @param {Float32Array} audioData
   * @returns {{ isSpeech: boolean, prob: number }}
   * @private
   */
  _runSileroFrame(audioData) {
    // 如果有实际的 Silero 模型，使用它
    if (this._sileroVad?.model && typeof this._sileroVad.model.process === "function") {
      const prob = this._sileroVad.model.process(audioData);
      return {
        isSpeech: prob >= this._vadThreshold,
        prob,
      };
    }

    // 非浏览器环境：使用 RMS 能量模拟 Silero 概率
    // 这是一个合理的近似，用于 Node.js 测试环境
    const rms = this._calculateRMS(audioData);
    // 将 RMS 映射到 0-1 的概率值
    const prob = Math.min(1, rms * 10);
    return {
      isSpeech: prob >= this._vadThreshold,
      prob,
    };
  }

  // ── 内部方法：能量处理（复用 VADService 逻辑）──

  /**
   * 根据能量值判定语音/静音状态。
   * @param {number} energy - RMS 能量值
   * @private
   */
  _processEnergy(energy) {
    const isSpeech = energy >= this._silenceThreshold;

    if (isSpeech) {
      this._handleSpeechDetected();
    } else {
      this._handleSilenceDetected();
    }
  }

  /**
   * 计算 RMS (Root Mean Square) 能量值。
   * @param {Float32Array} audioData
   * @returns {number}
   * @private
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
   * @private
   */
  _handleSpeechDetected() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }

    if (this._state === VAD_STATE_V2.SPEECH) {
      return;
    }

    if (!this._speechTimer) {
      this._speechTimer = setTimeout(() => {
        this._onSpeechDurationReached();
      }, this._speechDurationMs);
    }
  }

  /**
   * 处理检测到静音。
   * @private
   */
  _handleSilenceDetected() {
    if (this._speechTimer) {
      clearTimeout(this._speechTimer);
      this._speechTimer = null;
    }

    if (this._state === VAD_STATE_V2.SILENCE) {
      return;
    }

    if (!this._silenceTimer) {
      this._silenceTimer = setTimeout(() => {
        this._onSilenceDurationReached();
      }, this._silenceDurationMs);
    }
  }

  /**
   * 语音持续时间达到阈值，切换到 SPEECH 状态。
   * @private
   */
  _onSpeechDurationReached() {
    this._speechTimer = null;

    if (this._state !== VAD_STATE_V2.SPEECH && this._running) {
      this._setState(VAD_STATE_V2.SPEECH);
      this._speechStarted = true;
      this.emit("speechstart");
      moduleLog?.info?.("Speech detected");
    }
  }

  /**
   * 静音持续时间达到阈值，切换到 SILENCE 状态。
   * @private
   */
  _onSilenceDurationReached() {
    this._silenceTimer = null;

    if (this._state !== VAD_STATE_V2.SILENCE && this._running) {
      const wasSpeech = this._state === VAD_STATE_V2.SPEECH;
      this._setState(VAD_STATE_V2.SILENCE);

      if (wasSpeech) {
        this.emit("speechend");
        moduleLog?.info?.("Speech ended");
      }

      this.emit("silence");
    }
  }

  /**
   * 清除所有定时器。
   * @private
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
   * @private
   */
  _setState(state) {
    if (this._state !== state) {
      const prev = this._state;
      this._state = state;
      this.emit("statechange", { state, prev });
    }
  }

  /**
   * 验证模式值。
   * @param {string} mode
   * @returns {'rms'|'hybrid'|'silero'}
   * @private
   */
  _validateMode(mode) {
    if (!VALID_MODES.includes(mode)) {
      moduleLog?.warn?.("Invalid VAD mode: '%s', defaulting to 'rms'", mode);
      return VAD_MODE.RMS;
    }
    return mode;
  }
}
