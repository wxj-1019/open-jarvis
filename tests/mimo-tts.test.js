/**
 * mimo-tts.test.js — Mimo TTS 单元测试
 *
 * 测试 Mimo TTS API 调用模块和路由
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createTTSRoute } from "../server/routes/tts.js";
import * as mimoTts from "../lib/speech/mimo-tts.js";

describe("Mimo TTS", () => {
  let app;
  let mockEngine;

  beforeEach(() => {
    mockEngine = {
      hanakoHome: "/tmp/test-hanako",
      getConfig: vi.fn(),
    };

    app = new Hono();
    app.route("/api", createTTSRoute(mockEngine));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MIMO_API_KEY;
    delete process.env.MIMO_TTS_MODEL;
    delete process.env.MIMO_TTS_BASE_URL;
  });

  // ── GET /api/tts/config ──

  describe("GET /api/tts/config", () => {
    it("returns configured: true when MIMO_API_KEY is set", async () => {
      process.env.MIMO_API_KEY = "test-mimo-key";

      const res = await app.request("/api/tts/config");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mimo).toMatchObject({
        configured: true,
        model: "mimo-v2.5-tts",
      });
      expect(data.mimo.models).toContain("mimo-v2.5-tts");
    });

    it("returns configured: false when MIMO_API_KEY is missing", async () => {
      const res = await app.request("/api/tts/config");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mimo).toMatchObject({
        configured: false,
      });
      expect(data.mimo.error).toContain("MIMO_API_KEY");
    });

    it("returns custom model when configured", async () => {
      process.env.MIMO_API_KEY = "test-key";
      process.env.MIMO_TTS_MODEL = "mimo-v2-tts";

      const res = await app.request("/api/tts/config");
      const data = await res.json();

      expect(data.mimo).toMatchObject({
        configured: true,
        model: "mimo-v2-tts",
      });
    });
  });

  // ── GET /api/tts/models ──

  describe("GET /api/tts/models", () => {
    it("returns list of available Mimo models", async () => {
      const res = await app.request("/api/tts/models");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mimo).toBeInstanceOf(Array);
      expect(data.mimo.length).toBeGreaterThan(0);
      expect(data.mimo[0]).toHaveProperty("id");
      expect(data.mimo[0]).toHaveProperty("baseUrl");
    });

    it("includes all supported models", async () => {
      const res = await app.request("/api/tts/models");
      const data = await res.json();

      const modelIds = data.mimo.map((m) => m.id);
      expect(modelIds).toContain("mimo-v2.5-tts");
      expect(modelIds).toContain("mimo-v2-tts");
      expect(modelIds).toContain("mimo-v2.5-tts-voicedesign");
      expect(modelIds).toContain("mimo-v2.5-tts-voiceclone");
    });
  });

  // ── POST /api/tts/synthesize ──

  describe("POST /api/tts/synthesize", () => {
    it("rejects missing text", async () => {
      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Text is required");
    });

    it("rejects empty text", async () => {
      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "   " }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Text is required");
    });

    it("rejects text too long (>5000 chars)", async () => {
      const longText = "A".repeat(5001);

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: longText }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("too long");
    });

    it("rejects unsupported engine", async () => {
      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello", engine: "invalid" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Unsupported TTS engine");
    });

    it("calls Mimo TTS with correct parameters", async () => {
      process.env.MIMO_API_KEY = "test-mimo-key";

      // Mock Mimo TTS function
      const mockSynthesize = vi
        .spyOn(mimoTts, "synthesizeSpeech")
        .mockResolvedValue({
          audioBuffer: Buffer.from([0x00, 0x01, 0x02]),
          format: "mp3",
          contentType: "audio/mp3",
        });

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "你好世界",
          engine: "mimo",
          model: "mimo-v2.5-tts",
          speed: 1.2,
        }),
      });

      expect(res.status).toBe(200);
      expect(mockSynthesize).toHaveBeenCalledWith("你好世界", {
        model: "mimo-v2.5-tts",
        voice: undefined,
        speed: 1.2,
        pitch: undefined,
        volume: undefined,
        format: "mp3",
      });

      // Verify response headers
      expect(res.headers.get("X-TTS-Engine")).toBe("mimo");
      expect(res.headers.get("Content-Type")).toBe("audio/mp3");

      mockSynthesize.mockRestore();
    });

    it("returns 401 when MIMO_API_KEY not configured", async () => {
      // Mock to throw API key error
      const mockSynthesize = vi
        .spyOn(mimoTts, "synthesizeSpeech")
        .mockRejectedValue(new Error("MIMO_API_KEY not configured"));

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Mimo API key not configured");

      mockSynthesize.mockRestore();
    });

    it("handles TTS API errors gracefully", async () => {
      process.env.MIMO_API_KEY = "test-key";

      const mockSynthesize = vi
        .spyOn(mimoTts, "synthesizeSpeech")
        .mockRejectedValue(new Error("API error: Invalid model"));

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello" }),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("API error");

      mockSynthesize.mockRestore();
    });

    it("accepts all optional parameters", async () => {
      process.env.MIMO_API_KEY = "test-key";

      const mockSynthesize = vi
        .spyOn(mimoTts, "synthesizeSpeech")
        .mockResolvedValue({
          audioBuffer: Buffer.from([0x00]),
          format: "wav",
          contentType: "audio/wav",
        });

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "测试",
          model: "mimo-v2.5-tts-voicedesign",
          voice: "custom-voice-123",
          speed: 0.8,
          pitch: 1.2,
          volume: 0.9,
          format: "wav",
        }),
      });

      expect(res.status).toBe(200);
      expect(mockSynthesize).toHaveBeenCalledWith("测试", {
        model: "mimo-v2.5-tts-voicedesign",
        voice: "custom-voice-123",
        speed: 0.8,
        pitch: 1.2,
        volume: 0.9,
        format: "wav",
      });

      mockSynthesize.mockRestore();
    });
  });
});
