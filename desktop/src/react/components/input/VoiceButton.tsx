/**
 * VoiceButton.tsx — 语音输入按钮
 *
 * Push-to-talk 模式：按下开始监听，松开停止并发送识别文本。
 * 双模式支持：
 * 1. Web Speech API（浏览器原生，需要 Google 服务）
 * 2. MediaRecorder + Whisper API（本地录音 + 服务器识别，备用方案）
 */

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Microphone, MicrophoneSlash } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { AudioRecorder, type RecorderState } from '../../utils/audio-recorder';
import { speechToText, isWebSpeechAvailable } from '../../utils/speech-to-text';
import styles from './InputArea.module.css';

export interface VoiceRecognitionResult {
  text: string;
  isFinal: boolean;
}

interface VoiceButtonProps {
  /** 识别到最终文本时回调 */
  onRecognized: (text: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 当前是否正在流式输出 */
  isStreaming?: boolean;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'error' | 'unavailable';

/** 检测是否有任何语音输入方式可用 */
function isAnyVoiceAvailable(): boolean {
  return isWebSpeechAvailable() || AudioRecorder.isSupported();
}

export const VoiceButton = memo(function VoiceButton({
  onRecognized,
  disabled = false,
  isStreaming = false,
}: VoiceButtonProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>(() => {
    return isAnyVoiceAvailable() ? 'idle' : 'unavailable';
  });

  // 模式：'webkit' = 浏览器原生, 'recorder' = 录音+Whisper
  const modeRef = useRef<'webkit' | 'recorder'>(isWebSpeechAvailable() ? 'webkit' : 'recorder');

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef<string[]>([]);
  const pressedRef = useRef(false);
  const isRecognizingRef = useRef(false);
  const isTranscribingRef = useRef(false);
  const onRecognizedRef = useRef(onRecognized);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  onRecognizedRef.current = onRecognized;

  // MediaRecorder 备用方案
  const recorderRef = useRef<AudioRecorder | null>(null);
  const interimTextRef = useRef('');

  // 监听服务器 speak 请求，触发 TTS 播放
  useEffect(() => {
    const hana = (window as any).hana;
    if (!hana?.onSpeakRequest) return;

    const unsub = hana.onSpeakRequest((text: string, opts?: { lang?: string; rate?: number; pitch?: number; volume?: number }) => {
      if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        if (opts?.lang) utterance.lang = opts.lang;
        if (opts?.rate !== undefined) utterance.rate = opts.rate;
        if (opts?.pitch !== undefined) utterance.pitch = opts.pitch;
        if (opts?.volume !== undefined) utterance.volume = opts.volume;

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const lang = opts?.lang || 'zh-CN';
          const match = voices.find(v => v.lang.startsWith(lang)) || voices[0];
          utterance.voice = match;
        }

        window.speechSynthesis.speak(utterance);
      } catch {
        // TTS 不可用，静默忽略
      }
    });

    return unsub;
  }, []);

  const scheduleStateReset = useCallback((state: VoiceState, delay: number) => {
    const timer = setTimeout(() => {
      setVoiceState(state);
      timersRef.current = timersRef.current.filter(t => t !== timer);
    }, delay);
    timersRef.current.push(timer);
  }, []);

  // 初始化 AudioRecorder（备用方案）
  const getRecorder = useCallback(() => {
    if (recorderRef.current) return recorderRef.current;

    const recorder = new AudioRecorder({ sampleRate: 16000, maxDurationMs: 60000 });
    recorder.setCallbacks({
      onStateChange: (state: RecorderState) => {
        if (state === 'recording') {
          setVoiceState('listening');
        } else if (state === 'stopped') {
          setVoiceState('processing');
        } else if (state === 'error') {
          setVoiceState('error');
          pressedRef.current = false;
          isRecognizingRef.current = false;
          scheduleStateReset('idle', 2000);
        }
      },
      onError: (err: Error) => {
        console.error('[Voice] Recorder error:', err);
        setVoiceState('error');
        pressedRef.current = false;
        isRecognizingRef.current = false;
        scheduleStateReset('idle', 2000);
      },
      onData: async (result) => {
        isTranscribingRef.current = true;
        setVoiceState('processing');
        try {
          const { text } = await speechToText({
            backend: 'whisper',
            audioBlob: result.blob,
            lang: 'zh',
            timeoutMs: 30000,
          });
          if (text) {
            onRecognizedRef.current(text);
            scheduleStateReset('idle', 300);
          } else {
            setVoiceState('idle');
            pressedRef.current = false;
            isTranscribingRef.current = false;
          }
        } catch (err) {
          console.error('[Voice] Whisper transcription failed:', err);
          setVoiceState('error');
          pressedRef.current = false;
          isTranscribingRef.current = false;
          scheduleStateReset('idle', 2000);
        }
      },
    });

    recorderRef.current = recorder;
    return recorder;
  }, []);

  // 初始化 SpeechRecognition（原生方案）
  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognitionCtor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognitionCtor) return null;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onresult = (event: any) => {
      const results: VoiceRecognitionResult[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        results.push({
          text: event.results[i][0].transcript,
          isFinal: event.results[i].isFinal,
        });
      }

      const finalParts = results.filter(r => r.isFinal).map(r => r.text);
      if (finalParts.length > 0) {
        finalTextRef.current.push(...finalParts);
      }
    };

    recognition.onend = () => {
      const finalText = finalTextRef.current.join(' ').trim();
      finalTextRef.current = [];

      if (finalText && isRecognizingRef.current) {
        setVoiceState('processing');
        onRecognizedRef.current(finalText);
        scheduleStateReset('idle', 300);
      } else {
        setVoiceState('idle');
        pressedRef.current = false;
        isRecognizingRef.current = false;
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setVoiceState('idle');
        pressedRef.current = false;
        isRecognizingRef.current = false;
        return;
      }
      if (event.error === 'not-allowed') {
        console.warn('[Voice] Microphone permission denied');
        setVoiceState('error');
        pressedRef.current = false;
        isRecognizingRef.current = false;
        scheduleStateReset('idle', 2000);
        return;
      }
      if (event.error === 'network') {
        console.warn('[Voice] Web Speech network error, switching to recorder mode');
        modeRef.current = 'recorder';
        setVoiceState('error');
        pressedRef.current = false;
        isRecognizingRef.current = false;
        scheduleStateReset('idle', 2000);
        return;
      }
      console.warn('[Voice] Speech recognition error:', event.error);
      setVoiceState('error');
      pressedRef.current = false;
      isRecognizingRef.current = false;
      scheduleStateReset('idle', 2000);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled || voiceState === 'unavailable' || voiceState === 'processing') return;

    pressedRef.current = true;
    isRecognizingRef.current = true;
    finalTextRef.current = [];
    interimTextRef.current = '';

    // 每次按下时重新评估模式，优先尝试 Web Speech
    if (isWebSpeechAvailable()) {
      modeRef.current = 'webkit';
    }

    // 根据当前模式选择识别方式
    if (modeRef.current === 'webkit') {
      const recognition = getRecognition();
      if (!recognition) {
        modeRef.current = 'recorder';
      } else {
        setVoiceState('listening');
        try {
          recognition.start();
          return;
        } catch {
          modeRef.current = 'recorder';
        }
      }
    }

    if (modeRef.current === 'recorder') {
      const recorder = getRecorder();
      setVoiceState('listening');
      recorder.start().catch((err: Error) => {
        console.error('[Voice] Failed to start recorder:', err);
        setVoiceState('error');
        pressedRef.current = false;
        isRecognizingRef.current = false;
        scheduleStateReset('idle', 2000);
      });
    }
  }, [disabled, voiceState, getRecognition, getRecorder]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (!pressedRef.current) return;

    if (modeRef.current === 'webkit') {
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          if (pressedRef.current) {
            const finalText = finalTextRef.current.join(' ').trim();
            finalTextRef.current = [];
            if (finalText) {
              setVoiceState('processing');
              onRecognizedRef.current(finalText);
              scheduleStateReset('idle', 300);
            } else {
              setVoiceState('idle');
              pressedRef.current = false;
              isRecognizingRef.current = false;
            }
          }
        }
      }
    } else {
      const recorder = recorderRef.current;
      if (recorder && recorder.getState() === 'recording') {
        recorder.stop();
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      const recognition = recognitionRef.current;
      if (recognition) {
        try { recognition.stop(); } catch {}
        recognitionRef.current = null;
      }
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.destroy();
        recorderRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const isActive = voiceState === 'listening' || voiceState === 'processing';

  return (
    <button
      className={`${styles['attach-btn']} ${styles['voice-btn']} ${isActive ? styles['voice-btn-active'] : ''} ${voiceState === 'listening' ? styles['voice-btn-listening'] : ''} ${voiceState === 'listening' && modeRef.current === 'recorder' ? styles['voice-btn-recording'] : ''}`}
      title={
        voiceState === 'unavailable' ? '语音输入不可用（浏览器不支持录音）' :
        voiceState === 'listening' ? '正在录音... 松开发送' :
        voiceState === 'processing' ? '正在识别...' :
        voiceState === 'error' ? '语音识别出错' :
        '按住说话'
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={(e) => {
        // 如果按住时移出按钮区域，也停止
        if (pressedRef.current) {
          handlePointerUp(e);
        }
      }}
      disabled={disabled || voiceState === 'unavailable'}
    >
      <PhosphorIcon
        icon={voiceState === 'error' || voiceState === 'unavailable' ? MicrophoneSlash : Microphone}
        size={14}
        weight={isActive ? 'fill' : 'regular'}
      />
    </button>
  );
});
