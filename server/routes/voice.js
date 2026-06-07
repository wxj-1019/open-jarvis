/**
 * voice.js — 语音识别路由
 *
 * POST /api/voice/transcribe
 * Body: FormData { audio: Blob, lang?: string }
 *
 * 将用户上传的音频文件通过 OpenAI Whisper API 进行语音识别。
 * 支持多 provider 配置，优先使用用户配置的 OpenAI provider。
 */
import { Hono } from "hono";
import { createModuleLogger } from "../../lib/debug-log.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

const log = createModuleLogger("voice");

/**
 * 从 engine 获取 OpenAI provider 的 API Key
 */
function getOpenAIKey(engine) {
  try {
    // 尝试从 provider credentials 获取
    const credentials = engine?.providerRegistry?.getCredentials?.("openai");
    if (credentials?.apiKey) {
      return credentials.apiKey;
    }
  } catch (err) {
    log?.warn?.("Failed to get OpenAI credentials:", err.message);
  }

  // fallback: 环境变量
  return process.env.OPENAI_API_KEY;
}

/**
 * 获取 Whisper API 基础 URL
 */
function getWhisperBaseUrl(engine) {
  try {
    const config = engine.getConfig?.();
    // 支持自定义 Whisper endpoint（如本地部署的 whisper.cpp）
    if (config?.voice?.whisperBaseUrl) {
      return config.voice.whisperBaseUrl;
    }
  } catch {}

  // 默认使用 OpenAI API
  return "https://api.openai.com/v1";
}

/**
 * 创建临时文件并自动清理
 */
async function withTempFile(buffer, callback) {
  const tempDir = os.tmpdir();
  const fileName = `voice_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.webm`;
  const tempPath = path.join(tempDir, fileName);

  try {
    await fs.promises.writeFile(tempPath, buffer);
    return await callback(tempPath);
  } finally {
    // 清理临时文件
    try {
      await fs.promises.unlink(tempPath);
    } catch {}
  }
}

export function createVoiceRoute(engine) {
  const route = new Hono();

  /**
   * POST /api/voice/transcribe
   *
   * 接收音频文件并返回 Whisper 识别结果
   */
  route.post("/voice/transcribe", async (c) => {
    try {
      // 解析 multipart/form-data
      const formData = await c.req.formData();
      const audioFile = formData.get("audio");
      const lang = formData.get("lang") || "zh";

      if (!audioFile || !(audioFile instanceof File)) {
        return c.json({ error: "Missing audio file" }, 400);
      }

      // 验证文件类型
      const allowedTypes = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"];
      if (!allowedTypes.includes(audioFile.type) && !audioFile.name.match(/\.(webm|ogg|mp4|wav|mp3)$/i)) {
        return c.json({ error: "Unsupported audio format" }, 400);
      }

      // 验证文件大小（限制 25MB，Whisper API 限制）
      const maxSize = 25 * 1024 * 1024; // 25MB
      if (audioFile.size > maxSize) {
        return c.json({ error: "Audio file too large (max 25MB)" }, 400);
      }

      // 读取音频数据
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      if (audioBuffer.length === 0) {
        return c.json({ error: "Empty audio file" }, 400);
      }

      // 获取 OpenAI 配置
      const apiKey = getOpenAIKey(engine);
      if (!apiKey) {
        return c.json({
          error: "OpenAI API key not configured. Please add your OpenAI credentials in settings.",
        }, 401);
      }

      const baseUrl = getWhisperBaseUrl(engine);

      // 使用临时文件调用 Whisper API
      const result = await withTempFile(audioBuffer, async (tempPath) => {
        // 创建 FormData 发送给 Whisper API
        const whisperFormData = new FormData();
        const fileBlob = new Blob([audioBuffer], { type: audioFile.type || "audio/webm" });
        whisperFormData.append("file", fileBlob, audioFile.name || "audio.webm");
        whisperFormData.append("model", "whisper-1");
        whisperFormData.append("language", lang);
        whisperFormData.append("response_format", "json");

        // 调用 Whisper API
        const response = await fetch(`${baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: whisperFormData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          log?.error?.("Whisper API error:", response.status, errorText);
          throw new Error(`Whisper API returned ${response.status}: ${errorText}`);
        }

        return await response.json();
      });

      log?.info?.("Voice transcription successful");

      return c.json({
        text: result.text || "",
        confidence: result.confidence || null,
        language: result.language || lang,
      });
    } catch (err) {
      log?.error?.("Transcription failed:", err.message);

      // 区分错误类型
      if (err.message.includes("401") || err.message.includes("Unauthorized")) {
        return c.json({
          error: "Invalid OpenAI API key",
        }, 401);
      }

      if (err.message.includes("429") || err.message.includes("Rate limit")) {
        return c.json({
          error: "Rate limit exceeded. Please try again later.",
        }, 429);
      }

      return c.json({
        error: `Transcription failed: ${err.message}`,
      }, 500);
    }
  });

  /**
   * GET /api/voice/config
   *
   * 检查语音服务配置状态
   */
  route.get("/voice/config", async (c) => {
    const apiKey = getOpenAIKey(engine);
    const baseUrl = getWhisperBaseUrl(engine);

    return c.json({
      configured: !!apiKey,
      baseUrl,
      provider: baseUrl.includes("api.openai.com") ? "openai" : "custom",
    });
  });

  return route;
}

export { createVoiceStreamingRoute } from "./voice-streaming.js";
