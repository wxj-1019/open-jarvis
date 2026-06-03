/**
 * silero-vad-bridge.ts — Silero VAD 前端桥接层
 *
 * 封装 @ricky0123/vad-web 的 MicVAD，为 Electron 渲染进程提供
 * 统一的 VAD 接口，支持 lazy load 和 graceful fallback。
 *
 * 类型声明同时存在于 assets.d.ts（供其他文件使用），此处保留本地副本
 * 以确保 standalone 编译也能通过。
 */

// ── Silero VAD 内部类型 ──

interface SileroMicVAD {
  start(): void;
  pause(): void;
  destroy(): void;
}

interface SileroMicVADOpts {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onFrameProcessed?: (probabilities: number[]) => void;
  model?: string;
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  minSpeechFrames?: number;
  redemptionFrames?: number;
  preSpeechPadFrames?: number;
  suppressNonSpeech?: boolean;
}

// MicVAD 类：构造函数返回 Promise（异步构造器模式）
type SileroMicVADClass = new (options: SileroMicVADOpts) => Promise<SileroMicVAD>;

// ── 公共类型 ──

export interface SileroVADOptions {
  /** 模型尺寸: 'tiny' (更快) | 'small' (更准)，默认 'small' */
  model?: 'tiny' | 'small';
  /** 语音开始回调 */
  onSpeechStart?: () => void;
  /** 语音结束回调 */
  onSpeechEnd?: () => void;
  /** 每帧处理回调 (prob: number) */
  onFrameProcessed?: (prob: number) => void;
  /** 语音判定阈值 (0-1)，默认 0.5 */
  positiveSpeechThreshold?: number;
  /** 静音判定阈值 (0-1)，默认 0.35 */
  negativeSpeechThreshold?: number;
  /** 判定为语音所需的最小连续帧数，默认 3 */
  minSpeechFrames?: number;
  /** 语音结束后需要多少帧静音才确认，默认 8 */
  redemptionFrames?: number;
}

export interface SileroVADBridge {
  initialize(): Promise<void>;
  start(): void;
  pause(): void;
  destroy(): void;
  isInitialized(): boolean;
}

/**
 * Silero VAD 桥接实现
 */
class SileroVADBridgeImpl implements SileroVADBridge {
  private instance: SileroMicVAD | null = null;
  private options: SileroVADOptions;

  constructor(options: SileroVADOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.instance) {
      return;
    }

    let SileroVAD: SileroMicVADClass;
    try {
      // Lazy load — 仅在需要时引入
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const mod = await import('@ricky0123/vad-web');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      SileroVAD = mod.MicVAD;
    } catch {
      throw new Error(
        '[SileroVADBridge] @ricky0123/vad-web is not installed. ' +
        'Run: npm install @ricky0123/vad-web'
      );
    }

    const vadOptions: SileroMicVADOpts = {
      onSpeechStart: () => {
        this.options.onSpeechStart?.();
      },
      onSpeechEnd: () => {
        this.options.onSpeechEnd?.();
      },
      onFrameProcessed: (probs: number[]) => {
        // 取最新帧的概率值传递给回调
        if (probs.length > 0) {
          this.options.onFrameProcessed?.(probs[probs.length - 1]);
        }
      },
    };

    if (this.options.model) {
      vadOptions.model = this.options.model;
    }
    if (this.options.positiveSpeechThreshold !== undefined) {
      vadOptions.positiveSpeechThreshold = this.options.positiveSpeechThreshold;
    }
    if (this.options.negativeSpeechThreshold !== undefined) {
      vadOptions.negativeSpeechThreshold = this.options.negativeSpeechThreshold;
    }
    if (this.options.minSpeechFrames !== undefined) {
      vadOptions.minSpeechFrames = this.options.minSpeechFrames;
    }
    if (this.options.redemptionFrames !== undefined) {
      vadOptions.redemptionFrames = this.options.redemptionFrames;
    }

    this.instance = await new SileroVAD(vadOptions);
  }

  start(): void {
    this.instance?.start();
  }

  pause(): void {
    this.instance?.pause();
  }

  destroy(): void {
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
  }

  isInitialized(): boolean {
    return this.instance !== null;
  }
}

/**
 * 工厂函数 — 创建 Silero VAD 桥接实例
 */
export async function createSileroVAD(options: SileroVADOptions = {}): Promise<SileroVADBridge> {
  const bridge = new SileroVADBridgeImpl(options);
  await bridge.initialize();
  return bridge;
}

export { SileroVADBridgeImpl };
