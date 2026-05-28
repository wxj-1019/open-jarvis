/**
 * tts.js — TTS 语音合成路由
 *
 * POST /api/tts/synthesize
 * Body: { text: string, model?: string, voice?: string, speed?: number, ... }
 *
 * 支持多种 TTS 引擎：
 *   - Mimo TTS (推荐，高质量中文语音)
 *   - Web Speech API (浏览器内置，备选)
 */
import { Hono } from "hono";
import { createModuleLogger } from "../../lib/debug-log.js";
import { synthesizeSpeech as mimoSynthesize, checkConfig as checkMimoConfig } from "../../lib/speech/mimo-tts.js";

const log = createModuleLogger("tts-route");

export function createTTSRoute(engine) {
  const route = new Hono();

  /**
   * POST /api/tts/synthesize
   *
   * 合成语音并返回音频数据
   */
  route.post("/tts/synthesize", async (c) => {
    try {
      const body = await c.req.json();
      const {
        text,
        engine: requestedEngine = "mimo", // mimo 或 webspeech
        model,
        voice,
        speed,
        pitch,
        volume,
        format = "mp3",
      } = body;

      // 验证输入
      if (!text || !text.trim()) {
        return c.json({ error: "Text is required" }, 400);
      }

      if (text.length > 5000) {
        return c.json({ error: "Text too long (max 5000 characters)" }, 400);
      }

      // 根据引擎选择 TTS 服务
      if (requestedEngine === "mimo") {
        return await handleMimoTTS(c, engine, text, {
          model,
          voice,
          speed,
          pitch,
          volume,
          format,
        });
      } else if (requestedEngine === "webspeech") {
        return c.json({
          error: "Web Speech TTS should be handled client-side",
          suggestion: "Use window.speechSynthesis in browser",
        }, 400);
      } else {
        return c.json({
          error: `Unsupported TTS engine: ${requestedEngine}`,
          supported: ["mimo", "webspeech"],
        }, 400);
      }
    } catch (err) {
      log?.error?.("TTS synthesis failed:", err.message);

      if (err.message.includes("API key not configured") || err.message.includes("not configured")) {
        return c.json({
          error: "Mimo TTS not configured",
          suggestion: "Please configure MiMo TTS in Settings → Providers → Xiaomi MiMo TTS.",
        }, 401);
      }

      return c.json({
        error: `TTS synthesis failed: ${err.message}`,
      }, 500);
    }
  });

  /**
   * GET /api/tts/config
   *
   * 检查 TTS 配置状态
   */
  route.get("/tts/config", async (c) => {
    const mimoConfig = checkMimoConfig(engine);

    return c.json({
      mimo: mimoConfig,
      webspeech: {
        available: true,
        note: "Client-side only, no server config needed",
      },
    });
  });

  /**
   * GET /api/tts/models
   *
   * 获取可用的 TTS 模型列表
   */
  route.get("/tts/models", async (c) => {
    const { getAvailableModels } = await import("../../lib/speech/mimo-tts.js");

    return c.json({
      mimo: getAvailableModels(),
      webspeech: {
        note: "Depends on browser, query client-side speechSynthesis.getVoices()",
      },
    });
  });

  return route;
}

/**
 * 处理 Mimo TTS 请求
 */
async function handleMimoTTS(c, engine, text, options) {
  const result = await mimoSynthesize(engine, text, options);

  // 返回音频数据
  return c.body(result.audioBuffer, {
    headers: {
      "Content-Type": result.contentType || `audio/${options.format || "mp3"}`,
      "Content-Length": result.audioBuffer.length.toString(),
      "X-TTS-Model": options.model || process.env.MIMO_TTS_MODEL || "mimo-v2.5-tts",
      "X-TTS-Engine": "mimo",
    },
  });
}
