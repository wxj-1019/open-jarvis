import { describe, it, expect, vi, beforeEach } from "vitest";
import { isRetryableError, retryWithBackoff } from "../plugins/mcp/lib/mcp-retry.js";
import { McpHttpError } from "../plugins/mcp/lib/mcp-http-client.js";

describe("isRetryableError", () => {
  it("returns true for ECONNREFUSED network error", () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:3000");
    error.code = "ECONNREFUSED";
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for ETIMEDOUT network error", () => {
    const error = new Error("connect ETIMEDOUT 127.0.0.1:3000");
    error.code = "ETIMEDOUT";
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for AbortError", () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for 500 server error", () => {
    const error = new McpHttpError("Internal Server Error", { status: 500 });
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for 502 server error", () => {
    const error = new McpHttpError("Bad Gateway", { status: 502 });
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for 503 server error", () => {
    const error = new McpHttpError("Service Unavailable", { status: 503 });
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for 504 server error", () => {
    const error = new McpHttpError("Gateway Timeout", { status: 504 });
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns false for 400 client error", () => {
    const error = new McpHttpError("Bad Request", { status: 400 });
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for 401 client error", () => {
    const error = new McpHttpError("Unauthorized", { status: 401 });
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for 403 client error", () => {
    const error = new McpHttpError("Forbidden", { status: 403 });
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for 404 client error", () => {
    const error = new McpHttpError("Not Found", { status: 404 });
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for 422 client error", () => {
    const error = new McpHttpError("Unprocessable Entity", { status: 422 });
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for 200 success status", () => {
    const error = new McpHttpError("OK", { status: 200 });
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for generic error without retryable code", () => {
    const error = new Error("Something went wrong");
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isRetryableError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  let mockLog;

  beforeEach(() => {
    mockLog = {
      debug: vi.fn(),
    };
  });

  it("succeeds on first attempt without retry", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await retryWithBackoff(fn, { log: mockLog });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on network error and succeeds", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    const result = await retryWithBackoff(fn, { log: mockLog, baseDelay: 10 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 error and succeeds", async () => {
    const serverError = new McpHttpError("Internal Server Error", { status: 500 });

    const fn = vi.fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue("success");

    const result = await retryWithBackoff(fn, { log: mockLog, baseDelay: 10 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 error", async () => {
    const clientError = new McpHttpError("Bad Request", { status: 400 });

    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(retryWithBackoff(fn, { log: mockLog })).rejects.toThrow("Bad Request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401 error", async () => {
    const clientError = new McpHttpError("Unauthorized", { status: 401 });

    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(retryWithBackoff(fn, { log: mockLog })).rejects.toThrow("Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404 error", async () => {
    const clientError = new McpHttpError("Not Found", { status: 404 });

    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(retryWithBackoff(fn, { log: mockLog })).rejects.toThrow("Not Found");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exceeded", async () => {
    const networkError = new Error("connect ETIMEDOUT");
    networkError.code = "ETIMEDOUT";

    const fn = vi.fn().mockRejectedValue(networkError);

    await expect(
      retryWithBackoff(fn, { log: mockLog, maxRetries: 3, baseDelay: 10 })
    ).rejects.toThrow("connect ETIMEDOUT");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("uses exponential backoff timing", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    const delays = [];
    Math.random = () => 0;

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) => {
      delays.push(delay);
      callback();
      return 0;
    });

    const result = await retryWithBackoff(fn, {
      log: mockLog,
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays[0]).toBeCloseTo(1000, -1);
    expect(delays[1]).toBeCloseTo(2000, -1);

    setTimeoutSpy.mockRestore();
    Math.random = () => Math.random();
  });

  it("respects maxDelay cap", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    const delays = [];
    Math.random = () => 0;

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) => {
      delays.push(delay);
      callback();
      return 0;
    });

    const result = await retryWithBackoff(fn, {
      log: mockLog,
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 2000,
    });

    expect(result).toBe("success");

    delays.forEach(delay => {
      expect(delay).toBeLessThanOrEqual(2000);
    });

    setTimeoutSpy.mockRestore();
    Math.random = () => Math.random();
  });

  it("adds jitter to prevent retry storms", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    const delays = [];
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    const baseDelay = 1000;
    const expectedDelay = baseDelay + (0.5 * 0.1 * baseDelay);

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) => {
      delays.push(delay);
      callback();
      return 0;
    });

    const result = await retryWithBackoff(fn, {
      log: mockLog,
      baseDelay: 1000,
    });

    expect(result).toBe("success");
    expect(delays.length).toBe(1);
    expect(delays[0]).toBeCloseTo(expectedDelay, 0);

    Math.random = originalRandom;
    setTimeoutSpy.mockRestore();
  });

  it("logs retry attempts at debug level", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    Math.random = () => 0;

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) => {
      callback();
      return 0;
    });

    await retryWithBackoff(fn, {
      log: mockLog,
      maxRetries: 3,
      baseDelay: 100,
    });

    expect(mockLog.debug).toHaveBeenCalledTimes(2);
    expect(mockLog.debug.mock.calls[0][0]).toMatch(/\[mcp:retry\] attempt 1\/3 failed, retrying in \d+ms/);
    expect(mockLog.debug.mock.calls[1][0]).toMatch(/\[mcp:retry\] attempt 2\/3 failed, retrying in \d+ms/);

    setTimeoutSpy.mockRestore();
  });

  it("accepts custom parameters", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) => {
      callback();
      return 0;
    });

    const result = await retryWithBackoff(fn, {
      log: mockLog,
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 5000,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);

    setTimeoutSpy.mockRestore();
  });

  it("works without log instance", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    const result = await retryWithBackoff(fn, { baseDelay: 10 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on AbortError", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    const fn = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValue("success");

    const result = await retryWithBackoff(fn, { log: mockLog, baseDelay: 10 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable error after successful retries", async () => {
    const networkError = new Error("connect ECONNREFUSED");
    networkError.code = "ECONNREFUSED";
    const clientError = new McpHttpError("Bad Request", { status: 400 });

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValue(clientError);

    await expect(
      retryWithBackoff(fn, { log: mockLog, maxRetries: 3, baseDelay: 10 })
    ).rejects.toThrow("Bad Request");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
