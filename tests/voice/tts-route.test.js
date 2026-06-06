/**
 * tts-route.test.js — TTS 语音合成路由单元测试
 *
 * 测试 /api/tts/synthesize、/api/tts/config、/api/tts/models 端点
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTTSRoute } from "../../server/routes/tts.js";

describe("tts route", () => {
  let mockEngine;
  let app;

  beforeEach(() => {
    mockEngine = {
      getProviderCredentials: vi.fn(() => ({
        apiKey: "test-mimo-key",
        baseUrl: "https://api.xiaomimimo.com/v1",
      })),
      getConfig: vi.fn(() => ({
        providers: {
          "mimo-tts": {
            models: ["mimo-v2.5-tts"],
          },
        },
      })),
    };

    app = new Hono();
    app.route("/api", createTTSRoute(mockEngine));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── GET /api/tts/config ──

  describe("GET /api/tts/config", () => {
    it("returns mimo config when API key is available", async () => {
      const res = await app.request("/api/tts/config");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mimo.configured).toBe(true);
      expect(data.mimo.model).toBe("mimo-v2.5-tts");
    });

    it("returns mimo unconfigured when API key is missing", async () => {
      mockEngine.getProviderCredentials.mockReturnValue(null);

      const res = await app.request("/api/tts/config");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mimo.configured).toBe(false);
      expect(data.mimo.error).toBeTruthy();
    });

    it("includes webspeech availability info", async () => {
      const res = await app.request("/api/tts/config");
      const data = await res.json();

      expect(data.webspeech.available).toBe(true);
      expect(data.webspeech.note).toBeTruthy();
    });
  });

  // ── GET /api/tts/models ──

  describe("GET /api/tts/models", () => {
    it("returns mimo model list", async () => {
      const res = await app.request("/api/tts/models");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mimo).toHaveLength(4);
      expect(data.mimo[0].id).toBe("mimo-v2.5-tts");
    });

    it("includes webspeech note", async () => {
      const res = await app.request("/api/tts/models");
      const data = await res.json();

      expect(data.webspeech.note).toBeTruthy();
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

    it("rejects text exceeding 5000 characters", async () => {
      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "A".repeat(5001) }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("too long");
    });

    it("rejects unsupported engine", async () => {
      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello", engine: "google" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Unsupported TTS engine");
      expect(data.supported).toBeDefined();
    });

    it("rejects webspeech engine with suggestion", async () => {
      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello", engine: "webspeech" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("client-side");
      expect(data.suggestion).toContain("speechSynthesis");
    });

    it("returns 401 when Mimo is not configured", async () => {
      mockEngine.getProviderCredentials.mockReturnValue(null);

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello", engine: "mimo" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("not configured");
      expect(data.suggestion).toContain("Settings");
    });

    it("synthesizes speech and returns audio with correct headers", async () => {
      const fakeAudio = Buffer.from([0xFF, 0xF3, 0x50, 0x00]); // fake MP3 header

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "audio/mpeg"]]),
        arrayBuffer: vi.fn().mockResolvedValue(fakeAudio.buffer),
        text: vi.fn().mockResolvedValue(""),
      }));

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello world" }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(res.headers.get("X-TTS-Engine")).toBe("mimo");
      expect(res.headers.get("X-TTS-Model")).toBeTruthy();

      const body = await res.arrayBuffer();
      expect(body.byteLength).toBeGreaterThan(0);
    });

    it("handles Mimo API error gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      }));

      const res = await app.request("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello" }),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("TTS synthesis failed");
    });
  });
});
