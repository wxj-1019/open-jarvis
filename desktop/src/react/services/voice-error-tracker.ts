/**
 * voice-error-tracker.ts — 语音对话错误追踪服务
 *
 * 职责：
 *   - 捕获语音对话相关错误
 *   - 上报到 Sentry（如果已配置）
 *   - 提供本地错误日志查询
 */

export interface VoiceErrorContext {
  error: Error;
  component: string;
  state?: string;
  audioBlob?: Blob;
  metadata?: Record<string, unknown>;
}

interface VoiceErrorLogEntry extends VoiceErrorContext {
  timestamp: string;
}

export class VoiceErrorTracker {
  private static instance: VoiceErrorTracker;
  private errorLog: VoiceErrorLogEntry[] = [];
  private maxLogSize = 50;

  private constructor() {}

  static getInstance(): VoiceErrorTracker {
    if (!VoiceErrorTracker.instance) {
      VoiceErrorTracker.instance = new VoiceErrorTracker();
    }
    return VoiceErrorTracker.instance;
  }

  captureError(context: VoiceErrorContext): void {
    const entry: VoiceErrorLogEntry = {
      ...context,
      timestamp: new Date().toISOString(),
    };

    this.errorLog.push(entry);
    this.trimLog();

    this.reportToSentry(context);

    if (process.env.NODE_ENV === 'development') {
      console.error('[VoiceError]', context.error, context);
    }
  }

  getErrorLog(): VoiceErrorLogEntry[] {
    return [...this.errorLog];
  }

  clearLog(): void {
    this.errorLog = [];
  }

  private trimLog(): void {
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
  }

  private reportToSentry(context: VoiceErrorContext): void {
    import('@sentry/electron').then((Sentry) => {
      Sentry.captureException(context.error, {
        extra: {
          component: context.component,
          state: context.state,
          metadata: context.metadata,
        },
        tags: {
          feature: 'voice-conversation',
        },
      });
    }).catch(() => {
      // Sentry 未安装，静默忽略
    });
  }
}

export const voiceErrorTracker = VoiceErrorTracker.getInstance();
