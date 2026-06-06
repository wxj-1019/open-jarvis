/**
 * vad-service-v2.test.js — 增强版 VAD 服务单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VADServiceV2,
  VAD_MODE,
  VAD_STATE_V2,
  DEFAULT_VAD_V2_CONFIG,
} from "../../lib/speech/vad-service-v2.js";

describe("VADServiceV2", () => {
  let vad;

  beforeEach(() => {
    vad = new VADServiceV2();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await vad?.destroy();
  });

  // ── 构造与默认值 ──

  describe("constructor", () => {
    it("initializes with UNKNOWN state", () => {
      expect(vad.getState()).toBe(VAD_STATE_V2.UNKNOWN);
    });

    it("initializes in RMS mode by default", () => {
      expect(vad.getMode()).toBe(VAD_MODE.RMS);
    });

    it("isSileroReady returns false by default", () => {
      expect(vad.isSileroReady()).toBe(false);
    });

    it("accepts custom silenceThreshold", () => {
      const custom = new VADServiceV2({ silenceThreshold: 0.05 });
      expect(custom._silenceThreshold).toBe(0.05);
      custom.destroy();
    });

    it("accepts custom silenceDurationMs", () => {
      const custom = new VADServiceV2({ silenceDurationMs: 2000 });
      expect(custom._silenceDurationMs).toBe(2000);
      custom.destroy();
    });

    it("accepts custom speechDurationMs", () => {
      const custom = new VADServiceV2({ speechDurationMs: 500 });
      expect(custom._speechDurationMs).toBe(500);
      custom.destroy();
    });

    it("accepts custom sampleRate", () => {
      const custom = new VADServiceV2({ sampleRate: 44100 });
      expect(custom._sampleRate).toBe(44100);
      custom.destroy();
    });

    it("accepts custom mode", () => {
      const custom = new VADServiceV2({ mode: VAD_MODE.HYBRID });
      expect(custom.getMode()).toBe(VAD_MODE.HYBRID);
      custom.destroy();
    });

    it("defaults to RMS when given invalid mode", () => {
      const custom = new VADServiceV2({ mode: "invalid" });
      expect(custom.getMode()).toBe(VAD_MODE.RMS);
      custom.destroy();
    });

    it("uses default config values", () => {
      const custom = new VADServiceV2();
      expect(custom._silenceThreshold).toBe(DEFAULT_VAD_V2_CONFIG.silenceThreshold);
      expect(custom._silenceDurationMs).toBe(DEFAULT_VAD_V2_CONFIG.silenceDurationMs);
      expect(custom._speechDurationMs).toBe(DEFAULT_VAD_V2_CONFIG.speechDurationMs);
      expect(custom._sampleRate).toBe(DEFAULT_VAD_V2_CONFIG.sampleRate);
      custom.destroy();
    });
  });

  // ── initialize ──

  describe("initialize", () => {
    it("returns immediately for RMS mode", async () => {
      const rmsVad = new VADServiceV2({ mode: VAD_MODE.RMS });
      await expect(rmsVad.initialize()).resolves.toBeUndefined();
      expect(rmsVad.isSileroReady()).toBe(false);
      await rmsVad.destroy();
    });

    it("falls back to RMS when Silero fails to load", async () => {
      const hybridVad = new VADServiceV2({ mode: VAD_MODE.HYBRID });
      await hybridVad.initialize();
      // In Node.js, @ricky0123/vad-web is not available, so it should fallback to RMS
      expect(hybridVad.getMode()).toBe(VAD_MODE.RMS);
      expect(hybridVad.isSileroReady()).toBe(false);
      await hybridVad.destroy();
    });

    it("is idempotent for RMS mode", async () => {
      const rmsVad = new VADServiceV2({ mode: VAD_MODE.RMS });
      await rmsVad.initialize();
      await rmsVad.initialize();
      await rmsVad.destroy();
    });
  });

  // ── start / stop ──

  describe("start / stop", () => {
    it("start transitions to SILENCE state", () => {
      vad.start();
      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);
      vad.stop();
    });

    it("start emits statechange event", () => {
      const spy = vi.fn();
      vad.on("statechange", spy);
      vad.start();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toEqual({
        state: VAD_STATE_V2.SILENCE,
        prev: VAD_STATE_V2.UNKNOWN,
      });
      vad.stop();
    });

    it("start is idempotent when already started", () => {
      vad.start();
      const spy = vi.fn();
      vad.on("statechange", spy);

      vad.start();

      expect(spy).not.toHaveBeenCalled();
      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);
      vad.stop();
    });

    it("stop transitions to UNKNOWN state", () => {
      vad.start();
      vad.stop();
      expect(vad.getState()).toBe(VAD_STATE_V2.UNKNOWN);
    });

    it("stop emits statechange event", () => {
      const spy = vi.fn();
      vad.on("statechange", spy);
      vad.start();
      spy.mockClear();

      vad.stop();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toEqual({
        state: VAD_STATE_V2.UNKNOWN,
        prev: VAD_STATE_V2.SILENCE,
      });
    });

    it("stop is idempotent when already stopped", () => {
      vad.stop();
      expect(vad.getState()).toBe(VAD_STATE_V2.UNKNOWN);
    });

    it("stop clears running flag", () => {
      vad.start();
      vad.stop();
      expect(vad._running).toBe(false);
    });
  });

  // ── RMS energy calculation ──

  describe("RMS calculation", () => {
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

    it("returns 0 for empty audio data", () => {
      const empty = new Float32Array(0);
      const rms = vad._calculateRMS(empty);
      expect(rms).toBe(0);
    });
  });

  // ── onAudioData: speech detection ──

  describe("onAudioData", () => {
    it("onAudioData before start is a no-op", () => {
      const silent = new Float32Array(1000).fill(0);
      vad.onAudioData(silent);
      expect(vad.getState()).toBe(VAD_STATE_V2.UNKNOWN);
    });

    it("handles empty audio data", () => {
      vad.start();
      const empty = new Float32Array(0);
      vad.onAudioData(empty);
      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);
      vad.stop();
    });

    it("handles null audio data", () => {
      vad.start();
      expect(() => vad.onAudioData(null)).not.toThrow();
      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);
      vad.stop();
    });

    it("onAudioData with silent data stays in SILENCE state", () => {
      vad.start();
      const silent = new Float32Array(1000).fill(0);
      vad.onAudioData(silent);
      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);
      vad.stop();
    });

    it("onAudioData with loud data transitions to SPEECH state after speechDurationMs", () => {
      vi.useFakeTimers();

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);

      vad.onAudioData(loud);
      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);

      vi.advanceTimersByTime(350);
      vad.onAudioData(loud);

      expect(vad.getState()).toBe(VAD_STATE_V2.SPEECH);

      vad.stop();
    });

    it("onAudioData with silent data transitions to SILENCE after silenceDurationMs", () => {
      vi.useFakeTimers();

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);
      const silent = new Float32Array(1000).fill(0);

      vad.onAudioData(loud);
      vad.onAudioData(loud);
      vi.advanceTimersByTime(350);
      vad.onAudioData(loud);
      expect(vad.getState()).toBe(VAD_STATE_V2.SPEECH);

      vad.onAudioData(silent);
      vad.onAudioData(silent);
      vi.advanceTimersByTime(1600);
      vad.onAudioData(silent);

      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);

      vad.stop();
    });
  });

  // ── events ──

  describe("events", () => {
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

      vad.stop();
    });

    it("emits speechend when transitioning to SILENCE", () => {
      vi.useFakeTimers();

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);
      const silent = new Float32Array(1000).fill(0);

      vad.onAudioData(loud);
      vi.advanceTimersByTime(350);
      vad.onAudioData(loud);
      expect(vad.getState()).toBe(VAD_STATE_V2.SPEECH);

      const spy = vi.fn();
      vad.on("speechend", spy);

      vad.onAudioData(silent);
      vi.advanceTimersByTime(1600);
      vad.onAudioData(silent);

      expect(spy).toHaveBeenCalledTimes(1);

      vad.stop();
    });

    it("emits silence event on sustained silence after speech", () => {
      vi.useFakeTimers();

      const spy = vi.fn();
      vad.on("silence", spy);

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);
      const silent = new Float32Array(1000).fill(0);

      vad.onAudioData(loud);
      vi.advanceTimersByTime(350);
      vad.onAudioData(loud);
      expect(vad.getState()).toBe(VAD_STATE_V2.SPEECH);

      vad.onAudioData(silent);
      vi.advanceTimersByTime(1600);
      vad.onAudioData(silent);

      expect(spy).toHaveBeenCalledTimes(1);

      vad.stop();
    });

    it("does not emit statechange for same state", () => {
      vad.start();
      const spy = vi.fn();
      vad.on("statechange", spy);

      const silent = new Float32Array(1000).fill(0);
      vad.onAudioData(silent);

      expect(spy).not.toHaveBeenCalled();
      vad.stop();
    });
  });

  // ── reset ──

  describe("reset", () => {
    it("reset clears timers and resets to SILENCE when running", () => {
      vi.useFakeTimers();

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);

      vad.onAudioData(loud);
      vi.advanceTimersByTime(200);

      vad.reset();

      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);
      expect(vad._speechStarted).toBe(false);
    });

    it("reset from SPEECH state transitions back to SILENCE", () => {
      vi.useFakeTimers();

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);

      vad.onAudioData(loud);
      vi.advanceTimersByTime(350);
      vad.onAudioData(loud);
      expect(vad.getState()).toBe(VAD_STATE_V2.SPEECH);

      vad.reset();

      expect(vad.getState()).toBe(VAD_STATE_V2.SILENCE);
      expect(vad._speechStarted).toBe(false);
    });

    it("reset is no-op when not running (stays UNKNOWN)", () => {
      vad.reset();
      expect(vad.getState()).toBe(VAD_STATE_V2.UNKNOWN);
    });

    it("reset emits statechange when transitioning from SPEECH to SILENCE", () => {
      vi.useFakeTimers();

      const spy = vi.fn();
      vad.on("statechange", spy);

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);

      vad.onAudioData(loud);
      vi.advanceTimersByTime(350);
      vad.onAudioData(loud);
      expect(vad.getState()).toBe(VAD_STATE_V2.SPEECH);

      spy.mockClear();
      vad.reset();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toEqual({
        state: VAD_STATE_V2.SILENCE,
        prev: VAD_STATE_V2.SPEECH,
      });
    });
  });

  // ── mode management ──

  describe("mode management", () => {
    it("setMode rejects invalid mode and defaults to RMS", () => {
      vad.start();
      const result = vad.setMode("invalid");
      expect(result).toBe(true);
      expect(vad.getMode()).toBe(VAD_MODE.RMS);
      vad.stop();
    });

    it("setMode to hybrid/silero fails when Silero not ready", () => {
      vad.start();

      const hybridResult = vad.setMode(VAD_MODE.HYBRID);
      expect(hybridResult).toBe(false);
      expect(vad.getMode()).toBe(VAD_MODE.RMS);

      const sileroResult = vad.setMode(VAD_MODE.SILERO);
      expect(sileroResult).toBe(false);
      expect(vad.getMode()).toBe(VAD_MODE.RMS);

      vad.stop();
    });

    it("setMode to RMS always succeeds", () => {
      vad.start();
      const result = vad.setMode(VAD_MODE.RMS);
      expect(result).toBe(true);
      expect(vad.getMode()).toBe(VAD_MODE.RMS);
      vad.stop();
    });

    it("setMode emits modechange event", () => {
      vad.start();
      const spy = vi.fn();
      vad.on("modechange", spy);

      vad.setMode(VAD_MODE.RMS);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toEqual({ mode: VAD_MODE.RMS });
      vad.stop();
    });

    it("getMode returns current mode", () => {
      expect(vad.getMode()).toBe(VAD_MODE.RMS);
    });
  });

  // ── destroy ──

  describe("destroy", () => {
    it("destroy stops VAD and removes listeners", async () => {
      vad.start();
      const handler = vi.fn();
      vad.on("speechstart", handler);
      await vad.destroy();
      expect(vad._running).toBe(false);
      expect(vad.listenerCount("speechstart")).toBe(0);
    });

    it("destroy is safe when VAD not started", async () => {
      await expect(vad.destroy()).resolves.toBeUndefined();
    });
  });

  // ── backward compatibility ──

  describe("backward compatibility", () => {
    it("has same API methods as VADService", () => {
      expect(typeof vad.start).toBe("function");
      expect(typeof vad.stop).toBe("function");
      expect(typeof vad.getState).toBe("function");
      expect(typeof vad.reset).toBe("function");
      expect(typeof vad.onAudioData).toBe("function");
    });

    it("behaves same as VADService in RMS mode", () => {
      vi.useFakeTimers();

      vad.start();
      const loud = new Float32Array(1000).fill(0.5);

      vad.onAudioData(loud);
      vi.advanceTimersByTime(350);
      vad.onAudioData(loud);

      expect(vad.getState()).toBe(VAD_STATE_V2.SPEECH);

      vad.stop();
    });
  });

  // ── Silero fallback behavior ──

  describe("Silero fallback behavior", () => {
    it("hybrid mode falls back to RMS when Silero not ready", () => {
      const hybridVad = new VADServiceV2({ mode: VAD_MODE.HYBRID });
      expect(hybridVad.isSileroReady()).toBe(false);

      hybridVad.start();
      const loud = new Float32Array(1000).fill(0.5);
      hybridVad.onAudioData(loud);

      // Should behave like RMS mode
      expect(hybridVad._state).toBe(VAD_STATE_V2.SILENCE);

      hybridVad.stop();
      hybridVad.destroy();
    });

    it("silero mode falls back to RMS when Silero not ready", () => {
      const sileroVad = new VADServiceV2({ mode: VAD_MODE.SILERO });
      expect(sileroVad.isSileroReady()).toBe(false);

      sileroVad.start();
      const loud = new Float32Array(1000).fill(0.5);
      sileroVad.onAudioData(loud);

      // Should behave like RMS mode
      expect(sileroVad._state).toBe(VAD_STATE_V2.SILENCE);

      sileroVad.stop();
      sileroVad.destroy();
    });

    it("initialize with silero mode falls back to RMS in Node.js", async () => {
      const sileroVad = new VADServiceV2({ mode: VAD_MODE.SILERO });
      await sileroVad.initialize();

      expect(sileroVad.getMode()).toBe(VAD_MODE.RMS);
      expect(sileroVad.isSileroReady()).toBe(false);

      await sileroVad.destroy();
    });
  });
});
