import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BargeInDetector } from '../lib/speech/barge-in-detector.js';

describe('BargeInDetector', () => {
  let detector;
  let mockVad;

  beforeEach(() => {
    vi.useFakeTimers();
    mockVad = {
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    detector = new BargeInDetector(mockVad, { thresholdMs: 300 });
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
  });

  it('should start listening for speech during TTS playback', () => {
    detector.start();
    expect(mockVad.on).toHaveBeenCalledWith('speechstart', expect.any(Function));
  });

  it('should not trigger interrupt before threshold', () => {
    const onInterrupt = vi.fn();
    detector.on('interrupt', onInterrupt);
    detector.start();

    const handler = mockVad.on.mock.calls.find(c => c[0] === 'speechstart')[1];
    handler();

    vi.advanceTimersByTime(200);
    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it('should trigger interrupt after threshold exceeded', () => {
    const onInterrupt = vi.fn();
    detector.on('interrupt', onInterrupt);
    detector.start();

    const handler = mockVad.on.mock.calls.find(c => c[0] === 'speechstart')[1];
    handler();

    vi.advanceTimersByTime(350);
    expect(onInterrupt).toHaveBeenCalledOnce();
  });

  it('should stop cleanly without triggering interrupt', () => {
    const onInterrupt = vi.fn();
    detector.on('interrupt', onInterrupt);
    detector.start();

    detector.stop();
    vi.advanceTimersByTime(1000);
    expect(onInterrupt).not.toHaveBeenCalled();
    expect(mockVad.removeListener).toHaveBeenCalled();
  });
});
