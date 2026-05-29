/**
 * vad-service.test.js — VAD 语音活动检测服务单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VADService, VAD_STATE } from "../../lib/speech/vad-service.js";

describe("VADService", () => {
  let vad;

  beforeEach(() => {
    vad = new VADService();
  });

  afterEach(() => {
    vad?.stop();
  });

  // ── 构造 ──

  it("initializes with UNKNOWN state", () => {
    expect(vad.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  it("accepts custom silenceThreshold", () => {
    const custom = new VADService({ silenceThreshold: 0.05 });
    expect(custom.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  it("accepts custom silenceDurationMs", () => {
    const custom = new VADService({ silenceDurationMs: 2000 });
    expect(custom.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  it("accepts custom speechDurationMs", () => {
    const custom = new VADService({ speechDurationMs: 500 });
    expect(custom.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  it("accepts custom sampleRate", () => {
    const custom = new VADService({ sampleRate: 44100 });
    expect(custom.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  it("uses default silenceThreshold of 0.01", () => {
    const custom = new VADService();
    expect(custom._silenceThreshold).toBe(0.01);
  });

  it("uses default silenceDurationMs of 1500", () => {
    const custom = new VADService();
    expect(custom._silenceDurationMs).toBe(1500);
  });

  it("uses default speechDurationMs of 300", () => {
    const custom = new VADService();
    expect(custom._speechDurationMs).toBe(300);
  });

  it("uses default sampleRate of 16000", () => {
    const custom = new VADService();
    expect(custom._sampleRate).toBe(16000);
  });

  // ── start / stop ──

  it("start transitions to SILENCE state", () => {
    vad.start();
    expect(vad.getState()).toBe(VAD_STATE.SILENCE);
    vad.stop();
  });

  it("start emits statechange event", () => {
    const spy = vi.fn();
    vad.on("statechange", spy);
    vad.start();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({
      state: VAD_STATE.SILENCE,
      prev: VAD_STATE.UNKNOWN,
    });
    vad.stop();
  });

  it("start is idempotent when already started", () => {
    vad.start();
    const spy = vi.fn();
    vad.on("statechange", spy);

    vad.start();

    expect(spy).not.toHaveBeenCalled();
    expect(vad.getState()).toBe(VAD_STATE.SILENCE);
    vad.stop();
  });

  it("stop transitions to UNKNOWN state", () => {
    vad.start();
    vad.stop();
    expect(vad.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  it("stop emits statechange event", () => {
    const spy = vi.fn();
    vad.on("statechange", spy);
    vad.start();
    spy.mockClear();

    vad.stop();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({
      state: VAD_STATE.UNKNOWN,
      prev: VAD_STATE.SILENCE,
    });
  });

  it("stop is idempotent when already stopped", () => {
    vad.stop();
    expect(vad.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  // ── RMS energy calculation ──

  it("calculates RMS energy correctly for silent audio", () => {
    const silent = new Float32Array(1000).fill(0);
    const rms = vad._calculateRMS(silent);
    expect(rms).toBe(0);
  });

  it("calculates RMS energy correctly for loud audio", () => {
    const loud = new Float32Array(1000).fill(0.5);
    const rms = vad._calculateRMS(loud);
    expect(rms).toBe(0.5);
  });

  it("calculates RMS energy correctly for mixed audio", () => {
    const mixed = new Float32Array(4);
    mixed[0] = 0;
    mixed[1] = 0.5;
    mixed[2] = 0;
    mixed[3] = 0.5;
    const rms = vad._calculateRMS(mixed);
    expect(rms).toBeCloseTo(0.3535, 2);
  });

  // ── onAudioData: silence detection ──

  it("onAudioData with silent data stays in SILENCE state", () => {
    vad.start();
    const silent = new Float32Array(1000).fill(0);
    vad.onAudioData(silent);

    expect(vad.getState()).toBe(VAD_STATE.SILENCE);
    vad.stop();
  });

  it("onAudioData with loud data transitions to SPEECH state after speechDurationMs", () => {
    vi.useFakeTimers();

    vad.start();
    const loud = new Float32Array(1000).fill(0.5);

    // 需要持续语音 300ms 才判定为 SPEECH
    // 假设每个 chunk 是 100ms (sampleRate=16000, 1000 samples ≈ 62.5ms, 这里简化为时间控制)
    // 我们需要模拟时间流逝

    // 送入第一个 chunk，应该还在 SILENCE
    vad.onAudioData(loud);
    expect(vad.getState()).toBe(VAD_STATE.SILENCE);

    // 快进时间，模拟持续语音
    vi.advanceTimersByTime(350);

    // 持续送入语音数据
    vad.onAudioData(loud);
    vad.onAudioData(loud);

    expect(vad.getState()).toBe(VAD_STATE.SPEECH);

    vi.useRealTimers();
    vad.stop();
  });

  it("onAudioData with silent data transitions to SILENCE after silenceDurationMs", () => {
    vi.useFakeTimers();

    vad.start();
    const loud = new Float32Array(1000).fill(0.5);
    const silent = new Float32Array(1000).fill(0);

    // 先触发 SPEECH
    vad.onAudioData(loud);
    vad.onAudioData(loud);
    vi.advanceTimersByTime(350);
    vad.onAudioData(loud);
    expect(vad.getState()).toBe(VAD_STATE.SPEECH);

    // 然后送入静音数据
    vad.onAudioData(silent);
    vad.onAudioData(silent);
    vi.advanceTimersByTime(1600);
    vad.onAudioData(silent);

    expect(vad.getState()).toBe(VAD_STATE.SILENCE);

    vi.useRealTimers();
    vad.stop();
  });

  // ── events ──

  it("emits speechstart when transitioning to SPEECH", () => {
    vi.useFakeTimers();

    const spy = vi.fn();
    vad.on("speechstart", spy);

    vad.start();
    const loud = new Float32Array(1000).fill(0.5);

    vad.onAudioData(loud);
    vi.advanceTimersByTime(350);
    vad.onAudioData(loud);

    expect(spy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    vad.stop();
  });

  it("emits speechend when transitioning to SILENCE", () => {
    vi.useFakeTimers();

    vad.start();
    const loud = new Float32Array(1000).fill(0.5);
    const silent = new Float32Array(1000).fill(0);

    // 触发 SPEECH
    vad.onAudioData(loud);
    vi.advanceTimersByTime(350);
    vad.onAudioData(loud);
    expect(vad.getState()).toBe(VAD_STATE.SPEECH);

    // 触发 SILENCE
    const spy = vi.fn();
    vad.on("speechend", spy);

    vad.onAudioData(silent);
    vi.advanceTimersByTime(1600);
    vad.onAudioData(silent);

    expect(spy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    vad.stop();
  });

  it("emits silence event on sustained silence after speech", () => {
    vi.useFakeTimers();

    const spy = vi.fn();
    vad.on("silence", spy);

    vad.start();
    const loud = new Float32Array(1000).fill(0.5);
    const silent = new Float32Array(1000).fill(0);

    // 先触发 SPEECH
    vad.onAudioData(loud);
    vi.advanceTimersByTime(350);
    vad.onAudioData(loud);
    expect(vad.getState()).toBe(VAD_STATE.SPEECH);

    // 然后送入静音数据，触发 silence 事件
    vad.onAudioData(silent);
    vi.advanceTimersByTime(1600);
    vad.onAudioData(silent);

    expect(spy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    vad.stop();
  });

  // ── statechange events ──

  it("does not emit statechange for same state", () => {
    vad.start();
    const spy = vi.fn();
    vad.on("statechange", spy);

    // 再次送入静音数据，不应该触发状态变化
    const silent = new Float32Array(1000).fill(0);
    vad.onAudioData(silent);

    expect(spy).not.toHaveBeenCalled();
    vad.stop();
  });

  // ── edge cases ──

  it("onAudioData before start is a no-op", () => {
    const silent = new Float32Array(1000).fill(0);
    vad.onAudioData(silent);

    expect(vad.getState()).toBe(VAD_STATE.UNKNOWN);
  });

  it("handles empty audio data", () => {
    vad.start();
    const empty = new Float32Array(0);
    vad.onAudioData(empty);

    expect(vad.getState()).toBe(VAD_STATE.SILENCE);
    vad.stop();
  });

  it("handles very short audio data", () => {
    vad.start();
    const short = new Float32Array(10).fill(0.5);
    vad.onAudioData(short);

    expect(vad.getState()).toBe(VAD_STATE.SILENCE);
    vad.stop();
  });

  it("resets speech timer on stop", () => {
    vi.useFakeTimers();

    vad.start();
    const loud = new Float32Array(1000).fill(0.5);

    vad.onAudioData(loud);
    vi.advanceTimersByTime(200);
    vad.stop();

    // stop 后状态应该是 UNKNOWN
    expect(vad.getState()).toBe(VAD_STATE.UNKNOWN);

    vi.useRealTimers();
  });

  it("resets silence timer on stop", () => {
    vi.useFakeTimers();

    vad.start();
    const loud = new Float32Array(1000).fill(0.5);

    vad.onAudioData(loud);
    vi.advanceTimersByTime(350);
    vad.onAudioData(loud);
    expect(vad.getState()).toBe(VAD_STATE.SPEECH);

    vad.stop();
    expect(vad.getState()).toBe(VAD_STATE.UNKNOWN);

    vi.useRealTimers();
  });
});
