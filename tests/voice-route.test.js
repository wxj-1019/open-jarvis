/**
 * voice-route.test.js — 语音识别路由单元测试
 *
 * 测试 /api/voice/transcribe 和 /api/voice/config 端点
 */
import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceRoute } from "../server/routes/voice.js";

describe("voice route", () => {
  let tmpDir;
  let mockEngine;
  let app;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-voice-route-"));

    // 模拟 engine 对象
    mockEngine = {
      hanakoHome: tmpDir,
      getProviderCredentials: vi.fn(),
      getConfig: vi.fn(),
    };

    app = new Hono();
    app.route("/api", createVoiceRoute(mockEngine));
  });

  afterEach(() => {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
      tmpDir = null;
    }
    vi.restoreAllMocks();
  });

  // ── GET /api/voice/config ──

  describe("GET /api/voice/config", () => {
    it("returns configured: true when API key is available", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      const res = await app.request("/api/voice/config");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toMatchObject({
        configured: true,
        baseUrl: "https://api.openai.com/v1",
        provider: "openai",
      });
    });

    it("returns configured: false when API key is missing", async () => {
      mockEngine.getProviderCredentials.mockReturnValue(null);
      mockEngine.getConfig.mockReturnValue({});

      const res = await app.request("/api/voice/config");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toMatchObject({
        configured: false,
        baseUrl: "https://api.openai.com/v1",
        provider: "openai",
      });
    });

    it("returns custom baseUrl when configured", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });
      mockEngine.getConfig.mockReturnValue({
        voice: { whisperBaseUrl: "http://localhost:8080/v1" },
      });

      const res = await app.request("/api/voice/config");
      const data = await res.json();

      expect(data).toMatchObject({
        configured: true,
        baseUrl: "http://localhost:8080/v1",
        provider: "custom",
      });
    });

    it("falls back to getConfig when getProviderCredentials unavailable", async () => {
      mockEngine.getProviderCredentials.mockReturnValue(null);
      mockEngine.getConfig.mockReturnValue({
        providers: { openai: { apiKey: "sk-from-config" } },
      });

      const res = await app.request("/api/voice/config");
      const data = await res.json();

      expect(data.configured).toBe(true);
    });
  });

  // ── POST /api/voice/transcribe ──

  describe("POST /api/voice/transcribe", () => {
    it("rejects missing audio file", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      const formData = new FormData();
      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Missing audio file");
    });

    it("rejects unsupported audio format", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      const formData = new FormData();
      const file = new File(["test"], "audio.exe", { type: "application/octet-stream" });
      formData.append("audio", file);

      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Unsupported audio format");
    });

    it("rejects empty audio file", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      const formData = new FormData();
      const file = new File([], "audio.webm", { type: "audio/webm" });
      formData.append("audio", file);

      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Empty audio file");
    });

    it("rejects when API key is not configured", async () => {
      mockEngine.getProviderCredentials.mockReturnValue(null);
      mockEngine.getConfig.mockReturnValue({});

      const formData = new FormData();
      const audioBlob = new Blob([new ArrayBuffer(100)], { type: "audio/webm" });
      const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
      formData.append("audio", file);

      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("OpenAI API key not configured");
    });

    it("rejects file too large (>25MB)", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      const formData = new FormData();
      // Create a blob larger than 25MB
      const largeBuffer = new ArrayBuffer(26 * 1024 * 1024); // 26MB
      const file = new File([largeBuffer], "audio.webm", { type: "audio/webm" });
      formData.append("audio", file);

      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("too large");
    });

    it("calls Whisper API with correct parameters", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      // Mock fetch for Whisper API
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          text: "Hello world",
          language: "zh",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      const audioBlob = new Blob([new ArrayBuffer(1000)], { type: "audio/webm" });
      const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
      formData.append("audio", file);
      formData.append("lang", "zh");

      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toMatchObject({
        text: "Hello world",
        language: "zh",
      });

      // Verify fetch was called with correct URL
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-key",
          }),
        })
      );

      vi.unstubAllGlobals();
    });

    it("handles Whisper API errors gracefully", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      // Mock fetch to return 401 error
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("Unauthorized", {
          status: 401,
          statusText: "Unauthorized",
        })
      );
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      const audioBlob = new Blob([new ArrayBuffer(1000)], { type: "audio/webm" });
      const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
      formData.append("audio", file);

      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Invalid OpenAI API key");

      vi.unstubAllGlobals();
    });

    it("handles rate limit errors (429)", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response("Rate limit exceeded", {
          status: 429,
        })
      );
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      const audioBlob = new Blob([new ArrayBuffer(1000)], { type: "audio/webm" });
      const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
      formData.append("audio", file);

      const res = await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toContain("Rate limit");

      vi.unstubAllGlobals();
    });

    it("accepts valid audio formats (webm, ogg, mp4, wav)", async () => {
      const formats = [
        { type: "audio/webm", name: "audio.webm" },
        { type: "audio/ogg", name: "audio.ogg" },
        { type: "audio/wav", name: "audio.wav" },
      ];

      for (const format of formats) {
        mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });

        const mockFetch = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ text: "Test" }), {
            status: 200,
          })
        );
        vi.stubGlobal("fetch", mockFetch);

        const formData = new FormData();
        const audioBlob = new Blob([new ArrayBuffer(100)], { type: format.type });
        const file = new File([audioBlob], format.name, { type: format.type });
        formData.append("audio", file);

        const res = await app.request("/api/voice/transcribe", {
          method: "POST",
          body: formData,
        });

        expect(res.status).toBe(200);

        vi.unstubAllGlobals();
        vi.clearAllMocks();
      }
    });

    it("uses custom whisperBaseUrl when configured", async () => {
      mockEngine.getProviderCredentials.mockReturnValue({ apiKey: "sk-test-key" });
      mockEngine.getConfig.mockReturnValue({
        voice: { whisperBaseUrl: "http://localhost:8080/v1" },
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "Test" }), {
          status: 200,
        })
      );
      vi.stubGlobal("fetch", mockFetch);

      const formData = new FormData();
      const audioBlob = new Blob([new ArrayBuffer(100)], { type: "audio/webm" });
      const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
      formData.append("audio", file);

      await app.request("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/v1/audio/transcriptions",
        expect.any(Object)
      );

      vi.unstubAllGlobals();
    });
  });
});
