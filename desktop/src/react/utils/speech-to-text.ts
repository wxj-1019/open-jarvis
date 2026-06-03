/**
 * speech-to-text.ts — 语音转文字服务
 *
 * 支持多种语音识别后端：
 * 1. 浏览器原生 Web Speech API（优先）
 * 2. 服务器端 Whisper API（备用）
 */

import { hanaFetch } from '../hooks/use-hana-fetch';
import { WhisperStreamingClient } from './whisper-streaming';

export interface SpeechToTextResult {
  text: string;
  confidence?: number;
}

export type SpeechBackend = 'webkit' | 'whisper' | 'whisper-stream';

interface SpeechToTextOptions {
  /** 语言 */
  lang?: string;
  /** 后端类型 */
  backend?: SpeechBackend;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 流式传输客户端 (仅 whisper-stream 后端) */
  streamClient?: WhisperStreamingClient;
  /** 音频块大小 (用于流式传输) */
  chunkSize?: number;
}

/**
 * 检查 Web Speech API 是否可用
 */
export function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined'
    && !!(window as any).webkitSpeechRecognition
    && !!(window as any).SpeechRecognition;
}

/**
 * 使用 Web Speech API 进行语音识别
 */
export function recognizeWithWebSpeech(
  options: { lang?: string; onInterim?: (text: string) => void } = {}
): Promise<SpeechToTextResult> {
  return new Promise((resolve, reject) => {
    const SpeechRecognitionCtor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognitionCtor) {
      reject(new Error('Web Speech API not available'));
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = options.lang || 'zh-CN';

    let finalText = '';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (interimTranscript && options.onInterim) {
        options.onInterim(interimTranscript);
      }
    };

    recognition.onend = () => {
      resolve({ text: finalText.trim() });
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        resolve({ text: finalText.trim() });
        return;
      }
      reject(new Error(`Speech recognition error: ${event.error}`));
    };

    try {
      recognition.start();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 使用服务器端 Whisper API 进行语音识别
 */
export async function recognizeWithWhisper(
  audioBlob: Blob,
  options: { lang?: string; timeoutMs?: number; retries?: number } = {}
): Promise<SpeechToTextResult> {
  const maxRetries = options.retries ?? 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('lang', options.lang || 'zh');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 30000);

    try {
      const res = await hanaFetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Whisper API error: ${error}`);
      }

      const data = await res.json();
      return { text: data.text || '', confidence: data.confidence };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = 1000 * (attempt + 1);
        console.warn(`[Whisper] Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Whisper API request failed after retries');
}

/**
 * Stream audio transcription via WebSocket
 */
async function streamTranscription(
  client: WhisperStreamingClient,
  audioBlob: Blob,
  options: { chunkSize?: number } = {}
): Promise<SpeechToTextResult> {
  const chunkSize = options.chunkSize || 4096;

  return new Promise<SpeechToTextResult>((resolve, reject) => {
    let finalText = '';

    const onFinal = (text: string) => {
      finalText = text;
      resolve({ text: finalText.trim() });
    };

    const onError = (error: Error) => {
      reject(error);
    };

    // Store original callbacks to restore later
    const origOnFinal = (client as any)._origOnFinal;
    const origOnError = (client as any)._origOnError;

    (client as any)._origOnFinal = client['options']?.onFinalResult;
    (client as any)._origOnError = client['options']?.onError;

    // Temporarily override callbacks
    if (client['options']) {
      client['options'].onFinalResult = onFinal;
      client['options'].onError = onError;
    }

    // Convert Blob to ArrayBuffer, then to Float32Array chunks
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const dataView = new DataView(arrayBuffer);

        // Decode WebM/OGG to raw PCM via AudioContext
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

        // Get channel 0 data
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // Send in chunks
        let offset = 0;
        while (offset < channelData.length) {
          const end = Math.min(offset + chunkSize, channelData.length);
          const chunk = channelData.slice(offset, end);
          client.sendChunk(chunk, sampleRate);
          offset = end;
        }

        // Signal end of audio
        client.finish();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read audio blob'));
    };
    reader.readAsArrayBuffer(audioBlob);
  });
}

/**
 * 自动选择最佳后端进行语音识别
 */
export async function speechToText(
  options: SpeechToTextOptions & { audioBlob?: Blob } = {}
): Promise<SpeechToTextResult> {
  const backend = options.backend || (isWebSpeechAvailable() ? 'webkit' : 'whisper');

  if (backend === 'webkit') {
    return recognizeWithWebSpeech(options);
  }

  if (backend === 'whisper-stream') {
    if (!options.streamClient) {
      throw new Error('whisper-stream backend requires streamClient');
    }
    if (!options.audioBlob) {
      throw new Error('whisper-stream backend requires audioBlob');
    }
    return streamTranscription(options.streamClient, options.audioBlob, {
      chunkSize: options.chunkSize,
    });
  }

  if (!options.audioBlob) {
    throw new Error('Whisper backend requires audioBlob');
  }

  return recognizeWithWhisper(options.audioBlob, options);
}
