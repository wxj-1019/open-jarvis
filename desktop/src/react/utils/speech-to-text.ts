/**
 * speech-to-text.ts — 语音转文字服务
 *
 * 支持多种语音识别后端：
 * 1. 浏览器原生 Web Speech API（优先）
 * 2. 服务器端 Whisper API（备用）
 */

import { hanaFetch } from '../hooks/use-hana-fetch';

export interface SpeechToTextResult {
  text: string;
  confidence?: number;
}

export type SpeechBackend = 'webkit' | 'whisper';

interface SpeechToTextOptions {
  /** 语言 */
  lang?: string;
  /** 后端类型 */
  backend?: SpeechBackend;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
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
 * 自动选择最佳后端进行语音识别
 */
export async function speechToText(
  options: SpeechToTextOptions & { audioBlob?: Blob } = {}
): Promise<SpeechToTextResult> {
  const backend = options.backend || (isWebSpeechAvailable() ? 'webkit' : 'whisper');

  if (backend === 'webkit') {
    return recognizeWithWebSpeech(options);
  }

  if (!options.audioBlob) {
    throw new Error('Whisper backend requires audioBlob');
  }

  return recognizeWithWhisper(options.audioBlob, options);
}
