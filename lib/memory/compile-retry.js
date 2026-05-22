/**
 * compile-retry.js — 编译管线重试管理器（增强版）
 *
 * 提供带指数退避的重试机制，用于 LLM 编译调用：
 * - 最多 3 次尝试
 * - 指数退避：2s → 4s → 8s
 * - 响应质量验证（拒绝空/malformed/占位符/过短响应）
 * - 可选降级到最近成功缓存（< 24 小时）
 * - 熔断器模式（连续失败后断路，防止级联故障）
 * - 降级 prompt 支持（简化 prompt 提高成功率）
 * - 编译状态持久化（跨重启恢复）
 */

import fs from "fs";
import path from "path";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 8000;
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

const CIRCUIT_BREAKER_DEFAULTS = {
  failureThreshold: 5,
  recoveryTimeoutMs: 5 * 60 * 1000,
};

const STATE_EXPIRY_MS = 48 * 60 * 60 * 1000;
const STATE_FILENAME = "compile-state.json";

const PLACEHOLDER_PATTERNS = [
  /^[\s（(]*暂无[记忆内容]*[\s）)]*$/i,
  /^[\s]*\(no\s+memory\s+yet\)[\s]*$/i,
  /^[\s]*none[\s]*$/i,
  /^[\s]*无[\s]*$/i,
];

const defaultLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isResponseValid(response) {
  if (response == null) return false;
  if (typeof response !== "string") return false;
  return response.trim().length > 0;
}

export function validateResponseQuality(response) {
  if (response == null || typeof response !== "string") {
    return { valid: false, reason: "empty" };
  }

  const trimmed = response.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "empty" };
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: "placeholder" };
    }
  }

  const charCount = trimmed.length;
  const cjkCount = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
  const effectiveLength = cjkCount + (charCount - cjkCount) / 5;

  if (effectiveLength < 5) {
    return { valid: false, reason: "too_short" };
  }

  return { valid: true, reason: null };
}

export function createCircuitBreaker(opts = {}) {
  const {
    failureThreshold = CIRCUIT_BREAKER_DEFAULTS.failureThreshold,
    recoveryTimeoutMs = CIRCUIT_BREAKER_DEFAULTS.recoveryTimeoutMs,
    logger = defaultLogger,
  } = opts;

  let state = "closed";
  let failureCount = 0;
  let lastFailureAt = null;
  let lastStateChangeAt = Date.now();

  function getState() {
    if (state === "open" && Date.now() - lastStateChangeAt >= recoveryTimeoutMs) {
      state = "half-open";
      lastStateChangeAt = Date.now();
      logger.info?.("[circuit breaker] transitioned to half-open, probing recovery");
    }
    return state;
  }

  function allowRequest() {
    const currentState = getState();
    if (currentState === "open") {
      logger.warn?.("[circuit breaker] open, rejecting request to prevent cascading failure");
      return false;
    }
    return true;
  }

  function recordSuccess() {
    if (state === "half-open") {
      state = "closed";
      failureCount = 0;
      lastStateChangeAt = Date.now();
      logger.info?.("[circuit breaker] recovered, circuit closed");
    } else {
      failureCount = 0;
    }
  }

  function recordFailure() {
    failureCount += 1;
    lastFailureAt = Date.now();

    if (state === "half-open" || failureCount >= failureThreshold) {
      state = "open";
      lastStateChangeAt = Date.now();
      logger.error?.(`[circuit breaker] tripped open after ${failureCount} consecutive failures`);
    }
  }

  function exportState() {
    return {
      state,
      failureCount,
      lastFailureAt,
      lastStateChangeAt,
    };
  }

  function importState(imported) {
    if (!imported) return;
    state = imported.state || "closed";
    failureCount = imported.failureCount || 0;
    lastFailureAt = imported.lastFailureAt || null;
    lastStateChangeAt = imported.lastStateChangeAt || Date.now();
  }

  function reset() {
    state = "closed";
    failureCount = 0;
    lastFailureAt = null;
    lastStateChangeAt = Date.now();
  }

  return {
    getState,
    allowRequest,
    recordSuccess,
    recordFailure,
    exportState,
    importState,
    reset,
  };
}

export function createCompileStatePersistence(opts = {}) {
  const {
    stateDir,
    logger = defaultLogger,
  } = opts;

  const stateFilePath = path.join(stateDir, STATE_FILENAME);

  async function saveState(state) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      const payload = {
        ...state,
        _savedAt: Date.now(),
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(payload, null, 2), "utf-8");
      logger.info?.("[compile-state] state saved");
    } catch (err) {
      logger.error?.(`[compile-state] failed to save state: ${err.message}`);
    }
  }

  async function loadState() {
    try {
      if (!fs.existsSync(stateFilePath)) return null;

      const raw = fs.readFileSync(stateFilePath, "utf-8");
      const state = JSON.parse(raw);

      const age = Date.now() - (state._savedAt || 0);
      if (age > STATE_EXPIRY_MS) {
        logger.warn?.(`[compile-state] state expired (${Math.round(age / 3600000)}h old), discarding`);
        try { fs.unlinkSync(stateFilePath); } catch {}
        return null;
      }

      const { _savedAt, ...cleanState } = state;
      return cleanState;
    } catch (err) {
      if (err instanceof SyntaxError) {
        logger.warn?.(`[compile-state] corrupted state file, discarding: ${err.message}`);
      } else {
        logger.error?.(`[compile-state] failed to load state: ${err.message}`);
      }
      try { fs.unlinkSync(stateFilePath); } catch {}
      return null;
    }
  }

  async function savePartialResult(stepName, result) {
    const current = await loadState();
    const partialResults = current?.partialResults || {};
    partialResults[stepName] = result;

    await saveState({
      ...current,
      partialResults,
      completedSteps: current?.completedSteps || [],
    });
  }

  async function clearState() {
    try {
      if (fs.existsSync(stateFilePath)) {
        fs.unlinkSync(stateFilePath);
        logger.info?.("[compile-state] state cleared");
      }
    } catch (err) {
      logger.error?.(`[compile-state] failed to clear state: ${err.message}`);
    }
  }

  return {
    saveState,
    loadState,
    savePartialResult,
    clearState,
  };
}

export function createCompileRetryManager(opts = {}) {
  const {
    logger = defaultLogger,
    loadCache = async () => null,
    saveCache = async () => {},
    circuitBreaker = null,
  } = opts;

  async function executeWithRetry(fn, stepName, execOpts = {}) {
    const { degrade = false, fallbackFn = null } = execOpts;

    if (circuitBreaker && !circuitBreaker.allowRequest()) {
      throw new Error(`[circuit breaker open] skipping ${stepName} to prevent cascading failure`);
    }

    let lastError = null;
    let lastInvalidResponse = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fn();

        const quality = validateResponseQuality(response);
        if (!quality.valid) {
          lastInvalidResponse = response;
          logger.warn?.(
            `[${stepName}] attempt ${attempt}: invalid response (${quality.reason}), retrying...`
          );

          if (attempt < MAX_ATTEMPTS) {
            const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempt - 1));
            await sleep(delay);
          }
          continue;
        }

        logger.info?.(`[${stepName}] succeeded on attempt ${attempt}`);

        if (degrade) {
          await saveCache(stepName, response);
        }

        circuitBreaker?.recordSuccess();
        return response;
      } catch (err) {
        lastError = err;
        logger.warn?.(
          `[${stepName}] attempt ${attempt} failed: ${err.message}`
        );

        if (attempt < MAX_ATTEMPTS) {
          const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempt - 1));
          await sleep(delay);
        }
      }
    }

    circuitBreaker?.recordFailure();

    if (fallbackFn) {
      try {
        logger.warn?.(`[${stepName}] all retries exhausted, trying fallback prompt...`);
        const fallbackResult = await fallbackFn();
        const quality = validateResponseQuality(fallbackResult);
        if (quality.valid) {
          logger.info?.(`[${stepName}] fallback prompt succeeded`);
          if (degrade) {
            await saveCache(stepName, fallbackResult);
          }
          circuitBreaker?.recordSuccess();
          return fallbackResult;
        }
        logger.warn?.(`[${stepName}] fallback response invalid (${quality.reason})`);
      } catch (fallbackErr) {
        logger.warn?.(`[${stepName}] fallback also failed: ${fallbackErr.message}`);
      }
    }

    if (degrade) {
      try {
        const cached = await loadCache(stepName);
        if (cached && cached.result && cached.timestamp) {
          const age = Date.now() - cached.timestamp;
          if (age < CACHE_EXPIRY_MS) {
            logger.warn?.(
              `[${stepName}] degraded to cached result (${Math.round(age / 60000)}min old)`
            );
            return cached.result;
          } else {
            logger.warn?.(
              `[${stepName}] cache expired (${Math.round(age / 3600000)}h old), not using`
            );
          }
        }
      } catch (cacheErr) {
        logger.warn?.(`[${stepName}] failed to load cache: ${cacheErr.message}`);
      }
    }

    const errorMsg = lastError
      ? lastError.message
      : `invalid response after ${MAX_ATTEMPTS} attempts`;

    logger.error?.(
      `[${stepName}] failed after ${MAX_ATTEMPTS} attempts: ${errorMsg}`
    );

    throw lastError || new Error(errorMsg);
  }

  return {
    executeWithRetry,
  };
}
