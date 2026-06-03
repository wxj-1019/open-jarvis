/**
 * voice-streaming.js — WebSocket streaming transcription endpoint
 *
 * Handles real-time audio streaming via WebSocket:
 * - Accepts PCM 16-bit audio chunks from the client
 * - Accumulates chunks and calls Whisper API every ~500ms of audio
 * - Sends partial and final transcription results back
 */

import { WebSocketServer } from "ws";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { createModuleLogger } from "../../lib/debug-log.js";

const log = createModuleLogger("voice-streaming");

// Reuse helpers from voice.js pattern
function getOpenAIKey(engine) {
  try {
    const credentials = engine.getProviderCredentials?.("openai");
    if (credentials?.apiKey) {
      return credentials.apiKey;
    }
    const config = engine.getConfig?.();
    if (config?.providers?.openai?.apiKey) {
      return config.providers.openai.apiKey;
    }
  } catch (err) {
    log?.warn?.("Failed to get OpenAI credentials:", err.message);
  }
  return process.env.OPENAI_API_KEY;
}

function getWhisperBaseUrl(engine) {
  try {
    const config = engine.getConfig?.();
    if (config?.voice?.whisperBaseUrl) {
      return config.voice.whisperBaseUrl;
    }
  } catch {}
  return "https://api.openai.com/v1";
}

/**
 * Create a temporary file from a buffer and auto-clean it
 */
async function withTempFile(buffer, ext, callback) {
  const tempDir = os.tmpdir();
  const fileName = `stream_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const tempPath = path.join(tempDir, fileName);

  try {
    await fs.promises.writeFile(tempPath, buffer);
    return await callback(tempPath);
  } finally {
    try {
      await fs.promises.unlink(tempPath);
    } catch {}
  }
}

/**
 * Convert PCM 16-bit audio buffer to WebM-like format for Whisper API.
 * Whisper API accepts wav, mp3, mp4, mpeg, mpga, m4a, ogg, webm.
 * We save as .wav for simplicity (PCM is already WAV-compatible with a header).
 */
function pcmToWav(pcmBuffer, sampleRate = 16000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataLength = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataLength);

  // WAV header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM = 1)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  pcmBuffer.copy(buffer, 44);
  return buffer;
}

/**
 * Call Whisper API with the given audio buffer
 */
async function callWhisper(audioBuffer, apiKey, baseUrl, lang) {
  const wavBuffer = pcmToWav(audioBuffer);

  const result = await withTempFile(wavBuffer, "wav", async (tempPath) => {
    const whisperFormData = new FormData();
    const fileBlob = new Blob([wavBuffer], { type: "audio/wav" });
    whisperFormData.append("file", fileBlob, "stream.wav");
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("language", lang);
    whisperFormData.append("response_format", "json");

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API returned ${response.status}: ${errorText}`);
    }

    return await response.json();
  });

  return result;
}

export function createVoiceStreamingRoute(engine) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    const lang = url.searchParams.get("lang") || "zh";

    const apiKey = getOpenAIKey(engine);
    if (!apiKey) {
      ws.send(JSON.stringify({ type: "error", message: "OpenAI API key not configured" }));
      ws.close();
      return;
    }

    const baseUrl = getWhisperBaseUrl(engine);

    let audioBuffer = Buffer.alloc(0);
    let lastTranscriptionTime = Date.now();
    let lastPartialText = "";
    let finished = false;
    const MIN_AUDIO_MS = 500; // Minimum audio to accumulate before calling API
    const BYTES_PER_MS = 32; // 16000 Hz * 2 bytes/sample / 1000 = 32 bytes/ms

    ws.on("message", async (data) => {
      if (finished) return;

      // Parse control messages
      let parsed = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        // Binary audio data, not JSON
      }

      if (parsed) {
        if (parsed.type === "finish") {
          finished = true;
          // Do final transcription with all accumulated audio
          if (audioBuffer.length > 0) {
            try {
              const result = await callWhisper(audioBuffer, apiKey, baseUrl, lang);
              const text = (result.text || "").trim();
              if (text) {
                ws.send(JSON.stringify({ type: "final", text }));
              }
            } catch (err) {
              log?.error?.("Final transcription error:", err.message);
              ws.send(JSON.stringify({ type: "error", message: err.message }));
            }
          }
          ws.close();
          return;
        }
        // Ignore other JSON control messages
        return;
      }

      // Accumulate binary audio data
      const chunk = Buffer.from(data);
      audioBuffer = Buffer.concat([audioBuffer, chunk]);

      // Check if enough audio has accumulated since last transcription
      const elapsedMs = Date.now() - lastTranscriptionTime;
      const audioMs = audioBuffer.length / BYTES_PER_MS;

      if (audioMs >= MIN_AUDIO_MS && elapsedMs >= MIN_AUDIO_MS) {
        lastTranscriptionTime = Date.now();

        // Create a copy of current buffer for API call
        const bufferToTranscribe = Buffer.from(audioBuffer);

        try {
          const result = await callWhisper(bufferToTranscribe, apiKey, baseUrl, lang);
          const text = (result.text || "").trim();
          if (text && text !== lastPartialText) {
            lastPartialText = text;
            ws.send(JSON.stringify({ type: "partial", text }));
          }
        } catch (err) {
          log?.error?.("Partial transcription error:", err.message);
          ws.send(JSON.stringify({ type: "error", message: err.message }));
        }
      }
    });

    ws.on("close", () => {
      log?.info?.("Voice streaming connection closed");
    });

    ws.on("error", (err) => {
      log?.error?.("Voice streaming error:", err.message);
    });
  });

  // Return an upgrade handler function compatible with Hono's raw upgrade
  return (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  };
}
