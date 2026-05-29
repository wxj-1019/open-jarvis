/**
 * voice-conversation-loop.js — 连续对话循环管理器
 *
 * 实现从 VAD 检测到 STT 识别、Agent 处理、TTS 播放的完整对话循环。
 * 状态机: IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
 *
 * 架构:
 *   VADService.speechend → VoiceConversationLoop → STTEngine → Agent → TTSEngine → IDLE
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("voice-conversation-loop");

const DEFAULT_SILENCE_TIMEOUT_MS = 30000;

// ── 状态枚举 ──

export const LOOP_STATE = Object.freeze({
  IDLE: "idle",
  LISTENING: "listening",
  PROCESSING: "processing",
  SPEAKING: "speaking",
  PAUSED: "paused",
});

/**
 * @typedef {object} LoopOptions
 * @property {boolean} [continuous] - 是否持续对话 (默认 true)
 * @property {boolean} [autoSpeak] - 是否自动播放回复 (默认 true)
 * @property {number} [silenceTimeoutMs] - 静音超时自动退出 (默认 30000)
 */

export class VoiceConversationLoop extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('./vad-service.js').VADService} deps.vadService
   * @param {import('./stt-engine.js').STTEngine} deps.sttEngine
   * @param {import('./tts-engine.js').TTSEngine} deps.ttsEngine
   * @param {(userText: string) => Promise<string>} deps.onUserText
   * @param {LoopOptions} [opts]
   */
  constructor(deps, opts = {}) {
    super();

    if (!deps || typeof deps !== "object") {
      throw new Error("VoiceConversationLoop requires a deps object");
    }
    if (!deps.vadService) {
      throw new Error("VoiceConversationLoop requires deps.vadService");
    }
    if (!deps.sttEngine) {
      throw new Error("VoiceConversationLoop requires deps.sttEngine");
    }
    if (!deps.ttsEngine) {
      throw new Error("VoiceConversationLoop requires deps.ttsEngine");
    }
    if (typeof deps.onUserText !== "function") {
      throw new Error("VoiceConversationLoop requires deps.onUserText to be a function");
    }

    this.setMaxListeners(20);

    /** @type {import('./vad-service.js').VADService} */
    this._vad = deps.vadService;

    /** @type {import('./stt-engine.js').STTEngine} */
    this._stt = deps.sttEngine;

    /** @type {import('./tts-engine.js').TTSEngine} */
    this._tts = deps.ttsEngine;

    /** @type {(userText: string) => Promise<string>} */
    this._onUserText = deps.onUserText;

    /** @type {boolean} 是否持续对话 */
    this._continuous = opts.continuous ?? true;

    /** @type {boolean} 是否自动播放回复 */
    this._autoSpeak = opts.autoSpeak ?? true;

    /** @type {number} 静音超时 (ms) */
    this._silenceTimeoutMs = opts.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;

    /** @type {'idle'|'listening'|'processing'|'speaking'|'paused'} */
    this._state = LOOP_STATE.IDLE;

    /** @type {ReturnType<typeof setTimeout>|null} */
    this._silenceTimer = null;

    /** @type {boolean} 是否正在处理中，防止并发 speechend */
    this._processing = false;

    /** @type {boolean} 是否已请求停止，用于优雅取消 */
    this._stopping = false;

    /** @type {Function|null} VAD speechend 回调引用，用于清理 */
    this._onVadSpeechEnd = null;

    moduleLog?.info?.("VoiceConversationLoop initialized");
  }

  // ── 公共 API ──

  /**
   * 启动对话循环。
   */
  async start() {
    if (this._state !== LOOP_STATE.IDLE) {
      return;
    }

    this._setupListeners();
    this._vad.start();
    this._startSilenceTimeout();
    this._setState(LOOP_STATE.IDLE);

    moduleLog?.info?.("VoiceConversationLoop started");
  }

  /**
   * 停止对话循环。
   */
  async stop() {
    this._stopping = true;
    this._clearSilenceTimeout();
    this._vad.stop();
    this._removeListeners();
    this._setState(LOOP_STATE.IDLE);
    this._processing = false;

    moduleLog?.info?.("VoiceConversationLoop stopped");
  }

  /**
   * 暂停对话循环。
   */
  pause() {
    this._clearSilenceTimeout();
    this._vad.stop();
    this._setState(LOOP_STATE.PAUSED);

    moduleLog?.info?.("VoiceConversationLoop paused");
  }

  /**
   * 恢复对话循环。
   */
  resume() {
    if (this._state !== LOOP_STATE.PAUSED) {
      return;
    }

    this._stopping = false;
    this._startSilenceTimeout();
    this._vad.start();
    this._vad.reset();
    this._setState(LOOP_STATE.IDLE);

    moduleLog?.info?.("VoiceConversationLoop resumed");
  }

  /**
   * 获取当前状态。
   * @returns {'idle'|'listening'|'processing'|'speaking'|'paused'}
   */
  getState() {
    return this._state;
  }

  // ── 内部方法 ──

  /**
   * 设置 VAD 事件监听器。
   */
  _setupListeners() {
    this._onVadSpeechEnd = async (audio) => {
      if (this._stopping) {
        moduleLog?.info?.("Ignoring speechend: stopping in progress");
        return;
      }

      if (this._processing) {
        moduleLog?.warn?.("Ignoring speechend: already processing");
        return;
      }

      this._processing = true;
      this._clearSilenceTimeout();
      this._setState(LOOP_STATE.LISTENING);
      this.emit("speechstart");

      try {
        const results = await this._stt.startListening();

        if (this._stopping) {
          moduleLog?.info?.("Cancelled during STT: stopping in progress");
          return;
        }

        const text = results
          .filter((r) => r.isFinal)
          .map((r) => r.text)
          .join(" ")
          .trim();

        if (!text) {
          moduleLog?.info?.("Empty recognition result");
          this._vad.reset();
          this._startSilenceTimeout();
          this._setState(LOOP_STATE.IDLE);
          return;
        }

        if (this._stopping) {
          moduleLog?.info?.("Cancelled after text extraction: stopping in progress");
          return;
        }

        this._setState(LOOP_STATE.PROCESSING);
        this.emit("recognized", text);

        const response = await this._onUserText(text);

        if (this._stopping) {
          moduleLog?.info?.("Cancelled during Agent processing: stopping in progress");
          return;
        }

        this.emit("aiText", response);

        if (this._autoSpeak && response) {
          this._setState(LOOP_STATE.SPEAKING);
          this.emit("speaking");
          await this._tts.speak(response);
        }

        if (this._stopping) {
          moduleLog?.info?.("Cancelled during TTS playback: stopping in progress");
          return;
        }

        if (this._continuous) {
          this._vad.reset();
          this._startSilenceTimeout();
          this._setState(LOOP_STATE.IDLE);
          this.emit("complete");
        } else {
          await this.stop();
        }
      } catch (err) {
        moduleLog?.error?.("Error in conversation loop:", err);
        this.emit("error", err);

        if (this._continuous && !this._stopping) {
          this._vad.reset();
          this._startSilenceTimeout();
          this._setState(LOOP_STATE.IDLE);
        }
      } finally {
        this._processing = false;
      }
    };

    this._vad.on("speechend", this._onVadSpeechEnd);
  }

  /**
   * 移除 VAD 事件监听器。
   */
  _removeListeners() {
    if (this._onVadSpeechEnd) {
      this._vad.removeListener("speechend", this._onVadSpeechEnd);
      this._onVadSpeechEnd = null;
    }
  }

  /**
   * 启动静音超时定时器。
   */
  _startSilenceTimeout() {
    this._clearSilenceTimeout();
    this._silenceTimer = setTimeout(() => {
      this.emit("timeout");
      if (this._continuous) {
        this.stop();
      }
    }, this._silenceTimeoutMs);
  }

  /**
   * 清除静音超时定时器。
   */
  _clearSilenceTimeout() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  /**
   * 设置状态并触发事件。
   * @param {'idle'|'listening'|'processing'|'speaking'|'paused'} newState
   */
  _setState(newState) {
    if (this._state !== newState) {
      this._state = newState;
      this.emit("statechange", newState);
    }
  }
}
