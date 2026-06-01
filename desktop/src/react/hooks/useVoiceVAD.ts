/**
 * useVoiceVAD.ts — VAD AudioWorklet 桥接 Hook
 *
 * 封装 createVADWorklet，将 RMS 能量值通过 IPC 发送到主进程。
 * 数据流: AudioWorklet → onEnergy → sendAudioEnergy → VADService
 */

import { useEffect, useRef, useCallback } from 'react';
import { createVADWorklet } from '../utils/vad-worklet';

interface UseVoiceVADOptions {
  /** 是否启用 VAD */
  enabled?: boolean;
  /** 语音开始回调 */
  onSpeechStart?: () => void;
  /** 语音结束回调 */
  onSpeechEnd?: () => void;
}

/**
 * 启动 VAD AudioWorklet 并桥接 RMS 到主进程
 * @returns start/stop 控制函数
 */
export function useVoiceVAD(options: UseVoiceVADOptions = {}) {
  const { enabled = true, onSpeechStart, onSpeechEnd } = options;
  const cleanupRef = useRef<(() => void) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    if (cleanupRef.current) {
      return;
    }

    try {
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
  }, [onSpeechStart, onSpeechEnd]);

  const stop = useCallback(() => {
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

    // enabled 变为 true 时自动启动 VAD
    start().catch((err) => {
      console.error('[useVoiceVAD] auto-start failed:', err);
    });

    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  return { start, stop };
}
