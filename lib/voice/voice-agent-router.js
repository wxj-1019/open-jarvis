/**
 * VoiceAgentRouter — 语音对话的 Agent 路由层
 *
 * 职责：
 *   1. 接收 VoiceConversationLoop 的 onUserText 回调文本
 *   2. 路由到 hub.send()，使用 engine.focusSessionPath 或创建临时 session
 *   3. 通过 session.subscribe() 捕获 Agent 的 delta 流式响应
 *   4. 返回完整响应文本供 VoiceConversationLoop 进行 TTS 播放
 *   5. 支持 AbortController 取消
 *   6. 处理错误：session 不可用、hub 未就绪、流式冲突等
 *
 * 架构：
 *   VoiceConversationLoop.onUserText → VoiceAgentRouter.route() → hub.send() → session.subscribe() → 返回文本
 *
 * 参考模式：
 *   - core/desktop-session-submit.js：session.subscribe() 订阅 delta + tool 媒体
 *   - hub/index.js：hub.send() 统一消息入口 + onDelta 回调
 */

import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("voice-agent-router");

/**
 * @typedef {object} VoiceAgentRouterDeps
 * @property {object} engine - HanaEngine 实例
 * @property {import('../../hub/index.js').Hub} hub - Hub 实例
 */

/**
 * @typedef {object} RouteOptions
 * @property {AbortController} [abortController] - 可选的取消控制器
 * @property {(delta: string, accumulated: string) => void} [onDelta] - 可选的流式 delta 回调
 * @property {string} [sessionPath] - 可选的指定 session 路径，默认使用 engine.focusSessionPath
 */

export class VoiceAgentRouter {
  /**
   * @param {VoiceAgentRouterDeps} deps
   */
  constructor(deps) {
    if (!deps || typeof deps !== "object") {
      throw new Error("VoiceAgentRouter requires a deps object");
    }
    if (!deps.engine) {
      throw new Error("VoiceAgentRouter requires deps.engine");
    }
    if (!deps.hub) {
      throw new Error("VoiceAgentRouter requires deps.hub");
    }

    /** @type {object} HanaEngine 实例 */
    this._engine = deps.engine;

    /** @type {import('../../hub/index.js').Hub} Hub 实例 */
    this._hub = deps.hub;

    /** @type {Map<string, AbortController>} 活跃的请求取消控制器 */
    this._activeRequests = new Map();

    /** @type {number} 请求计数器，用于生成唯一 ID */
    this._requestCounter = 0;

    log?.info?.("VoiceAgentRouter initialized");
  }

  /**
   * 路由用户文本到 Agent，返回完整响应。
   *
   * @param {string} userText - 用户输入的文本
   * @param {RouteOptions} [opts] - 可选配置
   * @returns {Promise<string>} Agent 的完整响应文本
   * @throws {Error} 当 session 不可用、hub 未就绪或请求被取消时
   */
  async route(userText, opts = {}) {
    const requestId = this._nextRequestId();
    const { abortController, onDelta } = opts;

    if (!userText || typeof userText !== "string" || !userText.trim()) {
      throw new Error("VoiceAgentRouter: userText is required");
    }

    this._validateEngine();
    this._validateHub();

    const sessionPath = opts.sessionPath || this._resolveSessionPath();
    if (!sessionPath) {
      throw new Error("VoiceAgentRouter: no active session available");
    }

    if (this._engine.isSessionStreaming?.(sessionPath)) {
      throw new Error("VoiceAgentRouter: session is currently streaming");
    }

    if (abortController?.signal.aborted) {
      throw this._createAbortError("pre-flight");
    }

    this._activeRequests.set(requestId, abortController || new AbortController());
    const effectiveController = this._activeRequests.get(requestId);

    if (abortController && abortController !== effectiveController) {
      abortController.signal.addEventListener("abort", () => {
        effectiveController.abort();
      });
    }

    try {
      return await this._executeRoute(sessionPath, userText, {
        requestId,
        abortController: effectiveController,
        onDelta,
      });
    } finally {
      this._activeRequests.delete(requestId);
    }
  }

  /**
   * 取消指定 requestId 的请求。
   * @param {string} requestId
   */
  cancel(requestId) {
    const controller = this._activeRequests.get(requestId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
      log?.info?.(`Request ${requestId} cancelled`);
    }
  }

  /**
   * 取消所有活跃请求。
   */
  cancelAll() {
    for (const [id, controller] of this._activeRequests) {
      if (!controller.signal.aborted) {
        controller.abort();
        log?.info?.(`Request ${id} cancelled (cancelAll)`);
      }
    }
  }

  /**
   * 获取活跃请求数量。
   * @returns {number}
   */
  get activeRequestCount() {
    return this._activeRequests.size;
  }

  // ── 内部方法 ──

  /**
   * @returns {string}
   */
  _nextRequestId() {
    return `voice-${++this._requestCounter}`;
  }

  /**
   * @returns {string|null} 可用的 session 路径
   */
  _resolveSessionPath() {
    const focusPath = this._engine.focusSessionPath;
    if (focusPath && typeof focusPath === "string" && focusPath.trim()) {
      return focusPath;
    }

    const currentPath = this._engine.currentSessionPath;
    if (currentPath && typeof currentPath === "string" && currentPath.trim()) {
      return currentPath;
    }

    return null;
  }

  _validateEngine() {
    if (typeof this._engine.ensureSessionLoaded !== "function") {
      throw new Error("VoiceAgentRouter: engine.ensureSessionLoaded unavailable");
    }
    if (typeof this._engine.promptSession !== "function") {
      throw new Error("VoiceAgentRouter: engine.promptSession unavailable");
    }
  }

  _validateHub() {
    if (typeof this._hub.send !== "function") {
      throw new Error("VoiceAgentRouter: hub.send unavailable");
    }
    if (typeof this._hub.subscribe !== "function") {
      throw new Error("VoiceAgentRouter: hub.subscribe unavailable");
    }
  }

  /**
   * 执行路由：加载 session、订阅 delta、发送消息、返回响应。
   *
   * @param {string} sessionPath
   * @param {string} userText
   * @param {object} opts
   * @param {string} opts.requestId
   * @param {AbortController} opts.abortController
   * @param {(delta: string, accumulated: string) => void} [opts.onDelta]
   * @returns {Promise<string>}
   */
  async _executeRoute(sessionPath, userText, opts) {
    const { requestId, abortController, onDelta } = opts;

    const session = await this._engine.ensureSessionLoaded(sessionPath);
    if (!session) {
      throw new Error(`VoiceAgentRouter: failed to load session ${sessionPath}`);
    }

    let captured = "";
    const toolMedia = [];

    const unsubHub = this._hub.subscribe((event, eventSessionPath) => {
      if (eventSessionPath !== sessionPath) return;

      if (event.type === "message_update") {
        const sub = event.assistantMessageEvent;
        if (sub?.type === "text_delta") {
          const delta = sub.delta || "";
          captured += delta;
          try { onDelta?.(delta, captured); } catch {}
        }
      } else if (event.type === "tool_execution_end" && !event.isError) {
        const details = event.result?.details;
        if (details?.media) {
          const mediaItems = collectMediaFromDetails(details.media);
          toolMedia.push(...mediaItems);
        }
        const card = details?.card;
        if (card?.description) {
          captured += (captured ? "\n\n" : "") + card.description;
        }
      }
    });

    const unsubSession = session.subscribe?.((event) => {
      if (event.type === "message_update") {
        const sub = event.assistantMessageEvent;
        if (sub?.type === "text_delta") {
          const delta = sub.delta || "";
          captured += delta;
          try { onDelta?.(delta, captured); } catch {}
        }
      } else if (event.type === "tool_execution_end" && !event.isError) {
        const details = event.result?.details;
        if (details?.media) {
          const mediaItems = collectMediaFromDetails(details.media);
          toolMedia.push(...mediaItems);
        }
        const card = details?.card;
        if (card?.description) {
          captured += (captured ? "\n\n" : "") + card.description;
        }
      }
    });

    try {
      await this._hub.send(userText, {
        sessionPath,
        onDelta,
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        throw this._createAbortError(requestId);
      }
      throw err;
    } finally {
      try { unsubHub?.(); } catch {}
      try { unsubSession?.(); } catch {}
    }

    if (abortController.signal.aborted) {
      throw this._createAbortError(requestId);
    }

    const result = captured.trim() || null;
    log?.info?.(`Request ${requestId} completed: ${result?.length || 0} chars, ${toolMedia.length} media`);
    return result;
  }

  /**
   * @param {string} context
   * @returns {Error}
   */
  _createAbortError(context) {
    const err = new Error(`VoiceAgentRouter: request aborted (${context})`);
    err.name = "AbortError";
    return err;
  }
}

/**
 * 从 tool result details.media 中提取文本描述。
 * @param {Array} mediaItems
 * @returns {string[]}
 */
function collectMediaFromDetails(mediaItems) {
  if (!Array.isArray(mediaItems)) return [];
  const texts = [];
  for (const item of mediaItems) {
    if (item?.url) texts.push(item.url);
    if (item?.description) texts.push(item.description);
  }
  return texts;
}
