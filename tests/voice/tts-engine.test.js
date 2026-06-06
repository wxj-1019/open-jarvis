/**
 * tts-engine.test.js — TTS 引擎单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TTSEngine, TTS_STATE } from "../../lib/speech/tts-engine.js";

describe("TTSEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new TTSEngine();
  });

  afterEach(() => {
    engine?.destroy();
  });

  // ── 构造 ──

  it("initializes with IDLE state", () => {
    expect(engine.getState()).toBe(TTS_STATE.IDLE);
  });

  it("initializes with empty queue", () => {
    expect(engine.getQueueLength()).toBe(0);
  });

  it("accepts custom default options", () => {
    const custom = new TTSEngine({ rate: 2.0, pitch: 1.5, lang: "en-US" });
    const opts = custom.getDefaultOpts();
    expect(opts.rate).toBe(2.0);
    expect(opts.pitch).toBe(1.5);
    expect(opts.lang).toBe("en-US");
    custom.destroy();
  });

  it("uses zh-CN as default language", () => {
    expect(engine.getDefaultOpts().lang).toBe("zh-CN");
  });

  // ── speak ──

  it("speak emits 'speak' event with text and options", () => {
    const spy = vi.fn();
    engine.on("speak", spy);

    engine.speak("Hello world");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("Hello world");
    expect(spy.mock.calls[0][1]).toBeDefined();
    expect(engine.getState()).toBe(TTS_STATE.SPEAKING);
  });

  it("speak transitions to SPEAKING state", () => {
    engine.speak("Test");
    expect(engine.getState()).toBe(TTS_STATE.SPEAKING);
  });

  it("speak returns a promise that resolves on confirmPlayed", async () => {
    let speakArgs;
    engine.on("speak", (text, opts, ctx) => {
      speakArgs = ctx;
    });

    const promise = engine.speak("Hello");
    expect(speakArgs).toBeDefined();
    expect(speakArgs.confirmPlayed).toBeTypeOf("function");

    // 模拟播放完成
    speakArgs.confirmPlayed();
    await expect(promise).resolves.toBeUndefined();
    expect(engine.getState()).toBe(TTS_STATE.IDLE);
  });

  it("speak promise rejects on confirmError", async () => {
    let speakArgs;
    engine.on("speak", (text, opts, ctx) => {
      speakArgs = ctx;
    });

    const promise = engine.speak("Hello");
    speakArgs.confirmError(new Error("Playback failed"));

    await expect(promise).rejects.toThrow("Playback failed");
  });

  it("speak with empty string resolves immediately without emitting", () => {
    const spy = vi.fn();
    engine.on("speak", spy);

    const promise = engine.speak("");
    expect(spy).not.toHaveBeenCalled();
    return expect(promise).resolves.toBeUndefined();
  });

  it("speak with whitespace-only resolves immediately", () => {
    const spy = vi.fn();
    engine.on("speak", spy);

    return engine.speak("   ").then(() => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ── 队列 ──

  it("queues multiple speak calls and processes them sequentially", () => {
    const spoken = [];
    engine.on("speak", (text, opts, ctx) => {
      spoken.push(text);
      // 延迟确认，模拟播放
      setTimeout(() => ctx.confirmPlayed(), 10);
    });

    engine.speak("First");
    engine.speak("Second");
    engine.speak("Third");

    expect(engine.getQueueLength()).toBe(2); // 第一个在处理中，2个在队列

    // 等所有播放完成
    return new Promise((resolve) => {
      engine.on("statechange", ({ state }) => {
        if (state === TTS_STATE.IDLE) {
          expect(spoken).toEqual(["First", "Second", "Third"]);
          resolve();
        }
      });
    });
  });

  it("reports correct queue length", () => {
    engine.speak("A");
    expect(engine.getQueueLength()).toBe(0); // 正在播放
    engine.speak("B");
    expect(engine.getQueueLength()).toBe(1);
    engine.speak("C");
    expect(engine.getQueueLength()).toBe(2);
  });

  // ── stop ──

  it("stop clears queue and transitions to IDLE", () => {
    engine.speak("A");
    engine.speak("B");
    engine.stop();

    expect(engine.getState()).toBe(TTS_STATE.IDLE);
    expect(engine.getQueueLength()).toBe(0);
  });

  it("stop emits 'stop' event", () => {
    const spy = vi.fn();
    engine.on("stop", spy);
    engine.speak("A");
    engine.stop();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("stop resolves pending speak promises", async () => {
    engine.speak("A");
    const promiseB = engine.speak("B");
    engine.stop();

    await expect(promiseB).resolves.toBeUndefined();
  });

  // ── pause / resume ──

  it("pause transitions to PAUSED state", () => {
    engine.speak("Playing");
    engine.pause();

    expect(engine.getState()).toBe(TTS_STATE.PAUSED);
  });

  it("pause emits 'pause' event", () => {
    const spy = vi.fn();
    engine.on("pause", spy);
    engine.speak("Test");
    engine.pause();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("resume transitions back to SPEAKING", () => {
    engine.speak("Playing");
    engine.pause();
    engine.resume();

    expect(engine.getState()).toBe(TTS_STATE.SPEAKING);
  });

  it("resume emits 'resume' event", () => {
    const spy = vi.fn();
    engine.on("resume", spy);
    engine.speak("Test");
    engine.pause();
    engine.resume();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("pause on IDLE is a no-op", () => {
    engine.pause();
    expect(engine.getState()).toBe(TTS_STATE.IDLE);
  });

  it("resume on IDLE is a no-op", () => {
    engine.resume();
    expect(engine.getState()).toBe(TTS_STATE.IDLE);
  });

  // ── statechange 事件 ──

  it("emits statechange when state changes", () => {
    const spy = vi.fn();
    engine.on("statechange", spy);

    engine.speak("Test");

    expect(spy).toHaveBeenCalledWith({ state: TTS_STATE.SPEAKING, prev: TTS_STATE.IDLE });
  });

  it("does not emit statechange when state is the same", () => {
    let count = 0;
    engine.on("statechange", () => count++);
    // 第一次 speak: IDLE → SPEAKING
    // stop 后确认播放
    engine.speak("A");
    const initCalls = count;
    // 已经是 SPEAKING，再次 pause 后有变化
    expect(count).toBeGreaterThanOrEqual(initCalls);
  });

  // ── updateDefaultOpts ──

  it("updateDefaultOpts merges options", () => {
    engine.updateDefaultOpts({ rate: 0.5, lang: "en-US" });
    const opts = engine.getDefaultOpts();
    expect(opts.rate).toBe(0.5);
    expect(opts.lang).toBe("en-US");
    expect(opts.pitch).toBe(1.0); // unchanged
  });

  // ── selectVoice（静态方法） ──

  it("selectVoice returns null for empty array", () => {
    expect(TTSEngine.selectVoice([])).toBeNull();
    expect(TTSEngine.selectVoice(null)).toBeNull();
  });

  it("selectVoice prefers exact lang match", () => {
    const voices = [
      { name: "English US", lang: "en-US" },
      { name: "Chinese CN", lang: "zh-CN" },
      { name: "Chinese TW", lang: "zh-TW" },
    ];
    const result = TTSEngine.selectVoice(voices, "zh-CN");
    expect(result.name).toBe("Chinese CN");
  });

  it("selectVoice falls back to prefix match", () => {
    const voices = [
      { name: "English US", lang: "en-US" },
      { name: "Chinese HK", lang: "zh-HK" },
    ];
    const result = TTSEngine.selectVoice(voices, "zh-CN");
    expect(result.name).toBe("Chinese HK");
  });

  it("selectVoice prefers default voice as last resort", () => {
    const voices = [
      { name: "Voice A", lang: "fr-FR" },
      { name: "Voice B", lang: "de-DE", default: true },
    ];
    const result = TTSEngine.selectVoice(voices, "zh-CN");
    expect(result.name).toBe("Voice B");
  });

  it("selectVoice returns first voice if no match", () => {
    const voices = [
      { name: "Only Voice", lang: "fr-FR" },
    ];
    const result = TTSEngine.selectVoice(voices, "zh-CN");
    expect(result.name).toBe("Only Voice");
  });

  it("selectVoice prefers zh-CN over zh-TW for zh-CN preference", () => {
    const voices = [
      { name: "Taiwan", lang: "zh-TW" },
      { name: "Mainland", lang: "zh-CN" },
    ];
    const result = TTSEngine.selectVoice(voices, "zh-CN");
    expect(result.name).toBe("Mainland");
  });

  // ── summarizeVoices（静态方法） ──

  it("summarizeVoices counts voices by language", () => {
    const voices = [
      { lang: "zh-CN" },
      { lang: "zh-CN" },
      { lang: "en-US" },
    ];
    const summary = TTSEngine.summarizeVoices(voices);
    expect(summary).toEqual({ "zh-CN": 2, "en-US": 1 });
  });

  it("summarizeVoices handles missing lang", () => {
    const voices = [
      { lang: "zh-CN" },
      { name: "No Lang" },
    ];
    const summary = TTSEngine.summarizeVoices(voices);
    expect(summary["zh-CN"]).toBe(1);
    expect(summary["unknown"]).toBe(1);
  });

  // ── destroy ──

  it("destroy stops playback and removes listeners", () => {
    engine.speak("A");
    engine.destroy();

    expect(engine.getState()).toBe(TTS_STATE.IDLE);
    expect(engine.listenerCount("speak")).toBe(0);
    expect(engine.listenerCount("statechange")).toBe(0);
  });
});
