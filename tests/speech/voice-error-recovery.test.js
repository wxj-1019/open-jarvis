/**
 * voice-error-recovery.test.js — VoiceErrorRecovery 单元测试
 *
 * 验证错误恢复服务:
 * - 指数退避重试
 * - 状态快照保存与恢复（5 分钟 TTL）
 * - 服务降级策略
 * - 错误分类
 * - 退避延迟计算
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceErrorRecovery, ERROR_TYPES, RECOVERY_STATE } from "../../lib/speech/voice-error-recovery.js";

describe("VoiceErrorRecovery", () => {
  let recovery;

  beforeEach(() => {
    vi.useFakeTimers();
    recovery = new VoiceErrorRecovery({ baseDelay: 100 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 初始状态 ──

  it("initializes with IDLE state", () => {
    expect(recovery.getState()).toBe(RECOVERY_STATE.IDLE);
    expect(recovery.getRetryCount()).toBe(0);
  });

  // ── retryWithBackoff: success on first attempt ──

  it("succeeds on first attempt", async () => {
    const fn = vi.fn(async () => "success");

    const promise = recovery.retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(recovery.getState()).toBe(RECOVERY_STATE.IDLE);
    expect(recovery.getRetryCount()).toBe(0);
  });

  // ── retryWithBackoff: retry on failure and eventually succeed ──

  it("retries on failure and eventually succeeds", async () => {
    const states = [];
    const retryEvents = [];
    recovery.on("statechange", (s) => states.push(s));
    recovery.on("retry", (data) => retryEvents.push(data));

    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error(`attempt ${attempts} failed`);
      }
      return "success";
    });

    const promise = recovery.retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(recovery.getState()).toBe(RECOVERY_STATE.RECOVERED);
    expect(recovery.getRetryCount()).toBe(2);
    expect(retryEvents).toHaveLength(2);
    expect(states).toContain(RECOVERY_STATE.RETRYING);
    expect(states).toContain(RECOVERY_STATE.RECOVERED);
  });

  // ── retryWithBackoff: fail after max retries ──

  it("fails after max retries reached", async () => {
    const failedEvents = [];
    recovery.on("failed", (data) => failedEvents.push(data));

    const fn = vi.fn(async () => {
      throw new Error("always fails");
    });

    const promise = recovery.retryWithBackoff(fn);
    promise.catch(() => {}); // suppress unhandled rejection during timer advance
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).rejects.toThrow("always fails");

    expect(fn).toHaveBeenCalledTimes(6); // 1 initial + 5 retries
    expect(recovery.getState()).toBe(RECOVERY_STATE.FAILED);
    expect(recovery.getRetryCount()).toBe(5);
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0].attempts).toBe(6);
    expect(failedEvents[0].errorType).toBe(ERROR_TYPES.UNKNOWN_ERROR);
  });

  // ── retryWithBackoff: abort mid-execution ──

  it("aborts retry loop mid-execution", async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        recovery.abort();
      }
      throw new Error("fail");
    });

    const promise = recovery.retryWithBackoff(fn);
    promise.catch(() => {}); // suppress unhandled rejection during timer advance
    // Advance enough for 2 retries: first timer fires (fn called 2nd time, abort called),
    // then second timer fires, then abort is detected at loop start
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).rejects.toThrow("Retry aborted");

    expect(recovery.getState()).toBe(RECOVERY_STATE.FAILED);
  });

  // ── saveState / restoreState ──

  it("saves and restores state snapshot", () => {
    const snapshot = { text: "hello", audioBuffer: [1, 2, 3] };
    recovery.saveState(snapshot);

    const restored = recovery.restoreState();
    expect(restored).toEqual(snapshot);
  });

  it("returns null when no state saved", () => {
    expect(recovery.restoreState()).toBeNull();
  });

  it("expired snapshots return null (5-minute TTL)", () => {
    const snapshot = { data: "test" };
    recovery.saveState(snapshot);

    // Advance time by 5 minutes + 1ms
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const restored = recovery.restoreState();
    expect(restored).toBeNull();
  });

  it("snapshots within TTL are restored", () => {
    const snapshot = { data: "test" };
    recovery.saveState(snapshot);

    // Advance time by 4 minutes 59 seconds
    vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000);

    const restored = recovery.restoreState();
    expect(restored).toEqual(snapshot);
  });

  // ── degrade ──

  it("degrades stt to webspeech", () => {
    const degradedEvents = [];
    recovery.on("degraded", (data) => degradedEvents.push(data));

    const result = recovery.degrade("stt");

    expect(result).toEqual({ service: "stt", fallback: "webspeech" });
    expect(recovery.getState()).toBe(RECOVERY_STATE.DEGRADED);
    expect(degradedEvents).toHaveLength(1);
    expect(degradedEvents[0]).toEqual({ service: "stt", fallback: "webspeech" });
  });

  it("degrades tts to webspeech", () => {
    const result = recovery.degrade("tts");
    expect(result).toEqual({ service: "tts", fallback: "webspeech" });
  });

  it("degrades vad to rms", () => {
    const result = recovery.degrade("vad");
    expect(result).toEqual({ service: "vad", fallback: "rms" });
  });

  it("returns null for unsupported service", () => {
    const result = recovery.degrade("llm");
    expect(result).toBeNull();
    expect(recovery.getState()).toBe(RECOVERY_STATE.IDLE);
  });

  // ── Error classification ──

  it("classifies network errors", () => {
    const networkErrors = [
      new Error("network error"),
      Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }),
      Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }),
      Object.assign(new Error("fetch failed"), { code: "ERR_NETWORK" }),
    ];

    for (const err of networkErrors) {
      expect(recovery._classifyError(err)).toBe(ERROR_TYPES.NETWORK_ERROR);
    }
  });

  it("classifies timeout errors", () => {
    const timeoutErrors = [
      new Error("request timeout"),
      Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }),
      Object.assign(new Error("ESOCKETTIMEDOUT"), { code: "ESOCKETTIMEDOUT" }),
      new Error("Connection timed out"),
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    ];

    for (const err of timeoutErrors) {
      expect(recovery._classifyError(err)).toBe(ERROR_TYPES.TIMEOUT_ERROR);
    }
  });

  it("classifies rate limit errors", () => {
    const rateLimitErrors = [
      Object.assign(new Error("Too Many Requests"), { statusCode: 429 }),
      Object.assign(new Error("rate limited"), { code: "rate_limit" }),
      new Error("rate limit exceeded"),
      new Error("429 too many requests"),
    ];

    for (const err of rateLimitErrors) {
      expect(recovery._classifyError(err)).toBe(ERROR_TYPES.RATE_LIMIT_ERROR);
    }
  });

  it("classifies service unavailable errors", () => {
    const serviceErrors = [
      Object.assign(new Error("Service Unavailable"), { statusCode: 503 }),
      Object.assign(new Error("Bad Gateway"), { statusCode: 502 }),
      new Error("service unavailable"),
      new Error("503 error"),
    ];

    for (const err of serviceErrors) {
      expect(recovery._classifyError(err)).toBe(ERROR_TYPES.SERVICE_UNAVAILABLE);
    }
  });

  it("classifies unknown errors", () => {
    const unknownErrors = [
      new Error("something went wrong"),
      new Error("invalid parameter"),
      null,
      undefined,
      "string error",
    ];

    for (const err of unknownErrors) {
      expect(recovery._classifyError(err)).toBe(ERROR_TYPES.UNKNOWN_ERROR);
    }
  });

  // ── Backoff calculation ──

  it("calculates increasing backoff delays", () => {
    const baseDelay = 1000;
    const delays = [];

    // Seed random for deterministic testing
    vi.spyOn(Math, "random").mockReturnValue(0);

    for (let attempt = 1; attempt <= 5; attempt++) {
      delays.push(recovery._calculateBackoff(attempt, baseDelay));
    }

    // Without jitter (random = 0), delays should be: 1000, 2000, 4000, 8000, 16000
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(4000);
    expect(delays[3]).toBe(8000);
    expect(delays[4]).toBe(16000);

    Math.random.mockRestore();
  });

  it("respects maxDelay cap", () => {
    const recoveryWithLowMax = new VoiceErrorRecovery({ maxDelay: 5000, baseDelay: 1000 });

    vi.spyOn(Math, "random").mockReturnValue(0);

    const delay = recoveryWithLowMax._calculateBackoff(10, 1000);

    expect(delay).toBeLessThanOrEqual(5000);

    Math.random.mockRestore();
  });

  it("adds jitter within 30% range", () => {
    const recoveryInstance = new VoiceErrorRecovery({ baseDelay: 1000, maxDelay: 30000 });

    // Test that jitter is always positive and within range
    for (let i = 0; i < 50; i++) {
      const delay = recoveryInstance._calculateBackoff(1, 1000);
      // Base is 1000, max jitter is 300 (30% of 1000)
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1300);
    }
  });

  // ── Events ──

  it("emits statechange event on state transition", () => {
    const states = [];
    recovery.on("statechange", (s) => states.push(s));

    recovery.degrade("stt");

    expect(states).toContain(RECOVERY_STATE.DEGRADED);
  });

  it("emits recovered event with attempt info", async () => {
    const recoveredEvents = [];
    recovery.on("recovered", (data) => recoveredEvents.push(data));

    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("fail");
      }
      return "ok";
    };

    const promise = recovery.retryWithBackoff(fn);
    await vi.runAllTimersAsync();
    await promise;

    expect(recoveredEvents).toHaveLength(1);
    expect(recoveredEvents[0].attempts).toBe(2);
  });

  // ── configurable baseDelay in retryWithBackoff ──

  it("uses custom baseDelay from opts", async () => {
    const retryEvents = [];
    const recoveryFast = new VoiceErrorRecovery({ maxRetries: 1, baseDelay: 500 });
    recoveryFast.on("retry", (data) => retryEvents.push(data));

    const fn = vi.fn(async () => {
      throw new Error("fail");
    });

    const promise = recoveryFast.retryWithBackoff(fn, { baseDelay: 2000 });
    promise.catch(() => {}); // suppress unhandled rejection during timer advance
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).rejects.toThrow("fail");

    // First retry delay should be based on 2000, not 500
    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0].delay).toBeGreaterThanOrEqual(2000);
  });
});
