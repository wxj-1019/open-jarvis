/**
 * audio-preprocessing.ts — 音频预处理管线
 *
 * 使用 Web Audio API 对麦克风输入进行实时降噪和自动增益控制 (AGC)，
 * 在发送到 VAD/STT 之前提升音频质量。
 */

export interface AudioPreprocessorOptions {
  /** 是否启用降噪（高通滤波），默认 false */
  noiseReduction?: boolean;
  /** 是否启用自动增益控制，默认 false */
  agc?: boolean;
  /** 是否启用回声消除，默认 false */
  echoCancellation?: boolean;
  /** 降噪配置文件，默认 'adaptive' */
  noiseProfile?: 'adaptive' | 'office' | 'outdoor';
  /** 采样率，默认 16000 */
  sampleRate?: number;
}

const DEFAULT_OPTIONS: Required<AudioPreprocessorOptions> = {
  noiseReduction: false,
  agc: false,
  echoCancellation: false,
  noiseProfile: 'adaptive',
  sampleRate: 16000,
};

/**
 * 音频预处理器 — 基于 Web Audio API 构建处理链
 */
export class AudioPreprocessor {
  private options: Required<AudioPreprocessorOptions>;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private outputStream: MediaStream | null = null;

  constructor(options: AudioPreprocessorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 初始化音频处理链
   * @param stream 原始麦克风 MediaStream
   * @returns 处理后的 MediaStream
   */
  async initialize(stream: MediaStream): Promise<MediaStream> {
    this.audioContext = new AudioContext({
      sampleRate: this.options.sampleRate,
    });

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    // 构建处理链: source → [filters] → destination
    let currentNode: AudioNode = this.sourceNode;

    // 降噪: 高通滤波器
    if (this.options.noiseReduction) {
      this.filterNode = this.audioContext.createBiquadFilter();
      this.filterNode.type = 'highpass';
      this.filterNode.frequency.value = this.getHighpassFrequency();
      this.filterNode.Q.value = 0.7;

      currentNode.connect(this.filterNode);
      currentNode = this.filterNode;
    }

    // 自动增益控制: 动态压缩器
    if (this.options.agc) {
      this.compressorNode = this.audioContext.createDynamicsCompressor();
      this.compressorNode.threshold.value = -50;
      this.compressorNode.knee.value = 40;
      this.compressorNode.ratio.value = 12;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.25;

      currentNode.connect(this.compressorNode);
      currentNode = this.compressorNode;
    }

    // 连接到输出
    currentNode.connect(this.destinationNode);

    this.outputStream = this.destinationNode.stream;
    return this.outputStream;
  }

  /**
   * 获取处理后的输出流
   */
  getOutputStream(): MediaStream | null {
    return this.outputStream;
  }

  /**
   * 彻底清理所有资源
   */
  async destroy(): Promise<void> {
    // 断开所有节点连接
    this.sourceNode?.disconnect();
    this.filterNode?.disconnect();
    this.compressorNode?.disconnect();
    this.destinationNode?.disconnect();

    // 关闭 AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }

    // 清空引用
    this.sourceNode = null;
    this.filterNode = null;
    this.compressorNode = null;
    this.destinationNode = null;
    this.outputStream = null;
    this.audioContext = null;
  }

  /**
   * 检查浏览器是否支持回声消除
   */
  static async isEchoCancellationSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return false;
    }

    try {
      const testStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
        },
      });

      // 检查音轨是否实际启用了回声消除
      const settings = testStream.getAudioTracks()[0]?.getSettings();
      const supported = settings?.echoCancellation === true;

      // 立即停止测试流
      testStream.getTracks().forEach(track => track.stop());

      return supported;
    } catch {
      return false;
    }
  }

  /**
   * 根据配置文件获取高通滤波频率
   */
  private getHighpassFrequency(): number {
    switch (this.options.noiseProfile) {
      case 'office':
        return 80;
      case 'outdoor':
        return 150;
      case 'adaptive':
      default:
        return 100;
    }
  }
}

/**
 * 工厂函数 — 创建并初始化音频预处理器
 */
export async function createAudioPreprocessor(
  stream: MediaStream,
  options?: AudioPreprocessorOptions
): Promise<AudioPreprocessor> {
  const preprocessor = new AudioPreprocessor(options);
  await preprocessor.initialize(stream);
  return preprocessor;
}
