import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceErrorTracker, voiceErrorTracker } from '../../desktop/src/react/services/voice-error-tracker';

describe('VoiceErrorTracker', () => {
  beforeEach(() => {
    voiceErrorTracker.clearLog();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be a singleton', () => {
    const instance1 = VoiceErrorTracker.getInstance();
    const instance2 = VoiceErrorTracker.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should capture error with context', () => {
    const error = new Error('STT timeout');
    voiceErrorTracker.captureError({
      error,
      component: 'WhisperSTTAdapter',
      state: 'PROCESSING',
      metadata: { attempt: 1 },
    });

    const log = voiceErrorTracker.getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].error).toBe(error);
    expect(log[0].component).toBe('WhisperSTTAdapter');
    expect(log[0].state).toBe('PROCESSING');
    expect(log[0].metadata).toEqual({ attempt: 1 });
    expect(log[0].timestamp).toBeDefined();
  });

  it('should limit log size to 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      voiceErrorTracker.captureError({
        error: new Error(`Error ${i}`),
        component: 'Test',
      });
    }

    const log = voiceErrorTracker.getErrorLog();
    expect(log).toHaveLength(50);
    expect(log[0].error.message).toBe('Error 10');
    expect(log[49].error.message).toBe('Error 59');
  });

  it('should clear log', () => {
    voiceErrorTracker.captureError({
      error: new Error('test'),
      component: 'Test',
    });

    expect(voiceErrorTracker.getErrorLog()).toHaveLength(1);

    voiceErrorTracker.clearLog();
    expect(voiceErrorTracker.getErrorLog()).toHaveLength(0);
  });

  it('should return copy of log (not reference)', () => {
    voiceErrorTracker.captureError({
      error: new Error('test'),
      component: 'Test',
    });

    const log1 = voiceErrorTracker.getErrorLog();
    const log2 = voiceErrorTracker.getErrorLog();
    expect(log1).not.toBe(log2);
  });

  it('should attempt dynamic import of Sentry', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    voiceErrorTracker.captureError({
      error: new Error('test'),
      component: 'Test',
    });

    // Sentry 未安装时应静默忽略
    expect(consoleSpy).not.toHaveBeenCalledWith('[VoiceError]', expect.any(Error), expect.any(Object));
    
    consoleSpy.mockRestore();
  });
});
