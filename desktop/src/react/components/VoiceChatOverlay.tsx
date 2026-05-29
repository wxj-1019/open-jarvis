/**
 * VoiceChatOverlay.tsx — 全屏语音对话浮层
 *
 * 提供沉浸式语音对话体验:
 * - 显示当前对话状态 (listening/processing/speaking)
 * - 显示用户识别文本和 AI 回复文本
 * - 提供停止/暂停/恢复控制
 * - 对话结束后自动隐藏
 * - 使用 CSS 动画提供视觉反馈
 */

import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { X, Microphone, Think, SpeakerHigh, Pause, Play, Stop } from '@phosphor-icons/react';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import styles from './VoiceChatOverlay.module.css';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'paused' | 'error';

interface VoiceChatOverlayProps {
  /** 是否打开浮层 */
  isOpen: boolean;
  /** 关闭浮层回调 */
  onClose: () => void;
  /** 状态变化时回调 */
  onStateChange?: (state: VoiceState) => void;
}

const STATE_CONFIG: Record<VoiceState, {
  emoji: string;
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  idle: {
    emoji: '🤖',
    label: '点击开始对话',
    color: 'var(--accent, #537d96)',
    icon: <PhosphorIcon icon={Microphone} size={48} weight="light" />,
  },
  listening: {
    emoji: '🎤',
    label: '正在听你说话...',
    color: 'var(--color-red-600, #dc2626)',
    icon: <PhosphorIcon icon={Microphone} size={48} weight="fill" />,
  },
  processing: {
    emoji: '🤔',
    label: '正在思考...',
    color: 'var(--color-amber-600, #d97706)',
    icon: <PhosphorIcon icon={Think} size={48} weight="fill" />,
  },
  speaking: {
    emoji: '🔊',
    label: '正在回答...',
    color: 'var(--color-green-600, #16a34a)',
    icon: <PhosphorIcon icon={SpeakerHigh} size={48} weight="fill" />,
  },
  paused: {
    emoji: '⏸',
    label: '已暂停',
    color: 'var(--color-gray-600, #4b5563)',
    icon: <PhosphorIcon icon={Pause} size={48} weight="fill" />,
  },
  error: {
    emoji: '⚠️',
    label: '出错了',
    color: 'var(--color-red-800, #991b1b)',
    icon: <PhosphorIcon icon={Think} size={48} weight="bold" />,
  },
};

export const VoiceChatOverlay = memo(function VoiceChatOverlay({
  isOpen,
  onClose,
  onStateChange,
}: VoiceChatOverlayProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [duration, setDuration] = useState(0);
  const [isAutoClosing, setIsAutoClosing] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const hana = (window as any).hana;
    if (!hana) return;

    const cleanupState = hana.onVoiceStateChange?.((newState: VoiceState) => {
      setState(newState);
      onStateChange?.(newState);

      if (newState === 'listening' || newState === 'speaking') {
        setDuration(0);
        clearAutoCloseTimer();
        setIsAutoClosing(false);
      }

      if (newState === 'idle' && userText && aiText) {
        autoCloseTimerRef.current = setTimeout(() => {
          setIsAutoClosing(true);
          setTimeout(onClose, 300);
        }, 3000);
      }
    });

    const cleanupUser = hana.onVoiceUserText?.((text: string) => {
      setUserText(text);
      clearAutoCloseTimer();
      setIsAutoClosing(false);
    });

    const cleanupAi = hana.onVoiceAiText?.((text: string) => {
      setAiText(text);
    });

    return () => {
      cleanupState?.();
      cleanupUser?.();
      cleanupAi?.();
      clearAutoCloseTimer();
    };
  }, [isOpen, onStateChange, userText, aiText, onClose, clearAutoCloseTimer]);

  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      setDuration(0);
      const timer = setInterval(() => setDuration((d) => d + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [state]);

  const handleStop = useCallback(() => {
    const hana = (window as any).hana;
    if (!hana) return;
    clearAutoCloseTimer();
    setIsAutoClosing(false);
    hana.stopVoiceConversation?.();
  }, [clearAutoCloseTimer]);

  const handlePauseResume = useCallback(() => {
    const hana = (window as any).hana;
    if (!hana) return;

    if (state === 'paused') {
      hana.resumeVoiceConversation?.();
    } else if (state !== 'idle' && state !== 'error') {
      hana.pauseVoiceConversation?.();
    }
  }, [state]);

  const handleClose = useCallback(() => {
    clearAutoCloseTimer();
    setIsAutoClosing(false);
    onClose();
  }, [onClose, clearAutoCloseTimer]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const config = STATE_CONFIG[state];
  const isActive = state === 'listening' || state === 'speaking' || state === 'processing';

  return (
    <div
      className={`${styles.overlay} ${isAutoClosing ? styles['overlay-exit'] : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="语音对话"
    >
      <button
        onClick={handleClose}
        className={styles['close-btn']}
        aria-label="关闭语音对话"
      >
        <PhosphorIcon icon={X} size={24} weight="regular" />
      </button>

      <div className={`${styles.content} ${isActive ? styles['content-active'] : ''}`}>
        <div className={`${styles.icon-wrapper} ${styles[`state-${state}`]}`}>
          {config.icon}
        </div>

        <h2 className={styles.title}>Jarvis</h2>

        <p className={styles.status}>{config.label}</p>

        {(state === 'listening' || state === 'speaking') && (
          <span className={styles.duration}>
            {formatDuration(duration)}
          </span>
        )}

        {state === 'listening' && (
          <div className={styles.waveform}>
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className={styles.waveformBar}
                style={{
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
        )}

        {aiText && (
          <div className={`${styles.textCard} ${styles['ai-card']}`}>
            <p className={styles.textCardLabel}>AI 回复</p>
            <p className={styles.textCardContent}>{aiText}</p>
          </div>
        )}

        {userText && (
          <div className={`${styles.textCard} ${styles['user-card']}`}>
            <p className={styles.textCardLabel}>你说了</p>
            <p className={styles.textCardContent}>"{userText}"</p>
          </div>
        )}

        {state !== 'idle' && state !== 'error' && (
          <div className={styles.controls}>
            <button
              onClick={handlePauseResume}
              className={`${styles.controlBtn} ${styles['pause-btn']}`}
              aria-label={state === 'paused' ? '恢复对话' : '暂停对话'}
              title={state === 'paused' ? '恢复对话' : '暂停对话'}
            >
              <PhosphorIcon
                icon={state === 'paused' ? Play : Pause}
                size={20}
                weight="fill"
              />
              <span>{state === 'paused' ? '恢复' : '暂停'}</span>
            </button>

            <button
              onClick={handleStop}
              className={`${styles.controlBtn} ${styles['stop-btn']}`}
              aria-label="停止对话"
              title="停止对话"
            >
              <PhosphorIcon icon={Stop} size={20} weight="fill" />
              <span>停止对话</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
