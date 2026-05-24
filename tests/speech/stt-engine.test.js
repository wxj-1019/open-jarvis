/**
 * stt-engine.test.js — STT 引擎单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STTEngine, STT_STATE } from "../../lib/speech/stt-engine.js";

describe("STTEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new STTEngine();
  });

  afterEach(() => {
    engine?.destroy();
  });

  // ── 构造 ──

  it("initializes with IDLE state", () => {
    expect(engine.getState()).toBe(STT_STATE.IDLE);
  });

  it("initializes with empty final results", () => {
    expect(engine.getFinalResults()).toEqual([]);
  });

  it("accepts custom default options", () => {
    const custom = new STTEngine({ lang: "en-US", timeout: 5000 });
    expect(custom.getState()).toBe(STT_STATE.IDLE);
    custom.destroy();
  });

  // ── startListening ──

  it("startListening emits 'start' event", async () => {
    const spy = vi.fn();
    engine.on("start", spy);

    const promise = engine.startListening();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ lang: "zh-CN" });

    // 清理
    engine.onEnd();
    await promise;
  });

  it("startListening transitions to LISTENING state", async () => {
    const promise = engine.startListening();
    expect(engine.getState()).toBe(STT_STATE.LISTENING);

    engine.onEnd();
    await promise;
  });

  it("startListening returns results when onResult + onEnd called", async () => {
    const promise = engine.startListening({ lang: "en-US" });

    engine.onResult({ text: "Hello", isFinal: true, confidence: 0.95 });
    engine.onEnd();

    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ text: "Hello", isFinal: true });
  });

  it("startListening returns multiple final results in continuous mode", async () => {
    const promise = engine.startListening({ continuous: true });

    engine.onResult({ text: "First", isFinal: true });
    engine.onResult({ text: "interim", isFinal: false });
    engine.onResult({ text: "Second", isFinal: true });
    engine.onEnd();

    const results = await promise;
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe("First");
    expect(results[1].text).toBe("Second");
  });

  it("startListening returns empty array on end with no final results", async () => {
    const promise = engine.startListening();

    engine.onResult({ text: "interim only", isFinal: false });
    engine.onEnd();

    const results = await promise;
    expect(results).toEqual([]);
  });

  it("startListening resolves immediately on end in non-continuous mode after first final result", async () => {
    const promise = engine.startListening({ continuous: false });

    // 第一个最终结果应该自动结束
    engine.onResult({ text: "Done", isFinal: true });

    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Done");
    expect(engine.getState()).toBe(STT_STATE.IDLE);
  });

  it("startListening rejects if called when not IDLE", async () => {
    const promise1 = engine.startListening();
    await expect(engine.startListening()).rejects.toThrow("Cannot start");

    engine.onEnd();
    await promise1;
  });

  // ── stopListening ──

  it("stopListening emits 'stop' event", async () => {
    const spy = vi.fn();
    engine.on("stop", spy);

    const promise = engine.startListening();
    engine.stopListening();

    expect(spy).toHaveBeenCalledTimes(1);
    // stopListening 会导致 session 未正常完成而被 _cleanup reject
    try { await promise; } catch {}
  });

  it("stopListening returns pending results", async () => {
    const promise = engine.startListening();

    engine.onResult({ text: "Before stop", isFinal: true });
    engine.stopListening();
    engine.onEnd();

    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Before stop");
  });

  // ── cancel ──

  it("cancel rejects the session promise", async () => {
    const promise = engine.startListening();
    engine.cancel();

    await expect(promise).rejects.toThrow("STT cancelled");
    expect(engine.getState()).toBe(STT_STATE.IDLE);
  });

  it("cancel emits 'cancel' event", async () => {
    const spy = vi.fn();
    engine.on("cancel", spy);

    const promise = engine.startListening();
    engine.cancel();

    expect(spy).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toThrow("STT cancelled");
  });

  // ── onError ──

  it("onError rejects the session promise", async () => {
    const spy = vi.fn();
    engine.on("error", spy);

    const promise = engine.startListening();
    // 在 await 前检查状态（因为 onError → ERROR，然后 _cleanup → IDLE）
    engine.onError(new Error("No microphone"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].message).toBe("No microphone");

    await expect(promise).rejects.toThrow("No microphone");
  });

  it("onError with string creates Error", async () => {
    engine.on("error", () => {}); // 防止 emit error 抛出
    const promise = engine.startListening();
    engine.onError("Recognition failed");

    await expect(promise).rejects.toThrow("Recognition failed");
  });

  // ── 超时 ──

  it("timeout stops listening and resolves with accumulated results", async () => {
    vi.useFakeTimers();

    const spy = vi.fn();
    engine.on("statechange", spy);

    const promise = engine.startListening({ timeout: 2000, silenceTimeout: 0 });
    engine.onResult({ text: "Some text", isFinal: true });

    // 快进超时
    vi.advanceTimersByTime(2100);

    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Some text");
    expect(engine.getState()).toBe(STT_STATE.IDLE);

    vi.useRealTimers();
  });

  // ── 静音超时 ──

  it("silence timeout auto-stops after last final result", async () => {
    vi.useFakeTimers();

    const promise = engine.startListening({ silenceTimeout: 1000, timeout: 0 });

    engine.onResult({ text: "Hello", isFinal: true });

    // 快进静音超时
    vi.advanceTimersByTime(1100);

    const results = await promise;
    expect(results[0].text).toBe("Hello");

    vi.useRealTimers();
  });

  // ── statechange 事件 ──

  it("emits statechange when state transitions", async () => {
    const changes = [];
    engine.on("statechange", ({ state, prev }) => {
      changes.push({ state, prev });
    });
    engine.on("error", () => {}); // 防止 emit error 抛出

    const promise = engine.startListening();
    expect(changes[0]).toEqual({ state: STT_STATE.LISTENING, prev: STT_STATE.IDLE });

    engine.onError(new Error("test"));
    // onError 设置 ERROR，然后 _cleanup 设置回 IDLE
    // 所以应该有: IDLE→LISTENING, LISTENING→ERROR, ERROR→IDLE
    try { await promise; } catch {}

    expect(changes.length).toBeGreaterThanOrEqual(2); // 至少包含 LISTENING 和 ERROR
    expect(changes[0]).toEqual({ state: STT_STATE.LISTENING, prev: STT_STATE.IDLE });
  });

  it("does not emit statechange for same state", async () => {
    let count = 0;
    engine.on("statechange", () => count++);

    const promise = engine.startListening();
    // setState only emits if state actually changes
    expect(count).toBe(1); // IDLE → LISTENING
    engine.onEnd();
    await promise;
  });

  // ── getFinalResults ──

  it("getFinalResults returns accumulated results during session", async () => {
    const promise = engine.startListening({ continuous: true });

    engine.onResult({ text: "A", isFinal: true });
    expect(engine.getFinalResults()).toHaveLength(1);

    engine.onResult({ text: "B", isFinal: true });
    expect(engine.getFinalResults()).toHaveLength(2);

    engine.onEnd();
    await promise;
  });

  // ── destroy ──

  it("destroy cancels active session and removes listeners", async () => {
    const promise = engine.startListening();
    engine.destroy();

    await expect(promise).rejects.toThrow("STT cancelled");
    expect(engine.listenerCount("start")).toBe(0);
    expect(engine.listenerCount("statechange")).toBe(0);
  });
});
