/**
 * voice-pipeline.js — 语音对话流水线
 *
 * 编排 STT → Agent → TTS 全链路：
 *   1. 用户语音 → STT 识别 → 文本
 *   2. 文本 → Agent 处理 → 响应文本
 *   3. 响应文本 → TTS 播放
 *
 * 状态驱动，通过事件通知 UI 当前阶段。
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("voice-pipeline");

// ── 状态枚举 ──

export const PIPELINE_STATE = Object.freeze({
  IDLE: "idle",
  LISTENING: "listening", // STT 监听中
  PROCESSING: "processing", // Agent 处理中
  SPEAKING: "speaking", // TTS 播放中
  ERROR: "error",
});

/**
 * @typedef {object} VoicePipelineOptions
 * @property {'zh-CN'|'en-US'|string} [lang]
 * @property {number} [sttTimeout] - STT 最大监听超时 ms (默认 10000)
 * @property {number} [silenceTimeout] - 静音自动停止 ms (默认 3000)
 * @property {boolean} [autoSpeak] - 是否自动播放 Agent 响应 (默认 true)
 */

/**
 * @typedef {object} PipelineSession
 * @property {string} userText - 用户语音转文字后的文本
 * @property {string} agentText - Agent 响应的文本
 * @property {boolean} agentError - Agent 处理是否出错
 * @property {number} startedAt - 会话开始时间戳
 * @property {number} endedAt - 会话结束时间戳
 */

export class VoicePipeline extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('./stt-engine.js').STTEngine} deps.sttEngine
   * @param {import('./tts-engine.js').TTSEngine} deps.ttsEngine
   * @param {(userText: string) => Promise<string>} deps.onUserText - 用户文本 → Agent 响应文本
   * @param {VoicePipelineOptions} [opts]
   */
  constructor(deps, opts = {}) {
    super();
    this.setMaxListeners(20);

    this._stt = deps.sttEngine;
    this._tts = deps.ttsEngine;
    this._onUserText = deps.onUserText;

    this._defaultOpts = {
      lang: opts.lang || "zh-CN",
      sttTimeout: opts.sttTimeout ?? 10000,
      silenceTimeout: opts.silenceTimeout ?? 3000,
      autoSpeak: opts.autoSpeak ?? true,
    };

    /** @type {'idle'|'listening'|'processing'|'speaking'|'error'} */
    this._state = PIPELINE_STATE.IDLE;

    /** @type {PipelineSession|null} */
    this._session = null;

    /** @type {boolean} */
    this._cancelled = false;

    moduleLog?.info?.("VoicePipeline initialized");
  }

  // ── 公共 API ──

  /**
   * 启动语音对话。
   * 开始 STT 监听 → 识别完成 → 调用 onUserText → TTS 播放。
   *
   * @param {VoicePipelineOptions} [opts]
   * @returns {Promise<PipelineSession>}
   */
  async start(opts = {}) {
    if (this._state !== PIPELINE_STATE.IDLE) {
      throw new Error(`Pipeline is not idle (current: ${this._state})`);
    }

    const merged = { ...this._defaultOpts, ...opts };
    this._cancelled = false;
    this._session = null;
    const startedAt = Date.now();

    this._setState(PIPELINE_STATE.LISTENING);

    try {
      // Step 1: STT 监听
      const results = await this._stt.startListening({
        lang: merged.lang,
        continuous: false, // 硬编码：语音对话场景不需要持续识别，一句话后自动停止
        interimResults: true,
        timeout: merged.sttTimeout,
        silenceTimeout: merged.silenceTimeout,
      });

      if (this._cancelled) {
        throw new Error("Pipeline cancelled");
      }

      // 合并最终结果
      const userText = results
        .filter((r) => r.isFinal)
        .map((r) => r.text)
        .join(" ")
        .trim();

      if (!userText) {
        throw new Error("No speech recognized");
      }

      this._setState(PIPELINE_STATE.PROCESSING);
      this.emit("recognized", userText);

      // Step 2: Agent 处理
      let agentText = "";
      let agentError = false;
      try {
        agentText = (await this._onUserText(userText)) || "";
      } catch (err) {
        moduleLog?.warn?.("Agent processing failed:", err.message);
        agentText = "";
        agentError = true;
      }

      if (this._cancelled) {
        throw new Error("Pipeline cancelled");
      }

      // Step 3: TTS 播放（如果启用）
      if (merged.autoSpeak && agentText) {
        this._setState(PIPELINE_STATE.SPEAKING);
        this.emit("speaking", agentText);

        try {
          await this._tts.speak(agentText, { lang: merged.lang });
        } catch (err) {
          // TTS 失败不阻塞流水线
          moduleLog?.warn?.("TTS playback failed:", err.message);
          this.emit("ttsError", err);
        }
      }

      // 完成
      const endedAt = Date.now();
      const session = {
        userText,
        agentText,
        agentError,
        startedAt,
        endedAt,
      };
      this._session = session;
      this._setState(PIPELINE_STATE.IDLE);
      this.emit("complete", session);

      return session;
    } catch (err) {
      if (this._cancelled) {
        this._cancelled = false;
        this._setState(PIPELINE_STATE.IDLE);
        this.emit("cancelled");
        throw new Error("Pipeline cancelled");
      }

      this._setState(PIPELINE_STATE.ERROR);
      this.emit("error", err);
      throw err;
    }
  }

  /**
   * 取消当前流水线。
   */
  cancel() {
    this._cancelled = true;
    this._stt.cancel();
    this._tts.stop();

    if (this._state !== PIPELINE_STATE.IDLE) {
      this._setState(PIPELINE_STATE.IDLE);
    }

    // cancelled 事件由 start() 的 catch 块统一发出，避免重复
    // 重置标志，防止状态污染
    setTimeout(() => { this._cancelled = false; }, 0);
  }

  /**
   * 获取当前状态。
   * @returns {'idle'|'listening'|'processing'|'speaking'|'error'}
   */
  getState() {
    return this._state;
  }

  /**
   * 获取当前会话信息。
   * @returns {PipelineSession|null}
   */
  getSession() {
    return this._session ? { ...this._session } : null;
  }

  /**
   * 获取默认选项。
   */
  getOptions() {
    return { ...this._defaultOpts };
  }

  /**
   * 更新选项。
   * @param {Partial<VoicePipelineOptions>} opts
   */
  updateOptions(opts) {
    Object.assign(this._defaultOpts, opts);
  }

  // ── 内部方法 ──

  _setState(state) {
    if (this._state !== state) {
      const prev = this._state;
      this._state = state;
      this.emit("statechange", { state, prev });
    }
  }

  /**
   * 销毁流水线。
   */
  destroy() {
    this.cancel();
    this.removeAllListeners();
    moduleLog?.info?.("VoicePipeline destroyed");
  }
}
