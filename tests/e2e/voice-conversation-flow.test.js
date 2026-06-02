/**
 * voice-conversation-flow.test.js — 语音对话端到端测试
 *
 * 验证完整语音对话流程（VAD → STT → Agent → TTS）
 * 覆盖正常流程和异常场景
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import { VoiceConversationLoop, LOOP_STATE } from "../../lib/speech/voice-conversation-loop.js";

function createMockDeps() {
  const vadService = new EventEmitter();
  vadService.start = vi.fn();
  vadService.stop = vi.fn();
  vadService.reset = vi.fn();
  vadService.getState = vi.fn(() => "idle");

  const sttEngine = new EventEmitter();
  sttEngine.startListening = vi.fn(() => Promise.resolve([]));
  sttEngine.stopListening = vi.fn();

  const ttsEngine = new EventEmitter();
  ttsEngine.speak = vi.fn(() => Promise.resolve());
  ttsEngine.stop = vi.fn();

  const whisperSTTAdapter = {
    transcribe: vi.fn().mockResolvedValue({
      text: "你好世界",
      confidence: 0.95,
      language: "zh",
    }),
  };

  return {
    vadService,
    sttEngine,
    ttsEngine,
    whisperSTTAdapter,
    onUserText: vi.fn(async (text) => `AI response to: ${text}`),
  };
}

describe("Voice Conversation E2E Flow", () => {
  let loop;
  let mockDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDeps = createMockDeps();
  });

  afterEach(async () => {
    if (loop) {
      await loop.stop();
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should complete full conversation flow: IDLE → LISTENING → PROCESSING → SPEAKING → IDLE", async () => {
    loop = new VoiceConversationLoop(mockDeps);

    const states = [];
    loop.on("statechange", (state) => states.push(state));

    await loop.start();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
    expect(mockDeps.vadService.start).toHaveBeenCalled();

    const mockAudioBlob = new Blob(["test audio"], { type: "audio/webm" });
    mockDeps.vadService.emit("speechend", mockAudioBlob);

    await vi.runAllTimersAsync();

    expect(mockDeps.whisperSTTAdapter.transcribe).toHaveBeenCalledWith(mockAudioBlob);
    expect(mockDeps.onUserText).toHaveBeenCalledWith("你好世界");
    expect(mockDeps.ttsEngine.speak).toHaveBeenCalledWith("AI response to: 你好世界");

    expect(states).toContain(LOOP_STATE.LISTENING);
    expect(states).toContain(LOOP_STATE.PROCESSING);
    expect(states).toContain(LOOP_STATE.SPEAKING);
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  it("should handle STT failure gracefully", async () => {
    mockDeps.whisperSTTAdapter.transcribe.mockRejectedValue(
      new Error("Whisper API timeout")
    );

    loop = new VoiceConversationLoop(mockDeps);

    const errors = [];
    loop.on("error", (err) => errors.push(err));

    await loop.start();

    const mockAudioBlob = new Blob(["silence"], { type: "audio/webm" });
    mockDeps.vadService.emit("speechend", mockAudioBlob);

    await vi.runAllTimersAsync();

    expect(mockDeps.onUserText).not.toHaveBeenCalled();
    expect(mockDeps.ttsEngine.speak).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("Whisper API timeout");
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  it("should handle empty speech recognition result", async () => {
    mockDeps.whisperSTTAdapter.transcribe.mockResolvedValue({
      text: "",
      confidence: 0,
      language: "zh",
    });

    loop = new VoiceConversationLoop(mockDeps);

    const states = [];
    loop.on("statechange", (state) => states.push(state));

    await loop.start();

    const mockAudioBlob = new Blob(["silence"], { type: "audio/webm" });
    mockDeps.vadService.emit("speechend", mockAudioBlob);

    await vi.runAllTimersAsync();

    expect(mockDeps.onUserText).not.toHaveBeenCalled();
    expect(mockDeps.ttsEngine.speak).not.toHaveBeenCalled();
    expect(states).toContain(LOOP_STATE.LISTENING);
    expect(states).not.toContain(LOOP_STATE.PROCESSING);
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  it("should support pause and resume during conversation", async () => {
    loop = new VoiceConversationLoop(mockDeps);
    await loop.start();

    expect(loop.getState()).toBe(LOOP_STATE.IDLE);

    loop.pause();
    expect(loop.getState()).toBe(LOOP_STATE.PAUSED);
    expect(mockDeps.vadService.stop).toHaveBeenCalled();

    loop.resume();
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
    expect(mockDeps.vadService.start).toHaveBeenCalledTimes(2);
    expect(mockDeps.vadService.reset).toHaveBeenCalled();

    await loop.stop();
  });

  it("should handle TTS failure without crashing", async () => {
    mockDeps.ttsEngine.speak.mockRejectedValue(
      new Error("TTS service unavailable")
    );

    loop = new VoiceConversationLoop(mockDeps);

    const errors = [];
    loop.on("error", (err) => errors.push(err));

    await loop.start();

    const mockAudioBlob = new Blob(["audio"], { type: "audio/webm" });
    mockDeps.vadService.emit("speechend", mockAudioBlob);

    await vi.runAllTimersAsync();

    expect(mockDeps.onUserText).toHaveBeenCalledWith("你好世界");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("TTS service unavailable");
    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
  });

  it("should cancel ongoing transcription on stop", async () => {
    let resolveTranscribe;
    mockDeps.whisperSTTAdapter.transcribe.mockImplementation(() => {
      return new Promise((resolve) => {
        resolveTranscribe = resolve;
      });
    });

    loop = new VoiceConversationLoop(mockDeps);
    await loop.start();

    const mockAudioBlob = new Blob(["audio"], { type: "audio/webm" });
    mockDeps.vadService.emit("speechend", mockAudioBlob);

    await vi.runAllTicks();

    await loop.stop();

    if (resolveTranscribe) {
      resolveTranscribe({ text: "should be ignored", confidence: 1 });
    }

    await vi.runAllTimersAsync();

    expect(loop.getState()).toBe(LOOP_STATE.IDLE);
    expect(mockDeps.onUserText).not.toHaveBeenCalled();
  });
});
