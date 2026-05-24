/**
 * VoiceButton.tsx — 语音输入按钮
 *
 * Push-to-talk 模式：按下开始监听，松开停止并发送识别文本。
 * 使用 Chromium 的 Web Speech API (webkitSpeechRecognition)。
 */

import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Microphone, MicrophoneSlash } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
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

export const VoiceButton = memo(function VoiceButton({
  onRecognized,
  disabled = false,
  isStreaming = false,
}: VoiceButtonProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>(() => {
    const available = typeof window !== 'undefined'
      && (!!(window as any).webkitSpeechRecognition || !!(window as any).SpeechRecognition);
    return available ? 'idle' : 'unavailable';
  });

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef<string[]>([]);
  const pressedRef = useRef(false);
  const isRecognizingRef = useRef(false);
  const onRecognizedRef = useRef(onRecognized);
  onRecognizedRef.current = onRecognized;

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

        // 选择最佳语音
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

  // 初始化 SpeechRecognition
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
        // 短暂显示 processing 后回到 idle
        setTimeout(() => {
          setVoiceState('idle');
          pressedRef.current = false;
          isRecognizingRef.current = false;
        }, 300);
      } else {
        setVoiceState('idle');
        pressedRef.current = false;
        isRecognizingRef.current = false;
      }
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' 和 'aborted' 不是真正的错误
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setVoiceState('idle');
        pressedRef.current = false;
        isRecognizingRef.current = false;
        return;
      }
      console.warn('[Voice] Speech recognition error:', event.error);
      setVoiceState('error');
      pressedRef.current = false;
      isRecognizingRef.current = false;
      // 短暂显示错误后恢复
      setTimeout(() => setVoiceState('idle'), 2000);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (disabled || voiceState === 'unavailable' || voiceState === 'processing') return;

    const recognition = getRecognition();
    if (!recognition) {
      setVoiceState('unavailable');
      return;
    }

    pressedRef.current = true;
    isRecognizingRef.current = true;
    finalTextRef.current = [];
    setVoiceState('listening');

    try {
      recognition.start();
    } catch {
      // 可能已经启动了
      try { recognition.stop(); } catch {}
      try {
        recognition.start();
      } catch {
        setVoiceState('error');
        pressedRef.current = false;
        isRecognizingRef.current = false;
        setTimeout(() => setVoiceState('idle'), 2000);
      }
    }
  }, [disabled, voiceState, getRecognition]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (!pressedRef.current) return;

    const recognition = recognitionRef.current;
    if (recognition) {
        try {
          recognition.stop();
        } catch {
          // 可能已经停止了
          if (pressedRef.current) {
            // 如果 stop 失败但还在按住状态，立即发送已有结果
            const finalText = finalTextRef.current.join(' ').trim();
            finalTextRef.current = [];
            if (finalText) {
              setVoiceState('processing');
              onRecognizedRef.current(finalText);
              setTimeout(() => setVoiceState('idle'), 300);
            } else {
              setVoiceState('idle');
            }
            pressedRef.current = false;
            isRecognizingRef.current = false;
          }
        }
      }
  }, []);

  // 清理 SpeechRecognition 和 TTS
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        try { recognition.stop(); } catch {}
        recognitionRef.current = null;
      }
      // 停止正在播放的 TTS
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (voiceState === 'unavailable') return null;

  const isActive = voiceState === 'listening' || voiceState === 'processing';

  return (
    <button
      className={`${styles['attach-btn']} ${styles['voice-btn']} ${isActive ? styles['voice-btn-active'] : ''} ${voiceState === 'listening' ? styles['voice-btn-listening'] : ''}`}
      title={
        voiceState === 'listening' ? 'Listening... Release to send' :
        voiceState === 'processing' ? 'Processing...' :
        voiceState === 'error' ? 'Voice recognition error' :
        'Hold to speak'
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={(e) => {
        // 如果按住时移出按钮区域，也停止
        if (pressedRef.current) {
          handlePointerUp(e);
        }
      }}
      disabled={disabled || voiceState === 'error'}
    >
      <PhosphorIcon
        icon={voiceState === 'error' ? MicrophoneSlash : Microphone}
        size={14}
        weight={isActive ? 'fill' : 'regular'}
      />
    </button>
  );
});
