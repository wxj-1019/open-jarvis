/**
 * voice-pipeline.test.js — 语音流水线单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STTEngine } from "../../lib/speech/stt-engine.js";
import { TTSEngine } from "../../lib/speech/tts-engine.js";
import { VoicePipeline, PIPELINE_STATE } from "../../lib/speech/voice-pipeline.js";

describe("VoicePipeline", () => {
  let sttEngine;
  let ttsEngine;
  let pipeline;
  let onUserText;

  beforeEach(() => {
    sttEngine = new STTEngine();
    ttsEngine = new TTSEngine();
    onUserText = vi.fn().mockResolvedValue("Agent response text");

    // 自动确认 TTS 播放完成，避免测试因等待 confirmPlayed() 而超时
    ttsEngine.on("speak", (_text, _opts, callbacks) => {
      callbacks.confirmPlayed();
    });

    pipeline = new VoicePipeline(
      { sttEngine, ttsEngine, onUserText },
      { lang: "zh-CN" }
    );
  });

  afterEach(() => {
    pipeline?.destroy();
    sttEngine?.destroy();
    ttsEngine?.destroy();
  });

  // ── 构造 ──

  it("initializes with IDLE state", () => {
    expect(pipeline.getState()).toBe(PIPELINE_STATE.IDLE);
  });

  it("has no session initially", () => {
    expect(pipeline.getSession()).toBeNull();
  });

  it("returns default options", () => {
    const opts = pipeline.getOptions();
    expect(opts.lang).toBe("zh-CN");
    expect(opts.autoSpeak).toBe(true);
  });

  it("updateOptions merges new options", () => {
    pipeline.updateOptions({ lang: "en-US", autoSpeak: false });
    const opts = pipeline.getOptions();
    expect(opts.lang).toBe("en-US");
    expect(opts.autoSpeak).toBe(false);
  });

  // ── start（完整流程） ──

  it("completes full pipeline: STT → Agent → TTS", async () => {
    const states = [];
    pipeline.on("statechange", ({ state }) => states.push(state));

    const ttsSpy = vi.fn();
    ttsEngine.on("speak", ttsSpy);

    // 启动流水线（异步）
    const pipelinePromise = pipeline.start({ silenceTimeout: 0, timeout: 0 });

    // 模拟 STT 识别
    sttEngine.onResult({ text: "Hello Jarvis", isFinal: true });
    sttEngine.onEnd();

    const session = await pipelinePromise;

    expect(session.userText).toBe("Hello Jarvis");
    expect(session.agentText).toBe("Agent response text");
    expect(onUserText).toHaveBeenCalledWith("Hello Jarvis");
    expect(states).toContain(PIPELINE_STATE.LISTENING);
    expect(states).toContain(PIPELINE_STATE.PROCESSING);
  });

  it("emits 'recognized' event after STT", async () => {
    const spy = vi.fn();
    pipeline.on("recognized", spy);

    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "Test", isFinal: true });
    sttEngine.onEnd();
    await promise;

    expect(spy).toHaveBeenCalledWith("Test");
  });

  it("emits 'speaking' event when TTS starts", async () => {
    const spy = vi.fn();
    pipeline.on("speaking", spy);

    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "Test", isFinal: true });
    sttEngine.onEnd();
    await promise;

    // TTS 应该在 autoSpeak 模式下触发
    if (pipeline.getOptions().autoSpeak) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it("emits 'complete' event at end", async () => {
    const spy = vi.fn();
    pipeline.on("complete", spy);

    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "Done", isFinal: true });
    sttEngine.onEnd();
    const session = await promise;

    expect(spy).toHaveBeenCalledWith(session);
    expect(pipeline.getSession()).toMatchObject({
      userText: "Done",
      agentText: expect.any(String),
    });
  });

  // ── 空识别 ──

  it("throws when no speech is recognized", async () => {
    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onEnd(); // 没有 final result

    await expect(promise).rejects.toThrow("No speech recognized");
    expect(onUserText).not.toHaveBeenCalled();
  });

  // ── cancel ──

  it("cancel during listening stops pipeline", async () => {
    const promise = pipeline.start();
    pipeline.cancel();

    await expect(promise).rejects.toThrow("Pipeline cancelled");
    expect(pipeline.getState()).toBe(PIPELINE_STATE.IDLE);
  });

  it("cancel emits 'cancelled' event", async () => {
    const spy = vi.fn();
    pipeline.on("cancelled", spy);

    const promise = pipeline.start();
    pipeline.cancel();

    try { await promise; } catch {}
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── Agent 处理失败 ──

  it("handles Agent processing error gracefully", async () => {
    onUserText.mockRejectedValueOnce(new Error("Agent error"));

    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "Query", isFinal: true });
    sttEngine.onEnd();

    const session = await promise;
    expect(session.agentText).toBe("");
    expect(session.userText).toBe("Query");
  });

  // ── autoSpeak 关闭 ──

  it("skips TTS when autoSpeak is false", async () => {
    pipeline.updateOptions({ autoSpeak: false });

    const ttsSpy = vi.fn();
    ttsEngine.on("speak", ttsSpy);

    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "Test", isFinal: true });
    sttEngine.onEnd();
    await promise;

    expect(ttsSpy).not.toHaveBeenCalled();
  });

  // ── statechange ──

  it("transitions through correct states", async () => {
    const states = [];
    pipeline.on("statechange", ({ state }) => states.push(state));

    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "Hello", isFinal: true });
    sttEngine.onEnd();
    await promise;

    expect(states).toContain(PIPELINE_STATE.LISTENING);
    expect(states).toContain(PIPELINE_STATE.PROCESSING);
    expect(states[states.length - 1]).toBe(PIPELINE_STATE.IDLE);
  });

  // ── 重新启动 ──

  it("can restart after completion", async () => {
    // 第一次
    let promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "First", isFinal: true });
    sttEngine.onEnd();
    await promise;

    // 第二次
    promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    sttEngine.onResult({ text: "Second", isFinal: true });
    sttEngine.onEnd();
    const session = await promise;

    expect(session.userText).toBe("Second");
  });

  it("rejects if start when not IDLE", async () => {
    const promise1 = pipeline.start();
    await expect(pipeline.start()).rejects.toThrow("Pipeline is not idle");

    pipeline.cancel();
    try { await promise1; } catch {}
  });

  // ── error 事件 ──

  it("emits 'error' and sets ERROR state on empty recognition", async () => {
    const errorSpy = vi.fn();
    pipeline.on("error", errorSpy);

    const promise = pipeline.start({ silenceTimeout: 0, timeout: 0 });
    // 没有 final result，直接 end
    sttEngine.onEnd();

    await expect(promise).rejects.toThrow("No speech recognized");
    expect(errorSpy).toHaveBeenCalled();
  });

  // ── destroy ──

  it("destroy cancels and removes listeners", async () => {
    const promise = pipeline.start();
    pipeline.destroy();

    try { await promise; } catch {}
    expect(pipeline.listenerCount("statechange")).toBe(0);
  });
});
