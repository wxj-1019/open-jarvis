/**
 * stt-engine.js — STT 语音转文字引擎
 *
 * 核心状态机管理，不依赖 DOM/Web Speech API。
 * 通过事件接口与渲染进程通信，由 IPC 桥接层转发。
 * 渲染进程使用 webkitSpeechRecognition 实际识别。
 *
 * 架构：
 *   Server(STTEngine) --事件--> IPC Bridge --IPC--> Renderer(webkitSpeechRecognition)
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("stt-engine");

// ── 状态枚举 ──

export const STT_STATE = Object.freeze({
  IDLE: "idle",
  LISTENING: "listening",
  PROCESSING: "processing",
  ERROR: "error",
});

/**
 * @typedef {object} STTListenOptions
 * @property {'zh-CN'|'en-US'|string} [lang] - 识别语言
 * @property {boolean} [continuous] - 是否持续识别 (默认 false，一句话后自动停止)
 * @property {boolean} [interimResults] - 是否返回中间结果 (默认 true)
 * @property {number} [timeout] - 最大监听超时 ms (默认 10000, 0=无限)
 * @property {number} [silenceTimeout] - 静音超时自动停止 ms (默认 3000)
 */

/**
 * @typedef {object} STTResult
 * @property {string} text - 识别文本
 * @property {boolean} isFinal - 是否为最终结果
 * @property {number} [confidence] - 置信度 0-1
 */

export class STTEngine extends EventEmitter {
  /** @param {object} [opts] */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(20);

    /** @type {STTListenOptions} */
    this._defaultOpts = {
      lang: opts.lang ?? "zh-CN",
      continuous: opts.continuous ?? false,
      interimResults: opts.interimResults ?? true,
      timeout: opts.timeout ?? 10000,
      silenceTimeout: opts.silenceTimeout ?? 3000,
    };

    /** @type {'idle'|'listening'|'processing'|'error'} */
    this._state = STT_STATE.IDLE;

    /** @type {STTListenOptions|null} */
    this._currentOpts = null;

    /** @type {STTResult[]} 当前会话累积的最终结果 */
    this._finalResults = [];

    /** @type {ReturnType<typeof setTimeout>|null} */
    this._timeoutTimer = null;

    /** @type {ReturnType<typeof setTimeout>|null} */
    this._silenceTimer = null;

    /** @type {Promise<STTResult[]>|null} */
    this._sessionPromise = null;

    this._resolveSession = null;
    this._rejectSession = null;

    moduleLog?.info?.("STTEngine initialized");
  }

  // ── 公共 API ──

  /**
   * 开始监听，返回 Promise<STTResult[]>。
   * 渲染进程监听 "start" 事件启动 webkitSpeechRecognition，
   * 通过 emitResult/emitEnd/emitError 回传结果。
   *
   * @param {STTListenOptions} [opts]
   * @returns {Promise<STTResult[]>}
   */
  startListening(opts = {}) {
    if (this._state !== STT_STATE.IDLE) {
      return Promise.reject(
        new Error(`Cannot start: STT engine is ${this._state}`)
      );
    }

    const mergedOpts = { ...this._defaultOpts, ...opts };
    this._currentOpts = mergedOpts;
    this._finalResults = [];
    this._setState(STT_STATE.LISTENING);

    // 事件驱动：通知渲染进程启动实际识别
    this.emit("start", mergedOpts);

    // 超时保护
    if (mergedOpts.timeout > 0) {
      this._timeoutTimer = setTimeout(() => {
        this._handleTimeout();
      }, mergedOpts.timeout);
    }

    // 返回 Promise，等待识别完成
    this._sessionPromise = new Promise((resolve, reject) => {
      this._resolveSession = resolve;
      this._rejectSession = reject;
    });

    return this._sessionPromise;
  }

  /**
   * 停止监听。
   */
  stopListening() {
    this.emit("stop");
    this._cleanup();
  }

  /**
   * 取消当前会话。
   */
  cancel() {
    // 先清空 Promise 引用，避免 _cleanup() 重复拒绝
    const reject = this._rejectSession;
    this._rejectSession = null;
    this._resolveSession = null;
    this._sessionPromise = null;

    if (reject) {
      reject(new Error("STT cancelled"));
    }

    this.emit("cancel");
    this._cleanup();
  }

  /**
   * 获取当前状态。
   * @returns {'idle'|'listening'|'processing'|'error'}
   */
  getState() {
    return this._state;
  }

  /**
   * 获取当前会话的累积最终结果。
   * @returns {STTResult[]}
   */
  getFinalResults() {
    return [...this._finalResults];
  }

  // ── 渲染进程回调接口 ──

  /**
   * 渲染进程收到识别结果时调用。
   * @param {STTResult} result
   */
  onResult(result) {
    if (this._state === STT_STATE.LISTENING) {
      this.emit("result", result);

      if (result.isFinal) {
        this._finalResults.push(result);

        // 重置静音计时器
        if (this._currentOpts?.silenceTimeout > 0) {
          this._resetSilenceTimer();
        }

        // continuous=false 时，第一个最终结果就结束
        if (!this._currentOpts?.continuous) {
          this._finishSession();
        }
      }
    }
  }

  /**
   * 渲染进程识别结束时调用。
   */
  onEnd() {
    if (this._state === STT_STATE.LISTENING) {
      this._setState(STT_STATE.PROCESSING);
      this._finishSession();
    }
  }

  /**
   * 渲染进程识别出错时调用。
   * @param {Error|string} error
   */
  onError(error) {
    const err = error instanceof Error ? error : new Error(String(error));
    this._setState(STT_STATE.ERROR);
    try { this.emit("error", err); } catch {}

    if (this._rejectSession) {
      this._rejectSession(err);
      this._rejectSession = null;
      this._resolveSession = null;
      this._sessionPromise = null;
    }
    this._cleanup();
  }

  // ── 内部方法 ──

  _finishSession() {
    if (this._resolveSession) {
      this._resolveSession([...this._finalResults]);
      this._resolveSession = null;
      this._rejectSession = null;
      this._sessionPromise = null;
    }
    this._cleanup();
  }

  _handleTimeout() {
    if (this._state === STT_STATE.LISTENING) {
      moduleLog?.warn?.("STT timeout reached, stopping");
      this._setState(STT_STATE.PROCESSING);
      this.emit("stop");
      this._finishSession();
    }
  }

  _resetSilenceTimer() {
    if (this._silenceTimer) clearTimeout(this._silenceTimer);
    const timeout = this._currentOpts?.silenceTimeout ?? 3000;
    this._silenceTimer = setTimeout(() => {
      if (this._state === STT_STATE.LISTENING) {
        moduleLog?.info?.("STT silence timeout, auto-stopping");
        this._setState(STT_STATE.PROCESSING);
        this.emit("stop");
        this._finishSession();
      }
    }, timeout);
  }

  _cleanup() {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
    this._currentOpts = null;

    if (this._state !== STT_STATE.IDLE) {
      this._setState(STT_STATE.IDLE);
    }

    // 如果有未 resolve 的 Promise，拒绝它以完成清理
    if (this._rejectSession) {
      this._rejectSession(new Error("STT session ended"));
    }
    this._resolveSession = null;
    this._rejectSession = null;
    this._sessionPromise = null;
  }

  _setState(state) {
    if (this._state !== state) {
      const prev = this._state;
      this._state = state;
      this.emit("statechange", { state, prev });
    }
  }

  /**
   * 销毁引擎。
   */
  destroy() {
    this.cancel();
    this.removeAllListeners();
    moduleLog?.info?.("STTEngine destroyed");
  }
}
