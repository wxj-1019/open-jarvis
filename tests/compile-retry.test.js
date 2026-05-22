/**
 * compile-retry.test.js — 编译管线重试与降级测试
 *
 * 覆盖场景：
 * - 瞬时失败时自动重试（最多 3 次）
 * - 响应验证（空值/malformed 拒绝）
 * - 超过最大重试次数后抛出
 * - 指数退避时序验证（2s → 4s → 8s）
 * - 降级到上一次成功结果
 * - 缓存结果超过 24 小时不降级
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCompileRetryManager, isResponseValid } from "../lib/memory/compile-retry.js";

describe("isResponseValid", () => {
  it("rejects null and undefined", () => {
    expect(isResponseValid(null)).toBe(false);
    expect(isResponseValid(undefined)).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isResponseValid("")).toBe(false);
    expect(isResponseValid("   ")).toBe(false);
    expect(isResponseValid("\n\t  \n")).toBe(false);
  });

  it("rejects non-string types", () => {
    expect(isResponseValid(0)).toBe(false);
    expect(isResponseValid(123)).toBe(false);
    expect(isResponseValid({})).toBe(false);
    expect(isResponseValid([])).toBe(false);
    expect(isResponseValid(false)).toBe(false);
  });

  it("accepts valid non-empty strings", () => {
    expect(isResponseValid("hello")).toBe(true);
    expect(isResponseValid("  some content  ")).toBe(true);
    expect(isResponseValid("- item 1\n- item 2")).toBe(true);
  });
});

describe("createCompileRetryManager", () => {
  let retryManager;
  let mockLogger;
  let mockCacheLoader;
  let mockCacheSaver;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    mockCacheLoader = vi.fn();
    mockCacheSaver = vi.fn();
    retryManager = createCompileRetryManager({
      logger: mockLogger,
      loadCache: mockCacheLoader,
      saveCache: mockCacheSaver,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("succeeds on first attempt without retry", async () => {
    const fn = vi.fn().mockResolvedValue("success result");

    const resultPromise = retryManager.executeWithRetry(fn, "compileToday");

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success result");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("compileToday"),
      expect.stringContaining("success")
    );
  });

  it("retries on transient failure and succeeds on second attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("LLM API timeout"))
      .mockResolvedValue("recovered result");

    const resultPromise = retryManager.executeWithRetry(fn, "compileWeek");

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("recovered result");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("compileWeek"),
      expect.stringContaining("attempt 1")
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("compileWeek"),
      expect.stringContaining("recovered")
    );
  });

  it("retries up to max attempts (3) then throws", async () => {
    const error = new Error("Persistent API failure");
    const fn = vi.fn().mockRejectedValue(error);

    const resultPromise = retryManager.executeWithRetry(fn, "compileLongterm");

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow("Persistent API failure");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("compileLongterm"),
      expect.stringContaining("failed after 3 attempts")
    );
  });

  it("uses exponential backoff: 2s → 4s → 8s", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("timeout"));
    const sleepSpy = vi.spyOn(global, "setTimeout");

    retryManager.executeWithRetry(fn, "compileFacts").catch(() => {});

    await vi.runAllTimersAsync();

    const delays = sleepSpy.mock.calls.map(call => call[1]);
    expect(delays[0]).toBe(2000);
    expect(delays[1]).toBe(4000);
  });

  it("rejects empty response and retries", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce("")
      .mockResolvedValue("valid result");

    const resultPromise = retryManager.executeWithRetry(fn, "compileToday");

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("valid result");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("compileToday"),
      expect.stringContaining("invalid response")
    );
  });

  it("rejects whitespace-only response and retries", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce("   \n  \t  ")
      .mockResolvedValue("valid result");

    const resultPromise = retryManager.executeWithRetry(fn, "compileToday");

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("valid result");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries if all responses are invalid", async () => {
    const fn = vi.fn().mockResolvedValue("");

    const resultPromise = retryManager.executeWithRetry(fn, "compileWeek");

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow("invalid response");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  describe("degradation to last successful result", () => {
    it("falls back to cached result when retry exhausted", async () => {
      const cachedResult = "cached: yesterday's compilation";
      mockCacheLoader.mockResolvedValue({
        result: cachedResult,
        timestamp: Date.now() - 3600_000,
      });

      const fn = vi.fn().mockRejectedValue(new Error("API down"));

      const resultPromise = retryManager.executeWithRetry(fn, "compileToday", { degrade: true });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe(cachedResult);
      expect(mockCacheLoader).toHaveBeenCalledWith("compileToday");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("compileToday"),
        expect.stringContaining("degraded")
      );
    });

    it("does not degrade if cache is older than 24 hours", async () => {
      mockCacheLoader.mockResolvedValue({
        result: "old cache",
        timestamp: Date.now() - 25 * 3600_000,
      });

      const fn = vi.fn().mockRejectedValue(new Error("API down"));

      const resultPromise = retryManager.executeWithRetry(fn, "compileWeek", { degrade: true });

      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow("API down");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("compileWeek"),
        expect.stringContaining("cache expired")
      );
    });

    it("does not degrade if no cache exists", async () => {
      mockCacheLoader.mockResolvedValue(null);

      const fn = vi.fn().mockRejectedValue(new Error("API down"));

      const resultPromise = retryManager.executeWithRetry(fn, "compileLongterm", { degrade: true });

      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow("API down");
    });

    it("saves successful result to cache", async () => {
      const fn = vi.fn().mockResolvedValue("fresh result");

      const resultPromise = retryManager.executeWithRetry(fn, "compileFacts", { degrade: true });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockCacheSaver).toHaveBeenCalledWith("compileFacts", "fresh result");
    });

    it("does not save to cache when degrade is false", async () => {
      const fn = vi.fn().mockResolvedValue("fresh result");

      const resultPromise = retryManager.executeWithRetry(fn, "compileToday", { degrade: false });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockCacheSaver).not.toHaveBeenCalled();
    });

    it("does not degrade when degrade option is false", async () => {
      mockCacheLoader.mockResolvedValue({
        result: "cached result",
        timestamp: Date.now() - 3600_000,
      });

      const fn = vi.fn().mockRejectedValue(new Error("API down"));

      const resultPromise = retryManager.executeWithRetry(fn, "compileWeek", { degrade: false });

      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow("API down");
    });
  });

  it("logs retry attempts at warn level", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"))
      .mockResolvedValue("success");

    const resultPromise = retryManager.executeWithRetry(fn, "compileToday");

    await vi.runAllTimersAsync();
    await resultPromise;

    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn.mock.calls[0][0]).toContain("compileToday");
    expect(mockLogger.warn.mock.calls[0][0]).toContain("attempt 1");
    expect(mockLogger.warn.mock.calls[1][0]).toContain("compileToday");
    expect(mockLogger.warn.mock.calls[1][0]).toContain("attempt 2");
  });

  it("includes stepName in all log messages", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await retryManager.executeWithRetry(fn, "compileWeek");

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("compileWeek"),
      expect.any(String)
    );
  });
});
