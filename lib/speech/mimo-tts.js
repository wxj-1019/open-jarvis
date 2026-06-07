/**
 * mimo-tts.js — Mimo TTS 语音合成服务
 *
 * 使用 Xiaomi MiMo TTS API 将文本转换为语音
 * 支持模型：
 *   - mimo-v2.5-tts (推荐)
 *   - mimo-v2-tts
 *   - mimo-v2.5-tts-voicedesign
 *   - mimo-v2.5-tts-voiceclone
 *
 * API 文档: https://dev.mi.com/mimo-open-platform
 *
 * 凭证管理：
 *   - 通过 Provider 系统获取 API Key（added-models.yaml）
 *   - 不再依赖 .env 文件中的 MIMO_API_KEY
 */

import { createModuleLogger } from "../debug-log.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

const log = createModuleLogger("mimo-tts");

// ── 配置 ──

const DEFAULT_MODEL = "mimo-v2.5-tts";
const DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
const SUPPORTED_MODELS = [
  "mimo-v2.5-tts",
  "mimo-v2-tts",
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts-voiceclone",
];

/**
 * 获取 Mimo TTS 配置（通过 Provider 系统）
 *
 * 凭证走 engine.providerRegistry.getCredentials(providerId)，
 * 模型列表走 engine.providerRegistry.getProviderModels(providerId)。
 *
 * @param {object} engine - HanakoEngine 实例
 * @returns {{ apiKey: string, baseUrl: string, model: string }}
 */
function getMimoConfig(engine) {
  const reg = engine?.providerRegistry;

  // 通过 ProviderRegistry 获取凭证
  const credentials = reg?.getCredentials?.("mimo-tts");

  if (!credentials?.apiKey) {
    throw new Error(
      "MiMo TTS API key not configured. Please add it in Settings → Providers → Xiaomi MiMo TTS."
    );
  }

  const baseUrl = credentials.baseUrl || DEFAULT_BASE_URL;

  // 从 ProviderRegistry 获取首选模型
  let model = DEFAULT_MODEL;
  try {
    const modelIds = reg?.getProviderModels?.("mimo-tts");
    if (Array.isArray(modelIds) && modelIds.length > 0) {
      model = modelIds[0];
    }
  } catch (err) {
    log?.warn?.("Failed to get TTS model from config, using default:", model, err?.message || err);
  }

  return { apiKey: credentials.apiKey, baseUrl, model };
}

/**
 * 创建临时文件并自动清理
 */
async function withTempFile(callback, extension = "mp3") {
  const tempDir = os.tmpdir();
  const fileName = `mimo_tts_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const tempPath = path.join(tempDir, fileName);

  try {
    return await callback(tempPath);
  } finally {
    try {
      await fs.promises.unlink(tempPath);
    } catch {}
  }
}

/**
 * 调用 Mimo TTS API
 *
 * @param {object} engine - HanakoEngine 实例（用于获取凭证）
 * @param {string} text - 要合成的文本
 * @param {object} [options] - TTS 选项
 * @param {string} [options.voice] - 音色 ID (仅 voicedesign/voiceclone 模型)
 * @param {number} [options.speed] - 语速 (0.5-2.0, 默认 1.0)
 * @param {number} [options.pitch] - 音高 (0.5-2.0, 默认 1.0)
 * @param {number} [options.volume] - 音量 (0.0-1.0, 默认 1.0)
 * @param {string} [options.format] - 音频格式 (mp3/wav/ogg, 默认 mp3)
 * @param {number} [options.sampleRate] - 采样率 (默认 24000)
 *
 * @returns {Promise<{audioBuffer: Buffer, format: string, duration?: number}>}
 */
export async function synthesizeSpeech(engine, text, options = {}) {
  const { apiKey, baseUrl, model } = getMimoConfig(engine);

  if (!text || !text.trim()) {
    throw new Error("Text cannot be empty");
  }

  // 文本长度限制（Mimo 通常限制 5000 字符）
  if (text.length > 5000) {
    log?.warn?.(`Text too long (${text.length} chars), truncating to 5000`);
    text = text.substring(0, 5000);
  }

  const {
    voice,
    speed = 1.0,
    pitch = 1.0,
    volume = 1.0,
    format = "mp3",
    sampleRate = 24000,
  } = options;

  // 构建请求体
  const requestBody = {
    model,
    input: text,
    voice,
    speed,
    pitch,
    volume,
    response_format: format,
    sample_rate: sampleRate,
  };

  // 移除 undefined 值
  Object.keys(requestBody).forEach(
    (key) => requestBody[key] === undefined && delete requestBody[key]
  );

  log?.info?.(
    `Synthesizing speech with model: ${model}, text length: ${text.length}`
  );

  try {
    // 调用 Mimo TTS API
    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log?.error?.(`Mimo TTS API error: ${response.status}`, errorText);

      // 解析错误信息
      let errorMessage = `Mimo TTS API returned ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage += `: ${errorData.error?.message || errorText}`;
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    // 获取音频数据
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    if (audioBuffer.length === 0) {
      throw new Error("Received empty audio from Mimo TTS API");
    }

    log?.info?.(
      `Speech synthesis successful: ${audioBuffer.length} bytes, format: ${format}`
    );

    return {
      audioBuffer,
      format,
      model,
      contentType: response.headers.get("content-type") || `audio/${format}`,
    };
  } catch (err) {
    log?.error?.("Speech synthesis failed:", err.message);
    throw err;
  }
}

/**
 * 将音频保存为临时文件（用于测试或调试）
 *
 * @param {Buffer} audioBuffer - 音频数据
 * @param {string} [format] - 音频格式
 * @returns {Promise<string>} 临时文件路径
 */
export async function saveAudioToFile(audioBuffer, format = "mp3") {
  return withTempFile(async (tempPath) => {
    await fs.promises.writeFile(tempPath, audioBuffer);
    log?.info?.(`Audio saved to: ${tempPath}`);
    return tempPath;
  }, format);
}

/**
 * 获取可用的 TTS 模型列表
 */
export function getAvailableModels() {
  return SUPPORTED_MODELS.map((model) => ({
    id: model,
    baseUrl: DEFAULT_BASE_URL,
  }));
}

/**
 * 检查 Mimo TTS 配置状态
 *
 * @param {object} engine - HanakoEngine 实例
 */
export function checkConfig(engine) {
  try {
    const config = getMimoConfig(engine);
    return {
      configured: true,
      providerId: "mimo-tts",
      model: config.model,
      baseUrl: config.baseUrl,
      models: SUPPORTED_MODELS,
    };
  } catch (err) {
    return {
      configured: false,
      error: err.message,
      models: SUPPORTED_MODELS,
    };
  }
}
