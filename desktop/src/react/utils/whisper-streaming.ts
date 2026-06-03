/**
 * whisper-streaming.ts — WebSocket streaming transcription client
 *
 * Connects to a server-side WebSocket endpoint and streams audio chunks
 * in real-time, receiving partial and final transcription results.
 */

export type WhisperStreamingState = 'idle' | 'connecting' | 'streaming' | 'error' | 'closed';

export interface WhisperStreamingOptions {
  serverUrl?: string;
  chunkDurationMs?: number;
  language?: string;
  onPartialResult?: (text: string) => void;
  onFinalResult?: (text: string) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: WhisperStreamingState) => void;
}

const DEFAULT_SERVER_URL = 'ws://localhost:3000/api/voice/stream';
const DEFAULT_CHUNK_DURATION_MS = 100;
const MAX_RECONNECT_ATTEMPTS = 3;
const INITIAL_RECONNECT_DELAY_MS = 500;

interface ServerMessage {
  type: 'partial' | 'final' | 'error';
  text?: string;
  message?: string;
}

export class WhisperStreamingClient {
  private ws: WebSocket | null = null;
  private state: WhisperStreamingState = 'idle';
  private options: Required<Omit<WhisperStreamingOptions, 'serverUrl'>> & { serverUrl: string };
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(options: WhisperStreamingOptions = {}) {
    this.options = {
      serverUrl: options.serverUrl || DEFAULT_SERVER_URL,
      chunkDurationMs: options.chunkDurationMs || DEFAULT_CHUNK_DURATION_MS,
      language: options.language || 'zh',
      onPartialResult: options.onPartialResult || (() => {}),
      onFinalResult: options.onFinalResult || (() => {}),
      onError: options.onError || (() => {}),
      onStateChange: options.onStateChange || (() => {}),
    };
  }

  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'streaming') {
      return;
    }

    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');

      try {
        const url = new URL(this.options.serverUrl);
        url.searchParams.set('lang', this.options.language);
        this.ws = new WebSocket(url.toString());
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.setState('error');
        this.options.onError(error);
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('streaming');
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.ws = null;
        if (this.state !== 'closed') {
          this.handleDisconnect(event);
        }
      };

      this.ws.onerror = (event: Event) => {
        const error = new Error('WebSocket connection error');
        this.setState('error');
        this.options.onError(error);
        reject(error);
      };
    });
  }

  private handleMessage(raw: string | Blob | ArrayBuffer): void {
    let text: string;
    if (raw instanceof Blob) {
      // Blob messages are not expected in this protocol, ignore
      return;
    }
    if (raw instanceof ArrayBuffer) {
      text = new TextDecoder().decode(raw);
    } else {
      text = raw;
    }

    try {
      const msg: ServerMessage = JSON.parse(text);
      switch (msg.type) {
        case 'partial':
          if (msg.text) {
            this.options.onPartialResult(msg.text);
          }
          break;
        case 'final':
          if (msg.text) {
            this.options.onFinalResult(msg.text);
          }
          break;
        case 'error':
          this.options.onError(new Error(msg.message || 'Server error'));
          break;
      }
    } catch {
      // Ignore non-JSON messages
    }
  }

  private handleDisconnect(_event: CloseEvent): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setState('closed');
      this.shouldReconnect = false;
      return;
    }

    const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect().catch(() => {
        // Error already emitted via onerror handler
      });
    }, delay);
  }

  sendChunk(audioData: Float32Array, sampleRate = 16000): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convert Float32Array to 16-bit PCM ArrayBuffer
    const int16Array = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.ws.send(int16Array.buffer);
  }

  finish(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'finish' }));
    }
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('closed');
  }

  getState(): WhisperStreamingState {
    return this.state;
  }

  private setState(newState: WhisperStreamingState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState);
    }
  }
}
