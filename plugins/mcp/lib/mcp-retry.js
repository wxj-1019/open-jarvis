import { McpHttpError } from "./mcp-http-client.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000;
const DEFAULT_MAX_DELAY = 30000;
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422]);
const RETRYABLE_NETWORK_CODES = new Set(["ECONNREFUSED", "ETIMEDOUT"]);

export function isRetryableError(error) {
  if (!error) return false;

  if (error instanceof McpHttpError) {
    const status = error.status;
    if (status && status >= 500) return true;
    if (status && NON_RETRYABLE_STATUSES.has(status)) return false;
    return false;
  }

  if (error.name === "AbortError") return true;
  if (error.code && RETRYABLE_NETWORK_CODES.has(error.code)) return true;

  return false;
}

function calculateDelay(attempt, baseDelay, maxDelay) {
  const exponential = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 0.1 * exponential;
  return exponential + jitter;
}

export async function retryWithBackoff(fn, { maxRetries = DEFAULT_MAX_RETRIES, baseDelay = DEFAULT_BASE_DELAY, maxDelay = DEFAULT_MAX_DELAY, log = null } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = calculateDelay(attempt, baseDelay, maxDelay);
      log?.debug?.(`[mcp:retry] attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
