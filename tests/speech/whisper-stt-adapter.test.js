/**
 * whisper-stt-adapter.test.js — WhisperSTTAdapter 单元测试
 *
 * 验证 Whisper STT 适配器的核心功能：
 * - 转录音频 Blob
 * - API Key 获取逻辑
 * - 重试机制
 * - 超时控制
 * - 错误处理
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventEmitter } from "events";

function createMockProviderRegistry(overrides = {}) {
  const registry = new EventEmitter();
  registry.getCredentials = vi.fn(() => overrides.credentials || { apiKey: "test-api-key" });
  registry.getConfig = vi.fn(() => overrides.config || {});
  return registry;
}

function createMockBlob(content = "audio-data", type = "audio/webm") {
  return new Blob([content], { type });
}

describe("WhisperSTTAdapter", () => {
  let adapter;
  let WhisperSTTAdapter;
  let WHISPER_STT_STATE;
  let mockFetch;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import("../../lib/speech/whisper-stt-adapter.js");
    WhisperSTTAdapter = mod.WhisperSTTAdapter;
    WHISPER_STT_STATE = mod.WHISPER_STT_STATE;

    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (adapter) {
      adapter.destroy();
    }
    vi.restoreAllMocks();
  });

  // ── 初始状态 ──

  it("初始状态为 IDLE", () => {
    adapter = new WhisperSTTAdapter();
    expect(adapter.getState()).toBe(WHISPER_STT_STATE.IDLE);
  });

  // ── 输入验证 ──

  it("非 Blob 输入抛出错误", async () => {
    adapter = new WhisperSTTAdapter();
    await expect(adapter.transcribe(null)).rejects.toThrow("Invalid audio: expected Blob");
    await expect(adapter.transcribe(new ArrayBuffer(8))).rejects.toThrow("Invalid audio: expected Blob");
  });

  it("空 Blob 抛出错误", async () => {
    adapter = new WhisperSTTAdapter();
    const emptyBlob = new Blob([], { type: "audio/webm" });
    await expect(adapter.transcribe(emptyBlob)).rejects.toThrow("Empty audio blob");
  });

  // ── API Key 获取 ──

  it("优先从 provider-registry 获取 API Key", async () => {
    const registry = createMockProviderRegistry({
      credentials: { apiKey: "registry-key" },
    });
    adapter = new WhisperSTTAdapter({ providerRegistry: registry });

    const apiKey = await adapter._getApiKey();
    expect(apiKey).toBe("registry-key");
    expect(registry.getCredentials).toHaveBeenCalledWith("openai");
  });

  it("provider-registry 失败时回退环境变量", async () => {
    const registry = createMockProviderRegistry({
      credentials: { apiKey: "" },
    });
    adapter = new WhisperSTTAdapter({ providerRegistry: registry });

    const originalEnv = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "env-key";

    const apiKey = await adapter._getApiKey();
    expect(apiKey).toBe("env-key");

    process.env.OPENAI_API_KEY = originalEnv;
  });

  it("无 API Key 配置时抛出错误", async () => {
    const registry = createMockProviderRegistry({
      credentials: { apiKey: "" },
    });
    adapter = new WhisperSTTAdapter({ providerRegistry: registry });

    const originalEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(adapter.transcribe(createMockBlob())).rejects.toThrow(
      "OpenAI API key not configured"
    );

    process.env.OPENAI_API_KEY = originalEnv;
  });

  // ── 成功转录 ──

  it("成功转录返回 { text, confidence, language }", async () => {
    const registry = createMockProviderRegistry();
    adapter = new WhisperSTTAdapter({ providerRegistry: registry });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          text: "Hello world",
          confidence: 0.95,
          language: "en",
        }),
    });

    const result = await adapter.transcribe(createMockBlob());

    expect(result).toEqual({
      text: "Hello world",
      confidence: 0.95,
      language: "en",
    });
    expect(adapter.getState()).toBe(WHISPER_STT_STATE.IDLE);
  });

  it("使用正确的 URL 和 Authorization header", async () => {
    const registry = createMockProviderRegistry({
      credentials: { apiKey: "test-key" },
    });
    adapter = new WhisperSTTAdapter({
      providerRegistry: registry,
      serverUrl: "http://localhost:3000",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "test" }),
    });

    await adapter.transcribe(createMockBlob());

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/voice/transcribe",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
        },
      })
    );
  });

  // ── 重试机制 ──

  it("可重试错误时自动重试", async () => {
    adapter = new WhisperSTTAdapter();

    mockFetch
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: "success" }),
      });

    const resultPromise = adapter.transcribe(createMockBlob());

    await vi.runAllTimersAsync();

    const result = await resultPromise;
    expect(result.text).toBe("success");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("不可重试错误时不重试", async () => {
    adapter = new WhisperSTTAdapter();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
      json: () => Promise.resolve({}),
    });

    await expect(adapter.transcribe(createMockBlob())).rejects.toThrow(
      "Invalid OpenAI API key"
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("重试次数用尽后抛出错误", async () => {
    adapter = new WhisperSTTAdapter();

    mockFetch
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"));

    const resultPromise = adapter.transcribe(createMockBlob());

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow("timeout");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ── 超时控制 ──

  it("请求超时时抛出超时错误", async () => {
    adapter = new WhisperSTTAdapter({ timeoutMs: 1000 });

    // mock fetch 模拟一个永远不会完成的请求
    // 使用 AbortSignal 来触发超时
    mockFetch.mockImplementation(async (url, options) => {
      // 等待直到 signal 被 abort
      if (options?.signal) {
        return new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => {
            const reason = options.signal.reason || new Error('Transcription timeout');
            reject(reason);
          });
        });
      }
      return new Promise(() => {});
    });

    const resultPromise = adapter.transcribe(createMockBlob());

    // 推进时间触发超时
    await vi.advanceTimersByTimeAsync(1100);
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow("Transcription timeout (30s exceeded)");
  });

  // ── 错误处理 ──

  it("401 错误返回明确消息", async () => {
    adapter = new WhisperSTTAdapter();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
      json: () => Promise.resolve({}),
    });

    await expect(adapter.transcribe(createMockBlob())).rejects.toThrow(
      "Invalid OpenAI API key"
    );
  });

  it("429 错误返回限流消息", async () => {
    adapter = new WhisperSTTAdapter();

    // 429 是可重试错误，会重试 2 次，需要 mock 两次
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limit exceeded"),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limit exceeded"),
        json: () => Promise.resolve({}),
      });

    const resultPromise = adapter.transcribe(createMockBlob());
    
    // 推进时间以完成重试延迟
    await vi.advanceTimersByTimeAsync(3000);
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow(
      "Rate limit exceeded. Please try again later."
    );
  });

  it("5xx 错误返回服务器错误消息", async () => {
    adapter = new WhisperSTTAdapter();

    // 5xx 是可重试错误，会重试 2 次，需要 mock 两次
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal server error"),
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal server error"),
        json: () => Promise.resolve({}),
      });

    const resultPromise = adapter.transcribe(createMockBlob());
    
    // 推进时间以完成重试延迟
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow(
      "Server error (500)"
    );
  });

  // ── 取消 ──

  it("cancel() 中止当前请求", async () => {
    adapter = new WhisperSTTAdapter();

    // mock fetch 模拟一个永远不会完成的请求
    mockFetch.mockImplementation(async (url, options) => {
      if (options?.signal) {
        return new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => {
            const reason = options.signal.reason || new Error('Transcription canceled');
            reject(reason);
          });
        });
      }
      return new Promise(() => {});
    });

    const resultPromise = adapter.transcribe(createMockBlob());

    await vi.runAllTicks();
    adapter.cancel();

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toThrow("Transcription canceled");
    expect(adapter.getState()).toBe(WHISPER_STT_STATE.IDLE);
  });

  // ── 状态变化事件 ──

  it("转录过程中触发 statechange 事件", async () => {
    adapter = new WhisperSTTAdapter();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "test" }),
    });

    const states = [];
    adapter.on("statechange", ({ state, prev }) => states.push({ state, prev }));

    await adapter.transcribe(createMockBlob());

    expect(states).toContainEqual({ state: "transcribing", prev: "idle" });
    expect(states).toContainEqual({ state: "idle", prev: "transcribing" });
  });

  // ── 语言设置 ──

  it("setLanguage() 更新语言", () => {
    adapter = new WhisperSTTAdapter({ lang: "zh" });
    adapter.setLanguage("en");
    expect(adapter._lang).toBe("en");
  });

  // ── 销毁 ──

  it("destroy() 清理所有监听器", () => {
    adapter = new WhisperSTTAdapter();
    const spy = vi.fn();
    adapter.on("statechange", spy);

    adapter.destroy();

    expect(adapter.listenerCount("statechange")).toBe(0);
  });
});
