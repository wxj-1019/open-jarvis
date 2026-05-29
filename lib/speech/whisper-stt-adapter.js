/**
 * whisper-stt-adapter.js — Whisper STT 适配器
 *
 * 将渲染进程传入的音频 Blob 转发至服务端 POST /api/voice/transcribe 端点，
 * 返回结构化识别结果 { text, confidence, language }。
 *
 * 职责：
 *   - API Key 获取：优先 provider-registry，回退环境变量
 *   - 重试机制：最多 2 次尝试，带指数退避
 *   - 超时控制：30 秒硬超时
 *   - 错误处理：分类错误并返回可读消息
 *
 * 架构：
 *   Renderer(Audio Blob) --IPC--> WhisperSTTAdapter --HTTP--> Server /api/voice/transcribe
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("whisper-stt-adapter");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

export const WHISPER_STT_STATE = Object.freeze({
  IDLE: "idle",
  TRANSCRIBING: "transcribing",
  ERROR: "error",
});

/**
 * @typedef {object} TranscribeResult
 * @property {string} text - 识别文本
 * @property {number|null} confidence - 置信度 0-1
 * @property {string} language - 检测语言代码
 */

/**
 * @typedef {object} WhisperSTTAdapterOptions
 * @property {string} [serverUrl] - 服务端基础 URL
 * @property {object} [providerRegistry] - ProviderRegistry 实例
 * @property {number} [timeoutMs] - 请求超时 ms
 * @property {string} [lang] - 识别语言
 */

export class WhisperSTTAdapter extends EventEmitter {
  /**
   * @param {WhisperSTTAdapterOptions} [opts]
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(10);

    this._serverUrl = opts.serverUrl || "";
    this._providerRegistry = opts.providerRegistry || null;
    this._timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this._lang = opts.lang || "zh";
    this._state = WHISPER_STT_STATE.IDLE;
    this._abortController = null;

    moduleLog?.info?.("WhisperSTTAdapter initialized");
  }

  // ── 公共 API ──

  /**
   * 转录音频 Blob，返回 Promise<TranscribeResult>。
   *
   * @param {Blob} audioBlob - 音频数据
   * @param {object} [opts] - 单次覆盖选项
   * @param {string} [opts.lang] - 语言代码
   * @returns {Promise<TranscribeResult>}
   */
  async transcribe(audioBlob, opts = {}) {
    if (!(audioBlob instanceof Blob)) {
      throw new Error("Invalid audio: expected Blob");
    }

    if (audioBlob.size === 0) {
      throw new Error("Empty audio blob");
    }

    this._setState(WHISPER_STT_STATE.TRANSCRIBING);

    const lang = opts.lang || this._lang;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this._doTranscribe(audioBlob, lang, attempt);
        this._setState(WHISPER_STT_STATE.IDLE);
        return result;
      } catch (err) {
        lastError = err;
        moduleLog?.warn?.(`Attempt ${attempt} failed: ${err.message}`);

        if (attempt < MAX_RETRIES && this._isRetryable(err)) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          moduleLog?.info?.(`Retrying in ${delay}ms...`);
          await this._sleep(delay);
        }
      }
    }

    this._setState(WHISPER_STT_STATE.ERROR);
    throw lastError || new Error("Transcription failed after retries");
  }

  /**
   * 取消当前转录请求。
   */
  cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._setState(WHISPER_STT_STATE.IDLE);
    moduleLog?.info?.("Transcription cancelled");
  }

  /**
   * 获取当前状态。
   * @returns {'idle'|'transcribing'|'error'}
   */
  getState() {
    return this._state;
  }

  /**
   * 更新语言设置。
   * @param {string} lang - 语言代码
   */
  setLanguage(lang) {
    this._lang = lang;
    moduleLog?.info?.(`Language set to: ${lang}`);
  }

  /**
   * 销毁适配器。
   */
  destroy() {
    this.cancel();
    this.removeAllListeners();
    moduleLog?.info?.("WhisperSTTAdapter destroyed");
  }

  // ── 内部方法 ──

  /**
   * 执行单次转录请求。
   *
   * @param {Blob} audioBlob
   * @param {string} lang
   * @param {number} attempt
   * @returns {Promise<TranscribeResult>}
   */
  async _doTranscribe(audioBlob, lang, attempt) {
    const apiKey = await this._getApiKey();
    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Please add credentials in settings.");
    }

    const baseUrl = this._getBaseUrl();
    const url = `${this._serverUrl}/api/voice/transcribe`;

    this._abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this._abortController.abort();
    }, this._timeoutMs);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");
      formData.append("lang", lang);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: this._abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        this._handleHttpError(response.status, errorText);
      }

      const data = await response.json();
      return {
        text: data.text || "",
        confidence: data.confidence ?? null,
        language: data.language || lang,
      };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("Transcription timeout (30s exceeded)");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      this._abortController = null;
    }
  }

  /**
   * 获取 API Key。
   * 优先从 provider-registry 读取，回退环境变量。
   *
   * @returns {Promise<string|null>}
   */
  async _getApiKey() {
    if (this._providerRegistry) {
      try {
        const creds = this._providerRegistry.getCredentials?.("openai");
        if (creds?.apiKey) {
          return creds.apiKey;
        }
      } catch (err) {
        moduleLog?.warn?.("Failed to get API key from provider-registry:", err.message);
      }
    }

    return process.env.OPENAI_API_KEY || null;
  }

  /**
   * 获取 Whisper API 基础 URL。
   *
   * @returns {string}
   */
  _getBaseUrl() {
    if (this._providerRegistry) {
      try {
        const config = this._providerRegistry.getConfig?.();
        if (config?.voice?.whisperBaseUrl) {
          return config.voice.whisperBaseUrl;
        }
      } catch {}
    }
    return "https://api.openai.com/v1";
  }

  /**
   * 判断错误是否可重试。
   *
   * @param {Error} err
   * @returns {boolean}
   */
  _isRetryable(err) {
    if (err.message.includes("timeout")) return true;
    if (err.message.includes("429") || err.message.includes("Rate limit")) return true;
    if (err.message.includes("500") || err.message.includes("502") || err.message.includes("503")) return true;
    if (err.name === "AbortError") return true;
    return false;
  }

  /**
   * 处理 HTTP 错误响应。
   *
   * @param {number} status
   * @param {string} errorText
   */
  _handleHttpError(status, errorText) {
    if (status === 401 || errorText.includes("Unauthorized")) {
      throw new Error("Invalid OpenAI API key");
    }
    if (status === 429 || errorText.includes("Rate limit")) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    if (status >= 500) {
      throw new Error(`Server error (${status}): ${errorText || "Unknown server error"}`);
    }
    throw new Error(`Transcription failed (${status}): ${errorText || "Unknown error"}`);
  }

  /**
   * 延迟工具函数。
   *
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 设置状态并触发事件。
   *
   * @param {'idle'|'transcribing'|'error'} state
   */
  _setState(state) {
    if (this._state !== state) {
      const prev = this._state;
      this._state = state;
      this.emit("statechange", { state, prev });
    }
  }
}
