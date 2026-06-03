/**
 * useVoiceVAD.ts — VAD 桥接 Hook
 *
 * 支持三种模式：
 *   - 'rms':    纯 AudioWorklet RMS 能量检测（原有行为）
 *   - 'hybrid': Silero VAD 为主，RMS fallback
 *   - 'silero': 纯 Silero VAD，RMS fallback
 *
 * 数据流:
 *   rms:    AudioWorklet → onEnergy → sendAudioEnergy → VADService
 *   silero: SileroVADBridge → onSpeechStart/End → 直接回调
 *   hybrid: SileroVADBridge → onSpeechStart/End → 直接回调（失败回退 RMS）
 */

import { useEffect, useRef, useCallback } from 'react';
import { createVADWorklet } from '../utils/vad-worklet';
import { createSileroVAD, type SileroVADBridge } from '../utils/silero-vad-bridge';

export type VADMode = 'rms' | 'hybrid' | 'silero';

interface UseVoiceVADOptions {
  /** 是否启用 VAD */
  enabled?: boolean;
  /** VAD 模式: 'rms' | 'hybrid' | 'silero'，默认 'rms' */
  vadMode?: VADMode;
  /** 语音开始回调 */
  onSpeechStart?: () => void;
  /** 语音结束回调 */
  onSpeechEnd?: () => void;
}

/**
 * 启动 VAD 并桥接到主进程
 * @returns start/stop 控制函数
 */
export function useVoiceVAD(options: UseVoiceVADOptions = {}) {
  const { enabled = true, vadMode = 'rms', onSpeechStart, onSpeechEnd } = options;
  const cleanupRef = useRef<(() => void) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sileroBridgeRef = useRef<SileroVADBridge | null>(null);

  const start = useCallback(async () => {
    if (cleanupRef.current || sileroBridgeRef.current) {
      return;
    }

    try {
      // Silero 模式（hybrid / silero）
      if (vadMode === 'silero' || vadMode === 'hybrid') {
        try {
          const bridge = await createSileroVAD({
            onSpeechStart,
            onSpeechEnd,
          });
          bridge.start();
          sileroBridgeRef.current = bridge;
          return;
        } catch (err) {
          console.warn(
            '[useVoiceVAD] Silero VAD init failed, falling back to RMS:',
            err instanceof Error ? err.message : String(err)
          );
          // 继续走 RMS 路径
        }
      }

      // RMS 模式（或 Silero 回退）
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const hana = window.hana;
      if (!hana?.sendAudioEnergy) {
        throw new Error('window.hana.sendAudioEnergy not available');
      }

      const sendAudioEnergy = hana.sendAudioEnergy;
      const cleanup = await createVADWorklet(stream, {
        onEnergy: (rms: number) => {
          sendAudioEnergy(rms);
        },
        onSpeechStart,
        onSpeechEnd,
      });

      cleanupRef.current = cleanup;
    } catch (err) {
      console.error('[useVoiceVAD] failed to start:', err);
      throw err;
    }
  }, [vadMode, onSpeechStart, onSpeechEnd]);

  const stop = useCallback(() => {
    if (sileroBridgeRef.current) {
      sileroBridgeRef.current.destroy();
      sileroBridgeRef.current = null;
    }
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    start().catch((err) => {
      console.error('[useVoiceVAD] auto-start failed:', err);
    });

    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  return { start, stop };
}
