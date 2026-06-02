/**
 * audio-recorder.ts — 音频录制工具
 *
 * 使用 MediaRecorder API 录制麦克风音频，输出 WAV 格式 Blob。
 * 作为 Web Speech API 的备用方案。
 */

export interface AudioRecorderOptions {
  /** 采样率 */
  sampleRate?: number;
  /** 最大录制时长（毫秒） */
  maxDurationMs?: number;
}

export interface AudioRecorderResult {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';

interface AudioRecorderCallbacks {
  onStateChange?: (state: RecorderState) => void;
  onError?: (error: Error) => void;
  onData?: (result: AudioRecorderResult) => void;
}

class AudioRecorder {
  private state: RecorderState = 'idle';
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: AudioRecorderCallbacks = {};
  private options: AudioRecorderOptions;

  constructor(options: AudioRecorderOptions = {}) {
    this.options = {
      sampleRate: 16000,
      maxDurationMs: 60000, // 默认最长 60 秒
      ...options,
    };
  }

  setCallbacks(callbacks: AudioRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  private setState(state: RecorderState) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  getState(): RecorderState {
    return this.state;
  }

  /**
   * 请求麦克风权限并开始录制
   */
  async start(): Promise<void> {
    if (this.state === 'recording' || this.state === 'requesting') return;

    this.setState('requesting');
    this.chunks = [];

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: this.options.sampleRate },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const actualSettings = this.stream.getAudioTracks()[0]?.getSettings();
      const actualSampleRate = actualSettings?.sampleRate;
      if (actualSampleRate && actualSampleRate !== this.options.sampleRate) {
        console.warn(
          `[AudioRecorder] Requested ${this.options.sampleRate}Hz but got ${actualSampleRate}Hz`
        );
      }

      // 优先使用 opus 编码，fallback 到 webm
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.handleStop();
      };

      this.mediaRecorder.onerror = () => {
        this.handleError(new Error('MediaRecorder error'));
      };

      this.mediaRecorder.start(100); // 每 100ms 收集一次数据
      this.startTime = Date.now();
      this.setState('recording');

      // 设置最大时长限制
      if (this.options.maxDurationMs && this.options.maxDurationMs > 0) {
        this.maxDurationTimer = setTimeout(() => {
          this.stop();
        }, this.options.maxDurationMs);
      }
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * 停止录制
   */
  stop(): void {
    if (this.state !== 'recording') return;

    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // 停止所有音轨
    this.stream?.getTracks().forEach(track => track.stop());
  }

  /**
   * 将录制的 chunks 合并为 ArrayBuffer（IPC 可传输格式）
   */
  async getAudioArrayBuffer(): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
    if (this.chunks.length === 0) return null;
    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    const buffer = await blob.arrayBuffer();
    return { buffer, mimeType };
  }

  /**
   * 取消录制（不触发 onData 回调）
   */
  cancel(): void {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    this.chunks = [];

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.stream?.getTracks().forEach(track => track.stop());
    this.setState('idle');
  }

  /**
   * 彻底清理所有资源，用于组件卸载时调用
   */
  destroy(): void {
    this.cancel();
    this.callbacks = {};
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  private handleStop() {
    const durationMs = Date.now() - this.startTime;

    if (this.chunks.length === 0) {
      this.setState('idle');
      return;
    }

    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });

    this.setState('stopped');
    this.callbacks.onData?.({ blob, durationMs, mimeType });

    // 清理
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  private handleError(error: Error) {
    console.error('[AudioRecorder]', error);
    this.setState('error');
    this.callbacks.onError?.(error);

    // 清理
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];

    // 错误状态后自动恢复为 idle
    setTimeout(() => {
      if (this.state === 'error') {
        this.setState('idle');
      }
    }, 2000);
  }

  /**
   * 获取浏览器支持的 MIME 类型
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // fallback
  }

  /**
   * 检查浏览器是否支持录音
   */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && !!navigator.mediaDevices.getUserMedia
      && typeof MediaRecorder !== 'undefined';
  }
}

export { AudioRecorder };
export type { RecorderState };
