/**
 * audio-playback-queue.ts — 音频播放队列
 *
 * 使用 AudioContext 实现多段音频无缝拼接播放。
 * 用于分句 TTS：每句合成后入队，当前句播放完立即衔接下一句。
 */

export class AudioPlaybackQueue {
  private audioContext: AudioContext | null = null;
  private queue: { audioBuffer: AudioBuffer; resolve: () => void }[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private _volume = 1.0;

  constructor(volume = 1.0) {
    this._volume = volume;
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this._volume;
      this.gainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * 将音频数据入队并播放
   * @param audioData ArrayBuffer 或 Blob 格式的音频
   * @returns Promise 在该段音频播放完成后 resolve
   */
  async enqueue(audioData: ArrayBuffer | Blob): Promise<void> {
    const ctx = this.ensureContext();

    let buffer: ArrayBuffer;
    if (audioData instanceof Blob) {
      buffer = await audioData.arrayBuffer();
    } else {
      buffer = audioData;
    }

    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));

    return new Promise<void>((resolve) => {
      this.queue.push({ audioBuffer, resolve });
      if (!this.isPlaying) {
        this.playNext();
      }
    });
  }

  private playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const { audioBuffer, resolve } = this.queue.shift()!;
    const ctx = this.ensureContext();

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode!);

    source.onended = () => {
      resolve();
      this.currentSource = null;
      this.playNext();
    };

    this.currentSource = source;
    source.start(0);
  }

  /**
   * 停止播放并清空队列
   */
  stop() {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch {}
      this.currentSource = null;
    }
    for (const item of this.queue) {
      item.resolve();
    }
    this.queue = [];
    this.isPlaying = false;
  }

  /**
   * 设置音量 (0-1)
   */
  setVolume(vol: number) {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
  }

  /**
   * 销毁队列
   */
  destroy() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.gainNode = null;
  }

  get queueLength() {
    return this.queue.length;
  }

  get playing() {
    return this.isPlaying;
  }
}
