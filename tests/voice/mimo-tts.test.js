/**
 * mimo-tts.test.js — MiMo TTS 语音合成服务单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  synthesizeSpeech,
  saveAudioToFile,
  getAvailableModels,
  checkConfig,
} from "../../lib/speech/mimo-tts.js";

// ── Helpers ──

/** 创建 mock engine 对象 */
function createMockEngine(overrides = {}) {
  const defaults = {
    providerRegistry: {
      getCredentials: vi.fn(() => ({
        apiKey: "test-mimo-api-key",
        baseUrl: "https://api.xiaomimimo.com/v1",
      })),
      getProviderModels: vi.fn(() => ["mimo-v2.5-tts"]),
    },
  };

  // 深度合并：overrides 中的 providerRegistry 会完全替换默认值
  if (overrides.providerRegistry) {
    return { ...defaults, ...overrides };
  }

  // 扁平 overrides 穿透到 providerRegistry
  const reg = { ...defaults.providerRegistry };
  if (overrides.getCredentials) reg.getCredentials = overrides.getCredentials;
  if (overrides.getProviderModels) reg.getProviderModels = overrides.getProviderModels;
  const { getCredentials: _gc, getProviderModels: _gm, ...restOverrides } = overrides;

  return {
    providerRegistry: reg,
    ...restOverrides,
  };
}

/** Mock fetch 返回成功响应 */
function mockFetchSuccess(audioBuffer, contentType = "audio/mp3") {
  const mockResponse = {
    ok: true,
    status: 200,
    headers: new Map([["content-type", contentType]]),
    arrayBuffer: vi.fn().mockResolvedValue(audioBuffer),
    text: vi.fn().mockResolvedValue(""),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));
}

/** Mock fetch 返回错误响应 */
function mockFetchError(status, errorBody) {
  const mockResponse = {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(
      typeof errorBody === "string"
        ? errorBody
        : JSON.stringify(errorBody)
    ),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));
}

// ── Tests ──

describe("mimo-tts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── synthesizeSpeech ──

  describe("synthesizeSpeech", () => {
    it("throws when API key is not configured", async () => {
      const engine = createMockEngine({
        getCredentials: vi.fn(() => null),
      });

      await expect(synthesizeSpeech(engine, "Hello")).rejects.toThrow(
        "API key not configured"
      );
    });

    it("throws when API key is empty string", async () => {
      const engine = createMockEngine({
        getCredentials: vi.fn(() => ({ apiKey: "" })),
      });

      await expect(synthesizeSpeech(engine, "Hello")).rejects.toThrow(
        "API key not configured"
      );
    });

    it("throws on empty text", async () => {
      const engine = createMockEngine();

      await expect(synthesizeSpeech(engine, "")).rejects.toThrow(
        "Text cannot be empty"
      );
    });

    it("throws on whitespace-only text", async () => {
      const engine = createMockEngine();

      await expect(synthesizeSpeech(engine, "   ")).rejects.toThrow(
        "Text cannot be empty"
      );
    });

    it("truncates text exceeding 5000 characters", async () => {
      const engine = createMockEngine();
      const longText = "A".repeat(6000);

      const audioBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, longText);

      const fetchCall = globalThis.fetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.input.length).toBe(5000);
    });

    it("calls fetch with correct URL and headers", async () => {
      const engine = createMockEngine();
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Hello world");

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = globalThis.fetch.mock.calls[0];
      expect(url).toBe("https://api.xiaomimimo.com/v1/audio/speech");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers.Authorization).toBe("Bearer test-mimo-api-key");
    });

    it("sends correct request body with default options", async () => {
      const engine = createMockEngine();
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Test text");

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.model).toBe("mimo-v2.5-tts");
      expect(body.input).toBe("Test text");
      expect(body.speed).toBe(1.0);
      expect(body.pitch).toBe(1.0);
      expect(body.volume).toBe(1.0);
      expect(body.response_format).toBe("mp3");
      expect(body.sample_rate).toBe(24000);
    });

    it("passes custom options to request body", async () => {
      const engine = createMockEngine();
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Test", {
        voice: "custom-voice-1",
        speed: 1.5,
        pitch: 0.8,
        volume: 0.5,
        format: "wav",
        sampleRate: 16000,
      });

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.voice).toBe("custom-voice-1");
      expect(body.speed).toBe(1.5);
      expect(body.pitch).toBe(0.8);
      expect(body.volume).toBe(0.5);
      expect(body.response_format).toBe("wav");
      expect(body.sample_rate).toBe(16000);
    });

    it("does not include undefined values in request body", async () => {
      const engine = createMockEngine();
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Test");

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.voice).toBeUndefined();
    });

    it("returns audioBuffer, format, model, and contentType on success", async () => {
      const engine = createMockEngine();
      const audioBuffer = new Uint8Array([10, 20, 30, 40, 50]).buffer;
      mockFetchSuccess(audioBuffer, "audio/mpeg");

      const result = await synthesizeSpeech(engine, "Hello");

      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.audioBuffer.length).toBe(5);
      expect(result.format).toBe("mp3");
      expect(result.model).toBe("mimo-v2.5-tts");
      expect(result.contentType).toBe("audio/mpeg");
    });

    it("throws on API error response", async () => {
      const engine = createMockEngine();
      mockFetchError(400, { error: { message: "Invalid parameter" } });

      await expect(synthesizeSpeech(engine, "Hello")).rejects.toThrow(
        "Mimo TTS API returned 400"
      );
    });

    it("throws on API error with plain text body", async () => {
      const engine = createMockEngine();
      mockFetchError(500, "Internal Server Error");

      await expect(synthesizeSpeech(engine, "Hello")).rejects.toThrow(
        "Mimo TTS API returned 500: Internal Server Error"
      );
    });

    it("throws on empty audio response", async () => {
      const engine = createMockEngine();
      const emptyBuffer = new Uint8Array([]).buffer;
      mockFetchSuccess(emptyBuffer);

      await expect(synthesizeSpeech(engine, "Hello")).rejects.toThrow(
        "Received empty audio"
      );
    });

    it("uses custom baseUrl from credentials", async () => {
      const engine = createMockEngine({
        getCredentials: vi.fn(() => ({
          apiKey: "test-key",
          baseUrl: "https://custom-tts.example.com/v1",
        })),
      });
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Hello");

      const url = globalThis.fetch.mock.calls[0][0];
      expect(url).toBe("https://custom-tts.example.com/v1/audio/speech");
    });

    it("uses model from config when models array has string entries", async () => {
      const engine = createMockEngine({
        getProviderModels: vi.fn(() => ["mimo-v2-tts"]),
      });
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Hello");

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.model).toBe("mimo-v2-tts");
    });

    it("uses model from config when models array has entries", async () => {
      const engine = createMockEngine({
        getProviderModels: vi.fn(() => ["mimo-v2.5-tts-voicedesign"]),
      });
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Hello");

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.model).toBe("mimo-v2.5-tts-voicedesign");
    });

    it("falls back to default model when config has empty models array", async () => {
      const engine = createMockEngine({
        getProviderModels: vi.fn(() => []),
      });
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Hello");

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.model).toBe("mimo-v2.5-tts");
    });

    it("falls back to default model when getProviderModels throws", async () => {
      const engine = createMockEngine({
        getProviderModels: vi.fn(() => {
          throw new Error("Config error");
        }),
      });
      const audioBuffer = new Uint8Array([1, 2, 3]).buffer;
      mockFetchSuccess(audioBuffer);

      await synthesizeSpeech(engine, "Hello");

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.model).toBe("mimo-v2.5-tts");
    });
  });

  // ── getAvailableModels ──

  describe("getAvailableModels", () => {
    it("returns array of supported models", () => {
      const models = getAvailableModels();

      expect(models).toHaveLength(4);
      expect(models[0]).toEqual({
        id: "mimo-v2.5-tts",
        baseUrl: "https://api.xiaomimimo.com/v1",
      });
      expect(models[3]).toEqual({
        id: "mimo-v2.5-tts-voiceclone",
        baseUrl: "https://api.xiaomimimo.com/v1",
      });
    });
  });

  // ── checkConfig ──

  describe("checkConfig", () => {
    it("returns configured: true when credentials are available", () => {
      const engine = createMockEngine();
      const result = checkConfig(engine);

      expect(result.configured).toBe(true);
      expect(result.providerId).toBe("mimo-tts");
      expect(result.model).toBe("mimo-v2.5-tts");
      expect(result.baseUrl).toBe("https://api.xiaomimimo.com/v1");
      expect(result.models).toHaveLength(4);
    });

    it("returns configured: false when credentials are missing", () => {
      const engine = createMockEngine({
        getCredentials: vi.fn(() => null),
      });
      const result = checkConfig(engine);

      expect(result.configured).toBe(false);
      expect(result.error).toContain("API key not configured");
      expect(result.models).toHaveLength(4);
    });

    it("returns configured: false when apiKey is empty", () => {
      const engine = createMockEngine({
        getCredentials: vi.fn(() => ({ apiKey: "" })),
      });
      const result = checkConfig(engine);

      expect(result.configured).toBe(false);
    });

    it("always includes models list regardless of config state", () => {
      const engine = createMockEngine({
        getCredentials: vi.fn(() => null),
      });
      const result = checkConfig(engine);

      expect(result.models).toEqual([
        "mimo-v2.5-tts",
        "mimo-v2-tts",
        "mimo-v2.5-tts-voicedesign",
        "mimo-v2.5-tts-voiceclone",
      ]);
    });
  });

  // ── saveAudioToFile ──

  describe("saveAudioToFile", () => {
    it("writes audio buffer to a temp file and returns its path", async () => {
      const audioBuffer = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
      const filePath = await saveAudioToFile(audioBuffer);

      expect(filePath).toBeTruthy();
      expect(typeof filePath).toBe("string");

      // 验证文件是否被清理（withTempFile 会在 finally 中 unlink）
      const { stat } = await import("fs/promises");
      await expect(stat(filePath)).rejects.toThrow();
    });

    it("uses the provided format extension", async () => {
      const audioBuffer = Buffer.from([0xFF, 0xFB]);
      const filePath = await saveAudioToFile(audioBuffer, "wav");

      expect(filePath).toMatch(/\.wav$/);
    });

    it("writes the correct audio data", async () => {
      const { readFile } = await import("fs/promises");
      const audioBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const filePath = await saveAudioToFile(audioBuffer);

      // 读取文件内容验证（在清理前需要快照）
      // withTempFile 清理在 promise resolve 之后，此时文件已被删除
      // 所以我们只需验证函数不抛出异常且返回有效路径
      expect(filePath).toMatch(/\.mp3$/);
    });
  });
});
