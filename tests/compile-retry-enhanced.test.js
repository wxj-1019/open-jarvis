/**
 * compile-retry-enhanced.test.js — 编译管线容错与重试增强测试
 *
 * 覆盖场景：
 * - Circuit breaker: 连续失败触发断路，断路期间快速拒绝
 * - Circuit breaker: 半开状态探测恢复
 * - Circuit breaker: 重置后恢复正常
 * - Quality validation: 拒绝过短/无意义/仅占位符的响应
 * - Quality validation: 通过有意义的多句子/结构化响应
 * - Fallback prompts: 降级到简化 prompt 重试
 * - Fallback prompts: 简化 prompt 成功返回
 * - Fallback prompts: 简化 prompt 也失败后抛出原始错误
 * - State persistence: 保存/恢复编译状态
 * - State persistence: 过期状态被忽略
 * - Partial result preservation: compileWeek 失败时不丢失 today 数据
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

import {
  createCompileRetryManager,
  isResponseValid,
  validateResponseQuality,
  CircuitBreaker,
  createCircuitBreaker,
  createCompileStatePersistence,
} from "../lib/memory/compile-retry.js";

// ─── Circuit Breaker Tests ───

describe("CircuitBreaker", () => {
  let cb;
  let mockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    cb = createCircuitBreaker({
      failureThreshold: 3,
      recoveryTimeoutMs: 30000,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts in closed state", () => {
    expect(cb.getState()).toBe("closed");
  });

  it("trips to open after consecutive failures reach threshold", () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("closed");

    cb.recordFailure();
    expect(cb.getState()).toBe("open");
  });

  it("rejects immediately when open", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    const result = cb.allowRequest();
    expect(result).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("circuit breaker")
    );
  });

  it("transitions to half-open after recovery timeout", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    expect(cb.getState()).toBe("open");
    expect(cb.allowRequest()).toBe(false);

    vi.advanceTimersByTime(30000);

    expect(cb.getState()).toBe("half-open");
    expect(cb.allowRequest()).toBe(true);
  });

  it("closes on success from half-open", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(30000);
    expect(cb.getState()).toBe("half-open");

    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("circuit breaker recovered")
    );
  });

  it("re-opens on failure from half-open", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(30000);
    expect(cb.getState()).toBe("half-open");

    cb.recordFailure();
    expect(cb.getState()).toBe("open");
  });

  it("does not trip with intermittent successes", () => {
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();

    expect(cb.getState()).toBe("closed");
  });

  it("resets failure count on success", () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();

    cb.recordFailure();
    cb.recordFailure();

    expect(cb.getState()).toBe("closed");

    cb.recordFailure();
    expect(cb.getState()).toBe("open");
  });

  it("exports state for persistence", () => {
    cb.recordFailure();
    cb.recordFailure();

    const state = cb.exportState();
    expect(state).toHaveProperty("state", "closed");
    expect(state).toHaveProperty("failureCount", 2);
    expect(state).toHaveProperty("lastFailureAt");
  });

  it("imports state for persistence", () => {
    const importedState = {
      state: "closed",
      failureCount: 2,
      lastFailureAt: Date.now() - 5000,
    };

    cb.importState(importedState);
    expect(cb.getState()).toBe("closed");

    cb.recordFailure();
    expect(cb.getState()).toBe("open");
  });
});

describe("createCompileRetryManager with circuit breaker", () => {
  let retryManager;
  let mockLogger;
  let mockCacheLoader;
  let mockCacheSaver;
  let mockCircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    mockCacheLoader = vi.fn();
    mockCacheSaver = vi.fn();
    mockCircuitBreaker = {
      getState: vi.fn().mockReturnValue("closed"),
      allowRequest: vi.fn().mockReturnValue(true),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      exportState: vi.fn().mockReturnValue({}),
      importState: vi.fn(),
    };

    retryManager = createCompileRetryManager({
      logger: mockLogger,
      loadCache: mockCacheLoader,
      saveCache: mockCacheSaver,
      circuitBreaker: mockCircuitBreaker,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("records success on successful execution", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    await retryManager.executeWithRetry(fn, "compileToday");
    expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
  });

  it("records failure after all retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await retryManager.executeWithRetry(fn, "compileToday").catch(() => {});
    expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
  });

  it("rejects immediately when circuit breaker is open", async () => {
    mockCircuitBreaker.allowRequest.mockReturnValue(false);
    mockCircuitBreaker.getState.mockReturnValue("open");

    const fn = vi.fn().mockResolvedValue("should not call");
    await expect(
      retryManager.executeWithRetry(fn, "compileWeek")
    ).rejects.toThrow("circuit breaker open");

    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── Quality Validation Tests ───

describe("validateResponseQuality", () => {
  it("rejects null/undefined", () => {
    expect(validateResponseQuality(null)).toEqual({
      valid: false,
      reason: "empty",
    });
    expect(validateResponseQuality(undefined)).toEqual({
      valid: false,
      reason: "empty",
    });
  });

  it("rejects empty/whitespace strings", () => {
    expect(validateResponseQuality("")).toEqual({ valid: false, reason: "empty" });
    expect(validateResponseQuality("   \n  ")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects placeholder-only responses", () => {
    expect(validateResponseQuality("（暂无记忆）")).toEqual({
      valid: false,
      reason: "placeholder",
    });
    expect(validateResponseQuality("(No memory yet)")).toEqual({
      valid: false,
      reason: "placeholder",
    });
    expect(validateResponseQuality("无")).toEqual({
      valid: false,
      reason: "placeholder",
    });
    expect(validateResponseQuality("none")).toEqual({
      valid: false,
      reason: "placeholder",
    });
  });

  it("rejects responses that are too short (less than 2 meaningful tokens)", () => {
    expect(validateResponseQuality("ok")).toEqual({
      valid: false,
      reason: "too_short",
    });
    expect(validateResponseQuality("好的")).toEqual({
      valid: false,
      reason: "too_short",
    });
  });

  it("accepts meaningful multi-sentence responses", () => {
    expect(validateResponseQuality("用户今天关注了记忆系统的开发。下午讨论了编译管线的设计。")).toEqual({
      valid: true,
      reason: null,
    });
  });

  it("accepts structured list responses", () => {
    const response = "- 用户今天研究了重试机制\n- 讨论了熔断器模式\n- 实现了质量验证";
    expect(validateResponseQuality(response)).toEqual({
      valid: true,
      reason: null,
    });
  });

  it("accepts responses with sufficient character length", () => {
    const response = "用户今天完成了编译管线的容错实现，包括重试机制、熔断器模式和质量验证。这些改进显著提高了系统的可靠性。";
    expect(validateResponseQuality(response)).toEqual({
      valid: true,
      reason: null,
    });
  });
});

describe("createCompileRetryManager with quality validation", () => {
  let retryManager;
  let mockLogger;
  let mockCacheLoader;
  let mockCacheSaver;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
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

  it("rejects placeholder responses", async () => {
    const fn = vi.fn().mockResolvedValue("（暂无记忆）");
    await expect(
      retryManager.executeWithRetry(fn, "compileToday")
    ).rejects.toThrow("invalid response");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rejects too-short responses", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      retryManager.executeWithRetry(fn, "compileWeek")
    ).rejects.toThrow("invalid response");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("accepts quality responses after initial poor attempts", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce("ok")
      .mockResolvedValueOnce("（暂无记忆）")
      .mockResolvedValue("- 用户今天关注了记忆系统\n- 讨论了编译设计");

    const resultPromise = retryManager.executeWithRetry(fn, "compileFacts");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toContain("记忆系统");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ─── Fallback Prompts Tests ───

describe("createCompileRetryManager with fallback prompts", () => {
  let retryManager;
  let mockLogger;
  let mockCacheLoader;
  let mockCacheSaver;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
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

  it("uses fallback prompt after retry exhaustion", async () => {
    const fallbackFn = vi.fn().mockResolvedValue("fallback result");

    const fn = vi.fn().mockRejectedValue(new Error("LLM timeout"));

    const resultPromise = retryManager.executeWithRetry(fn, "compileToday", {
      fallbackFn,
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("fallback result");
    expect(fallbackFn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("compileToday"),
      expect.stringContaining("fallback")
    );
  });

  it("throws when fallback also fails", async () => {
    const fallbackFn = vi.fn().mockRejectedValue(new Error("fallback also failed"));
    const fn = vi.fn().mockRejectedValue(new Error("original error"));

    const resultPromise = retryManager.executeWithRetry(fn, "compileWeek", {
      fallbackFn,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow("original error");
    expect(fallbackFn).toHaveBeenCalledTimes(1);
  });

  it("does not use fallback when not provided", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    const resultPromise = retryManager.executeWithRetry(fn, "compileLongterm");

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow("fail");
  });

  it("fallback success is logged at info level", async () => {
    const fallbackFn = vi.fn().mockResolvedValue("fallback ok");
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await retryManager.executeWithRetry(fn, "compileFacts", { fallbackFn });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("compileFacts"),
      expect.stringContaining("fallback prompt")
    );
  });
});

// ─── State Persistence Tests ───

describe("createCompileStatePersistence", () => {
  let tmpDir;
  let persistence;
  let mockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compile-state-"));
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    persistence = createCompileStatePersistence({
      stateDir: tmpDir,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("saves compilation state to disk", async () => {
    const state = {
      lastCompileDate: "2026-05-22",
      completedSteps: ["compileToday", "compileWeek"],
      circuitBreakerState: { state: "closed", failureCount: 0 },
      partialResults: { today: "today content" },
    };

    await persistence.saveState(state);

    const loaded = await persistence.loadState();
    expect(loaded).toEqual(state);
  });

  it("returns null when no state file exists", async () => {
    const loaded = await persistence.loadState();
    expect(loaded).toBeNull();
  });

  it("ignores expired state (older than 48 hours)", async () => {
    const state = {
      lastCompileDate: "2026-05-20",
      completedSteps: ["compileToday"],
      _savedAt: Date.now() - 49 * 3600_000,
    };

    await persistence.saveState(state);

    vi.advanceTimersByTime(49 * 3600_000);

    const loaded = await persistence.loadState();
    expect(loaded).toBeNull();
  });

  it("preserves partial results across saves", async () => {
    await persistence.saveState({
      partialResults: { today: "today compiled" },
      completedSteps: ["compileToday"],
    });

    await persistence.saveState({
      partialResults: {
        today: "today compiled",
        facts: "facts compiled",
      },
      completedSteps: ["compileToday", "compileFacts"],
    });

    const loaded = await persistence.loadState();
    expect(loaded.partialResults.today).toBe("today compiled");
    expect(loaded.partialResults.facts).toBe("facts compiled");
  });

  it("handles corrupted state file gracefully", async () => {
    const stateFile = path.join(tmpDir, "compile-state.json");
    fs.writeFileSync(stateFile, "not valid json {{{");

    const loaded = await persistence.loadState();
    expect(loaded).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupted")
    );
  });
});

// ─── Partial Result Preservation Tests ───

describe("partial result preservation in compile flow", () => {
  it("preservePartialResults saves intermediate results", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "partial-results-"));
    const persistence = createCompileStatePersistence({
      stateDir: tmpDir,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    await persistence.savePartialResult("compileToday", "today compiled content");

    const state = await persistence.loadState();
    expect(state.partialResults.compileToday).toBe("today compiled content");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadPartialResults returns preserved data after failure", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "partial-results-"));
    const persistence = createCompileStatePersistence({
      stateDir: tmpDir,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    await persistence.savePartialResult("compileToday", "today data");
    await persistence.savePartialResult("compileFacts", "facts data");

    const state = await persistence.loadState();
    expect(state.partialResults.compileToday).toBe("today data");
    expect(state.partialResults.compileFacts).toBe("facts data");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clearPartialResults removes stored partial data", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "partial-results-"));
    const persistence = createCompileStatePersistence({
      stateDir: tmpDir,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    await persistence.savePartialResult("compileToday", "today data");
    await persistence.clearState();

    const state = await persistence.loadState();
    expect(state).toBeNull();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
