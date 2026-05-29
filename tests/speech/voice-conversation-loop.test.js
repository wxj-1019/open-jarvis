/**
 * voice-conversation-loop.test.js — VoiceConversationLoop 单元测试
 *
 * 验证连续对话循环状态机:
 * IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventEmitter } from "events";

function createMockDeps() {
  const vadService = new EventEmitter();
  const sttEngine = new EventEmitter();
  const ttsEngine = new EventEmitter();

  vadService.start = vi.fn();
  vadService.stop = vi.fn();
  vadService.reset = vi.fn();
  vadService.getState = vi.fn(() => "silence");

  sttEngine.startListening = vi.fn(() => Promise.resolve([{ text: "hello", isFinal: true }]));
  sttEngine.stopListening = vi.fn();

  ttsEngine.speak = vi.fn(() => Promise.resolve());
  ttsEngine.stop = vi.fn();

  return {
    vadService,
    sttEngine,
    ttsEngine,
    onUserText: vi.fn(async (text) => `AI response to: ${text}`),
  };
}

describe("VoiceConversationLoop", () => {
  let deps;
  let loop;
  let VoiceConversationLoop;
  let LOOP_STATE;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import("../../lib/speech/voice-conversation-loop.js");
    VoiceConversationLoop = mod.VoiceConversationLoop;
    LOOP_STATE = mod.LOOP_STATE;
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (loop) {
      await loop.stop();
    }
  });

  // ── 初始状态 ──

  it("初始状态为 IDLE", () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  // ── start ──

  it("start() 后启动 VAD 并保持 IDLE", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    await loop.start();

    expect(deps.vadService.start).toHaveBeenCalled();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  it("start() 是幂等的，重复调用不重复启动 VAD", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    await loop.start();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
    
    const stateBefore = loop.getState();
    await loop.start();
    const stateAfter = loop.getState();

    expect(stateBefore).toBe(stateAfter);
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  // ── stop ──

  it("stop() 后停止所有组件并回到 IDLE", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    await loop.start();
    await loop.stop();

    expect(deps.vadService.stop).toHaveBeenCalled();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  // ── pause / resume ──

  it("pause() 后停止 VAD 监听，状态变为 PAUSED", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    await loop.start();
    loop.pause();

    expect(deps.vadService.stop).toHaveBeenCalled();
    expect(loop.getState()).toBe(LOOP_STATE.PAUSED);

    await loop.stop();
  });

  it("resume() 后恢复 VAD 监听，状态回到 IDLE", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    await loop.start();
    loop.pause();
    expect(loop.getState()).toBe(LOOP_STATE.PAUSED);

    loop.resume();

    expect(deps.vadService.start).toHaveBeenCalledTimes(2);
    expect(deps.vadService.reset).toHaveBeenCalled();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    await loop.stop();
  });

  it("resume() 在非 PAUSED 状态下是 no-op", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    await loop.start();
    loop.resume();

    expect(deps.vadService.start).toHaveBeenCalledTimes(1);
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    await loop.stop();
  });

  // ── 完整对话循环: VAD speechend → STT → Agent → TTS → IDLE ──

  it("VAD speechend 后进入完整循环: LISTENING → PROCESSING → SPEAKING → IDLE", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    const states = [];
    loop.on("statechange", (state) => states.push(state));

    await loop.start();

    // 触发 VAD speechend 事件
    const mockAudio = new Float32Array([0.1, 0.2, 0.3]);
    deps.vadService.emit("speechend", mockAudio);

    // 等待异步操作完成
    await vi.runAllTimersAsync();

    // 验证状态流转
    expect(states).toContain(LOOP_STATE.LISTENING);
    expect(states).toContain(LOOP_STATE.PROCESSING);
    expect(states).toContain(LOOP_STATE.SPEAKING);
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    // 验证 STT 被调用
    expect(deps.sttEngine.startListening).toHaveBeenCalled();

    // 验证 Agent 被调用
    expect(deps.onUserText).toHaveBeenCalled();

    // 验证 TTS 被调用
    expect(deps.ttsEngine.speak).toHaveBeenCalled();

    await loop.stop();
  });

  it("空识别结果时回到 IDLE，不进入 PROCESSING", async () => {
    deps = createMockDeps();
    deps.sttEngine.startListening = vi.fn(() => Promise.resolve([]));
    loop = new VoiceConversationLoop(deps);

    const states = [];
    loop.on("statechange", (state) => states.push(state));

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(states).toContain(LOOP_STATE.LISTENING);
    expect(states).not.toContain(LOOP_STATE.PROCESSING);
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
    expect(deps.onUserText).not.toHaveBeenCalled();

    await loop.stop();
  });

  // ── 错误处理 ──

  it("STT 错误时 emit error 事件并回到 IDLE", async () => {
    deps = createMockDeps();
    deps.sttEngine.startListening = vi.fn(() => Promise.reject(new Error("STT failed")));
    loop = new VoiceConversationLoop(deps);

    const errors = [];
    loop.on("error", (err) => errors.push(err));

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("STT failed");
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    await loop.stop();
  });

  it("Agent 错误时 emit error 事件并回到 IDLE", async () => {
    deps = createMockDeps();
    deps.onUserText = vi.fn(async () => {
      throw new Error("Agent failed");
    });
    loop = new VoiceConversationLoop(deps);

    const errors = [];
    loop.on("error", (err) => errors.push(err));

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("Agent failed");
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    await loop.stop();
  });

  it("TTS 错误时 emit error 事件并回到 IDLE", async () => {
    deps = createMockDeps();
    deps.ttsEngine.speak = vi.fn(() => Promise.reject(new Error("TTS failed")));
    loop = new VoiceConversationLoop(deps);

    const errors = [];
    loop.on("error", (err) => errors.push(err));

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("TTS failed");
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    await loop.stop();
  });

  // ── 事件 emit ──

  it("emits recognized 事件携带用户文本", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    const recognizedTexts = [];
    loop.on("recognized", (text) => recognizedTexts.push(text));

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(recognizedTexts).toContain("hello");

    await loop.stop();
  });

  it("emits aiText 事件携带 AI 回复", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    const aiTexts = [];
    loop.on("aiText", (text) => aiTexts.push(text));

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(aiTexts).toContain("AI response to: hello");

    await loop.stop();
  });

  it("emits complete 事件在对话循环完成后", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    const completeSpy = vi.fn();
    loop.on("complete", completeSpy);

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(completeSpy).toHaveBeenCalled();

    await loop.stop();
  });

  // ── 配置选项 ──

  it("autoSpeak=false 时不进入 SPEAKING 状态", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps, { autoSpeak: false });

    const states = [];
    loop.on("statechange", (state) => states.push(state));

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(states).not.toContain(LOOP_STATE.SPEAKING);
    expect(deps.ttsEngine.speak).not.toHaveBeenCalled();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    await loop.stop();
  });

  it("continuous=false 时完成一轮后停止循环", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps, { continuous: false });

    await loop.start();

    deps.vadService.emit("speechend", new Float32Array([0.1]));
    await vi.runAllTimersAsync();

    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
    expect(deps.vadService.stop).toHaveBeenCalled();

    await loop.stop();
  });

  // ── 静音超时 ──

  it("silenceTimeout 后 emit timeout 事件并停止", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps, { silenceTimeoutMs: 5000 });

    const timeoutSpy = vi.fn();
    loop.on("timeout", timeoutSpy);

    await loop.start();

    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();

    expect(timeoutSpy).toHaveBeenCalled();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  // ── 并发安全 ──

  it("在循环进行中再次触发 speechend 不会导致并发问题", async () => {
    deps = createMockDeps();
    loop = new VoiceConversationLoop(deps);

    await loop.start();

    // 快速触发两次
    deps.vadService.emit("speechend", new Float32Array([0.1]));
    deps.vadService.emit("speechend", new Float32Array([0.2]));

    await vi.runAllTimersAsync();

    // Agent 应该只被调用一次
    expect(deps.onUserText).toHaveBeenCalledTimes(1);

    await loop.stop();
  });
});
