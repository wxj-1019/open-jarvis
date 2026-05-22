import { AppError } from '../shared/errors.js';
import { errorBus } from '../shared/error-bus.js';
import { normalizeProviderPayload } from './provider-compat.js';
import { logLlmUsage, normalizeLlmUsage } from '../lib/llm/usage-observer.js';
import { createCircuitBreaker } from '../lib/memory/compile-retry.js';

/**
 * core/llm-client.js — 统一的非流式 LLM 调用入口
 *
 * 直接 HTTP POST（非流式），不走 Pi SDK 的 completeSimple（强制流式）。
 * Pi SDK completeSimple 对 DashScope 等供应商有 20-40x 延迟膨胀（stream SSE 首 token 慢），
 * utility 短文本生成（50-200 token）不需要流式，直接 POST 最快。
 *
 * URL 构造规则与 Pi SDK 内部一致，确保和 Chat 链路（走 Pi SDK stream）访问同一个端点：
 *   - openai-completions:  baseUrl + "/chat/completions"
 *   - anthropic-messages:  baseUrl + "/v1/messages"
 *   - openai-responses:    baseUrl + "/responses"
 *
 * Provider 兼容化：fetch 前统一调 normalizeProviderPayload(body, model, { mode: "utility", ... })，
 * 与 chat 路径（engine.js 的 Pi SDK extension）共享同一个 provider-compat 模块。callText
 * 不从模型能力元数据合成输出预算；需要限制输出长度的具体任务必须显式传 maxTokens。
 *
 * ═══════════════════════════════════════════
 *  v2 增强：指数退避重试 + 熔断器保护
 * ═══════════════════════════════════════════
 *  - 可重试错误（网络/超时/限流/5xx）：最多 3 次，间隔 1s → 2s → 4s + 随机抖动
 *  - 不可重试错误（认证失败/空响应/用户取消）：立即抛出
 *  - 429 限流：解析 Retry-After header 作为最小退避时间
 *  - 熔断器：连续 5 次失败 → 断路 5 分钟 → 半开探测 → 恢复
 */

// ── 熔断器（模块级单例，所有 callText 调用共享） ──

export const llmCircuitBreaker = createCircuitBreaker({
  failureThreshold: 5,
  recoveryTimeoutMs: 5 * 60 * 1000, // 5 分钟恢复窗口
  logger: {
    info: () => {},
    warn: (msg) => {
      errorBus.report(new AppError('LLM_CIRCUIT_OPEN', {
        severity: 'cosmetic',
        message: msg,
      }));
    },
    error: (msg) => {
      errorBus.report(new AppError('LLM_CIRCUIT_OPEN', {
        severity: 'degraded',
        message: msg,
      }));
    },
  },
});

// ── 重试配置 ──

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;    // 首退 1s（比 compile 的 2s 更快，因为对话对延迟更敏感）
const MAX_DELAY_MS = 4000;     // 上限 4s
const JITTER_MS = 500;         // 随机抖动 ±250ms，避免惊群

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _jitter(baseMs) {
  return baseMs + (Math.random() - 0.5) * JITTER_MS * 2;
}

function _parseRetryAfter(headerValue, baseDelay) {
  if (!headerValue) return baseDelay;
  // Retry-After: <http-date> 或 <delay-seconds>
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.max(baseDelay, seconds * 1000);
  }
  const date = Date.parse(headerValue);
  if (!Number.isNaN(date)) {
    const delay = date - Date.now();
    return Math.max(baseDelay, delay);
  }
  return baseDelay;
}

/**
 * 判断错误是否可重试。
 * 网络错误 / 超时 / 限流 / 服务端 5xx → 重试
 * 认证失败 / 空响应 / 用户取消 / 熔断器打开 → 不重试
 */
function _isRetryableError(err) {
  if (err instanceof AppError) {
    const code = err.code;
    if (code === 'LLM_AUTH_FAILED') return false;
    if (code === 'LLM_EMPTY_RESPONSE') return false;
    if (code === 'LLM_CIRCUIT_OPEN') return false;
    if (code === 'LLM_TIMEOUT') return true;
    if (code === 'LLM_RATE_LIMITED') return true;
    if (code === 'LLM_SERVER_ERROR') return true;
    return false;
  }
  // 网络层 TypeError（fetch 在 DNS/连接阶段抛出的非 HTTP 错误）
  if (err instanceof TypeError) return true;
  // JSON 解析失败（可能是服务端返回了非 JSON 5xx 页面）
  if (err.message?.includes('invalid JSON')) return true;
  return false;
}

// ═══════════════════════════════════════════
//  内部辅助
// ═══════════════════════════════════════════

function toDataUrl(block) {
  const mime = block?.mimeType || (block?.type === "video" ? "video/mp4" : "image/png");
  const data = block?.data || "";
  return `data:${mime};base64,${data}`;
}

function normalizeTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

function createUserAbortError() {
  const abortErr = new Error("This operation was aborted");
  abortErr.name = "AbortError";
  abortErr.type = "aborted";
  return abortErr;
}

function stripTaggedThinking(text) {
  const stripped = text
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, "");
  return {
    text: stripped.trim(),
    removedThinking: stripped !== text,
  };
}

function positiveInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function isThinkingBlock(block) {
  if (!block || typeof block !== "object") return false;
  if (block.type === "thinking" || block.type === "redacted_thinking" || block.type === "reasoning") return true;
  if (typeof block.thinking === "string" || typeof block.reasoning_content === "string") return true;
  return false;
}

function extractAnthropicText(content) {
  if (!Array.isArray(content)) return { text: "", removedThinking: false };
  return {
    text: content
      .filter(c => c?.type === "text" && typeof c.text === "string")
      .map(c => c.text)
      .join("\n")
      .trim(),
    removedThinking: content.some(isThinkingBlock),
  };
}

function outputContainsReasoning(output) {
  if (!Array.isArray(output)) return false;
  return output.some((item) => {
    if (isThinkingBlock(item)) return true;
    return Array.isArray(item?.content) && item.content.some(isThinkingBlock);
  });
}

function throwAbortOrTimeout(err, signal, modelId) {
  if (err.name === "AbortError" || err.name === "TimeoutError") {
    if (signal?.aborted) throw createUserAbortError();
    throw new AppError('LLM_TIMEOUT', { context: { model: modelId }, cause: err });
  }
  throw err;
}

function convertContentForApi(content, api) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return typeof content === "undefined" ? "" : JSON.stringify(content);

  if (api === "anthropic-messages") {
    return content.map((block) => {
      if (block?.type === "text") return { type: "text", text: block.text || "" };
      if (block?.type === "image") {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: block.mimeType || "image/png",
            data: block.data || "",
          },
        };
      }
      return { type: "text", text: JSON.stringify(block) };
    });
  }

  if (api === "openai-responses" || api === "openai-codex-responses") {
    return content.map((block) => {
      if (block?.type === "text") return { type: "input_text", text: block.text || "" };
      if (block?.type === "image") return { type: "input_image", image_url: toDataUrl(block) };
      return { type: "input_text", text: JSON.stringify(block) };
    });
  }

  return content.map((block) => {
    if (block?.type === "text") return { type: "text", text: block.text || "" };
    if (block?.type === "image" || block?.type === "video") return { type: "image_url", image_url: { url: toDataUrl(block) } };
    return { type: "text", text: JSON.stringify(block) };
  });
}

// ═══════════════════════════════════════════
//  单次 LLM 请求执行（fetch → 解析 → 提取）
// ═══════════════════════════════════════════

/**
 * 执行一次完整的 LLM HTTP 调用。
 * 可重试部分：fetch + response.text + JSON.parse + 协议提取。
 * 不可重试部分（body 构造、provider 兼容化）在 callText 中完成。
 */
async function _performLlmCall({
  endpoint,
  headers,
  body,
  signal,
  modelId,
  api,
  modelObj,
  returnUsage,
}) {
  const SLOW_THRESHOLD_MS = 15_000;
  const slowTimer = setTimeout(() => {
    errorBus.report(new AppError('LLM_SLOW_RESPONSE', {
      context: { model: modelId, provider: modelObj?.provider, elapsed: SLOW_THRESHOLD_MS },
    }));
  }, SLOW_THRESHOLD_MS);

  // ── 1. fetch ──
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  }).catch(err => {
    clearTimeout(slowTimer);
    throwAbortOrTimeout(err, signal, modelId);
  });

  // ── 2. 读取响应体 ──
  let rawText;
  try {
    rawText = await res.text();
  } catch (err) {
    clearTimeout(slowTimer);
    throwAbortOrTimeout(err, signal, modelId);
  }
  clearTimeout(slowTimer);

  // ── 3. JSON 解析 ──
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(`LLM returned invalid JSON (status=${res.status})`);
  }

  // ── 4. HTTP 状态检查 ──
  if (!res.ok) {
    const message = data?.error?.message || data?.message || rawText || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new AppError('LLM_AUTH_FAILED', { context: { model: modelId, status: res.status } });
    }
    if (res.status === 429) {
      const retryAfter = typeof res.headers?.get === 'function' ? res.headers.get('Retry-After') : null;
      const err = new AppError('LLM_RATE_LIMITED', { context: { model: modelId } });
      err._retryAfterSec = retryAfter;
      throw err;
    }
    if (res.status >= 500) {
      throw new AppError('LLM_SERVER_ERROR', { message, context: { model: modelId, status: res.status } });
    }
    throw new AppError('UNKNOWN', { message, context: { model: modelId, status: res.status } });
  }

  // ── 5. 文本提取 ──
  let text = "";
  let removedStructuredThinking = false;
  if (api === "anthropic-messages") {
    const extracted = extractAnthropicText(data?.content || []);
    text = extracted.text;
    removedStructuredThinking = extracted.removedThinking;
  } else if (api === "openai-responses" || api === "openai-codex-responses") {
    if (typeof data?.output_text === "string") {
      text = data.output_text.trim();
    } else {
      text = (data?.output || [])
        .filter(item => item?.type === "message" && item?.role === "assistant")
        .flatMap(item => (item.content || []).filter(c => typeof c?.text === "string").map(c => c.text.trim()))
        .join("\n").trim();
    }
    removedStructuredThinking = outputContainsReasoning(data?.output);
  } else {
    const message = data?.choices?.[0]?.message;
    text = (typeof message?.content === "string")
      ? message.content.trim()
      : "";
    removedStructuredThinking = typeof message?.reasoning_content === "string"
      || typeof message?.thinking === "string";
  }

  // 清理 <think> 标签
  const rawTextBeforeThinkingStrip = text;
  const thinkingStripped = stripTaggedThinking(text);
  text = thinkingStripped.text;
  const emptyAfterThinking = !text && (
    removedStructuredThinking
    || (thinkingStripped.removedThinking && rawTextBeforeThinkingStrip.trim())
  );

  // ── 6. 空响应检查 ──
  if (!text) {
    if (signal?.aborted) {
      throw createUserAbortError();
    }
    if (signal?.aborted) { // signal 可能是 combinedSignal
      throw new AppError('LLM_TIMEOUT', { context: { model: modelId } });
    }
    throw new AppError('LLM_EMPTY_RESPONSE', {
      message: emptyAfterThinking
        ? "LLM returned only thinking content without visible text"
        : undefined,
      context: {
        model: modelId,
        ...(emptyAfterThinking ? { reason: "empty_after_thinking" } : {}),
      },
    });
  }

  // ── 7. 用量记录 ──
  const usage = normalizeLlmUsage(data?.usage, { costRates: modelObj?.cost });
  logLlmUsage({
    source: "utility",
    api,
    provider: modelObj?.provider,
    modelId,
    usage: data?.usage,
    costRates: modelObj?.cost,
  });

  return returnUsage ? { text, usage } : text;
}

// ═══════════════════════════════════════════
//  主入口：带重试 + 熔断器保护
// ═══════════════════════════════════════════

/**
 * 统一非流式文本生成（带指数退避重试 + 熔断器）。
 *
 * @param {object} opts
 * @param {string} opts.api            API 协议
 * @param {string} opts.apiKey         API key（本地模型可省略）
 * @param {string} opts.baseUrl        Provider base URL
 * @param {string|object} opts.model   模型：完整对象 {id, provider, reasoning, maxTokens, ...}
 *                                     或裸 id 字符串（旧调用方过渡期，会丢失 normalize 决策信息）
 * @param {string[]} [opts.quirks]     Provider quirk flags (e.g. ["enable_thinking"]).
 *                                     **已废弃**：仅在 modelObj.quirks 字段缺失时作 fallback。
 * @param {string} [opts.systemPrompt] System prompt
 * @param {Array}  [opts.messages]     消息数组 [{ role, content }]
 * @param {number} [opts.temperature]  温度。未传时不写入请求体，使用 provider 默认值
 * @param {number} [opts.maxTokens]    最大输出 token。未传时不写 output cap，让具体任务决定预算
 * @param {"user"|"system"|"sdk-default"} [opts.outputBudgetSource] 输出上限来源。仅在 maxTokens 显式传入时生效
 * @param {number} [opts.timeoutMs]    超时毫秒 (default 60000)
 * @param {AbortSignal} [opts.signal]  外部取消信号
 * @param {boolean} [opts.returnUsage] 返回 { text, usage }，默认保持旧接口返回纯文本
 * @returns {Promise<string|{text: string, usage: object|null}>} 生成的文本
 */
export async function callText({
  api,
  apiKey,
  baseUrl,
  model,
  quirks = [],
  systemPrompt = "",
  messages = [],
  temperature,
  maxTokens,
  outputBudgetSource = "system",
  timeoutMs = 60_000,
  signal,
  returnUsage = false,
}) {
  // ── 0. 熔断器检查 ──
  if (!llmCircuitBreaker.allowRequest()) {
    throw new AppError('LLM_CIRCUIT_OPEN', {
      message: 'Circuit breaker is open, rejecting request to prevent cascading failure',
      context: { model: typeof model === 'object' ? model?.id : String(model || '') },
    });
  }

  // ── 1. 模型解析 ──
  const modelObj = typeof model === "object" && model !== null ? model : null;
  const modelId = modelObj ? modelObj.id : String(model || "");
  const provider = modelObj?.provider || "custom";
  const explicitMaxTokens = positiveInteger(maxTokens);

  // ── 2. 消息归一化 ──
  let mergedSystem = systemPrompt || "";
  const normalizedMessages = [];
  for (const m of messages) {
    if (m.role === "system") {
      const text = normalizeTextFromContent(m.content);
      if (text) mergedSystem += (mergedSystem ? "\n" : "") + text;
    } else {
      normalizedMessages.push({
        role: m.role,
        content: convertContentForApi(m.content, api),
      });
    }
  }

  // ── 3. 按协议构造请求（不可重试部分） ──
  const base = (baseUrl || "").replace(/\/+$/, "");
  let endpoint, headers, body;

  if (api === "anthropic-messages") {
    endpoint = `${base}/v1/messages`;
    headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
    if (apiKey) headers["x-api-key"] = apiKey;

    const anthropicMessages = normalizedMessages.filter(m => m.role === "user" || m.role === "assistant");
    if (anthropicMessages.length === 0) anthropicMessages.push({ role: "user", content: "" });
    body = {
      model: modelId,
      ...(explicitMaxTokens !== null && { max_tokens: explicitMaxTokens }),
      ...(temperature !== undefined && { temperature }),
      ...(mergedSystem && { system: mergedSystem }),
      messages: anthropicMessages,
    };
  } else if (api === "openai-responses" || api === "openai-codex-responses") {
    endpoint = `${base}/responses`;
    headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    body = {
      model: modelId,
      ...(explicitMaxTokens !== null && { max_output_tokens: explicitMaxTokens }),
      ...(temperature !== undefined && { temperature }),
      ...(mergedSystem && { instructions: mergedSystem }),
      input: normalizedMessages,
    };
  } else {
    endpoint = `${base}/chat/completions`;
    headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const allMessages = [];
    if (mergedSystem) allMessages.push({ role: "system", content: mergedSystem });
    allMessages.push(...normalizedMessages);
    body = {
      model: modelId,
      ...(explicitMaxTokens !== null && { max_tokens: explicitMaxTokens }),
      ...(temperature !== undefined && { temperature }),
      messages: allMessages,
    };
  }

  if (modelObj?.headers && typeof modelObj.headers === "object") {
    headers = { ...modelObj.headers, ...headers };
  }

  // Provider 兼容化
  const modelForCompat = modelObj
    ? (
      Array.isArray(modelObj.quirks)
        ? { ...modelObj, api: modelObj.api ?? api, baseUrl: modelObj.baseUrl ?? modelObj.base_url ?? baseUrl }
        : { ...modelObj, api: modelObj.api ?? api, baseUrl: modelObj.baseUrl ?? modelObj.base_url ?? baseUrl, quirks }
    )
    : (
      quirks.length > 0 || api === "anthropic-messages" || baseUrl
        ? { id: modelId, provider, api, baseUrl, quirks }
        : null
    );
  body = normalizeProviderPayload(body, modelForCompat, {
    mode: "utility",
    ...(explicitMaxTokens !== null && { outputBudgetSource }),
  });

  // ── 4. 重试循环 ──
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // 每次重试前检查用户是否取消
    if (signal?.aborted) {
      throw createUserAbortError();
    }

    // 每次重试创建新的超时信号（旧的已被消费）
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    try {
      const result = await _performLlmCall({
        endpoint,
        headers,
        body,
        signal: combinedSignal,
        modelId,
        api,
        modelObj,
        returnUsage,
      });

      // 成功 → 熔断器记录成功
      llmCircuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      lastError = err;

      // 用户主动取消 → 立即抛出
      if (signal?.aborted || err?.name === 'AbortError') {
        throw err;
      }

      // 不可重试的错误 → 立即抛出
      if (!_isRetryableError(err)) {
        throw err;
      }

      // 最后一次尝试失败 → 跳出循环
      if (attempt >= MAX_RETRIES) {
        break;
      }

      // 计算退避延迟
      let delay = _jitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      delay = Math.min(delay, MAX_DELAY_MS);

      // 429 限流：解析 Retry-After header
      if (err instanceof AppError && err.code === 'LLM_RATE_LIMITED' && err._retryAfterSec) {
        delay = _parseRetryAfter(err._retryAfterSec, delay);
      }

      await _sleep(delay);
    }
  }

  // ── 5. 所有重试耗尽 → 熔断器记录失败 ──
  llmCircuitBreaker.recordFailure();

  throw lastError || new AppError('UNKNOWN', {
    message: `LLM call failed after ${MAX_RETRIES} attempts`,
    context: { model: modelId },
  });
}
