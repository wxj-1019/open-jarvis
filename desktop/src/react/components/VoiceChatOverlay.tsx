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

import { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { X, Microphone, Lightbulb, SpeakerHigh, Pause, Play, Stop } from '@phosphor-icons/react';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { formatDuration, type VoiceState } from '../utils/voice-helpers';
import styles from './VoiceChatOverlay.module.css';

const t = (key: string, vars?: Record<string, string | number>): string => window.t?.(key, vars) ?? key;

interface VoiceChatOverlayProps {
  /** 是否打开浮层 */
  isOpen: boolean;
  /** 关闭浮层回调 */
  onClose: () => void;
  /** 状态变化时回调 */
  onStateChange?: (state: VoiceState) => void;
}

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => i);

function getStateLabel(state: VoiceState): string {
  return t(`voiceOverlay.${state}`);
}

function getStateColor(state: VoiceState): string {
  switch (state) {
    case 'listening': return 'var(--color-red-600, #dc2626)';
    case 'processing': return 'var(--color-amber-600, #d97706)';
    case 'speaking': return 'var(--color-green-600, #16a34a)';
    case 'paused': return 'var(--color-gray-600, #4b5563)';
    case 'error': return 'var(--color-red-800, #991b1b)';
    default: return 'var(--accent, #537d96)';
  }
}

function getStateIcon(state: VoiceState): React.ReactNode {
  switch (state) {
    case 'listening': return <PhosphorIcon icon={Microphone} size={48} weight="fill" />;
    case 'processing': return <PhosphorIcon icon={Lightbulb} size={48} weight="fill" />;
    case 'speaking': return <PhosphorIcon icon={SpeakerHigh} size={48} weight="fill" />;
    case 'paused': return <PhosphorIcon icon={Pause} size={48} weight="fill" />;
    case 'error': return <PhosphorIcon icon={Lightbulb} size={48} weight="bold" />;
    default: return <PhosphorIcon icon={Microphone} size={48} weight="light" />;
  }
}

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
  const userTextRef = useRef('');
  const aiTextRef = useRef('');

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const hana = window.hana;
    if (!hana) return;

    const cleanupState = hana.onVoiceStateChange?.((newState: string) => {
      setState(newState as VoiceState);
      onStateChange?.(newState as VoiceState);

      if (newState === 'listening' || newState === 'speaking') {
        setDuration(0);
        clearAutoCloseTimer();
        setIsAutoClosing(false);
      }

      if (newState === 'idle' && userTextRef.current && aiTextRef.current) {
        autoCloseTimerRef.current = setTimeout(() => {
          setIsAutoClosing(true);
          autoCloseTimerRef.current = setTimeout(() => onClose(), 300);
        }, 3000);
      }
    });

    const cleanupUser = hana.onVoiceUserText?.((text: string) => {
      setUserText(text);
      userTextRef.current = text;
      clearAutoCloseTimer();
      setIsAutoClosing(false);
    });

    const cleanupAi = hana.onVoiceAiText?.((text: string) => {
      setAiText(text);
      aiTextRef.current = text;
    });

    return () => {
      cleanupState?.();
      cleanupUser?.();
      cleanupAi?.();
      clearAutoCloseTimer();
    };
  }, [isOpen, onStateChange, onClose, clearAutoCloseTimer]);

  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      setDuration(0);
      const timer = setInterval(() => setDuration((d) => d + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [state]);

  const handleStop = useCallback(() => {
    const hana = window.hana;
    if (!hana) return;
    clearAutoCloseTimer();
    setIsAutoClosing(false);
    hana.stopVoiceConversation?.();
  }, [clearAutoCloseTimer]);

  const handlePauseResume = useCallback(() => {
    const hana = window.hana;
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

  if (!isOpen) return null;

  const isActive = state === 'listening' || state === 'speaking' || state === 'processing';

  return (
    <div
      className={`${styles.overlay} ${isAutoClosing ? styles['overlay-exit'] : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('pageMode.voice')}
    >
      <button
        onClick={handleClose}
        className={styles['close-btn']}
        aria-label={t('voiceOverlay.closeVoice')}
      >
        <PhosphorIcon icon={X} size={24} weight="regular" />
      </button>

      <div className={`${styles.content} ${isActive ? styles['content-active'] : ''}`}>
        <div className={`${styles['icon-wrapper']} ${styles[`state-${state}`]}`}>
          {getStateIcon(state)}
        </div>

        <h2 className={styles.title}>Jarvis</h2>

        <p className={styles.status}>{getStateLabel(state)}</p>

        {(state === 'listening' || state === 'speaking') && (
          <span className={styles.duration}>
            {formatDuration(duration)}
          </span>
        )}

        {state === 'listening' && (
          <div className={styles.waveform}>
            {WAVEFORM_BARS.map((i) => (
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
            <p className={styles.textCardLabel}>{t('voiceOverlay.aiReply')}</p>
            <p className={styles.textCardContent}>{aiText}</p>
          </div>
        )}

        {userText && (
          <div className={`${styles.textCard} ${styles['user-card']}`}>
            <p className={styles.textCardLabel}>{t('voiceOverlay.youSaid')}</p>
            <p className={styles.textCardContent}>"{userText}"</p>
          </div>
        )}

        {state !== 'idle' && state !== 'error' && (
          <div className={styles.controls}>
            <button
              onClick={handlePauseResume}
              className={`${styles.controlBtn} ${styles['pause-btn']}`}
              aria-label={state === 'paused' ? t('voiceOverlay.resumeConversation') : t('voiceOverlay.pauseConversation')}
              title={state === 'paused' ? t('voiceOverlay.resumeConversation') : t('voiceOverlay.pauseConversation')}
            >
              <PhosphorIcon
                icon={state === 'paused' ? Play : Pause}
                size={20}
                weight="fill"
              />
              <span>{state === 'paused' ? t('voiceOverlay.resume') : t('voiceOverlay.pause')}</span>
            </button>

            <button
              onClick={handleStop}
              className={`${styles.controlBtn} ${styles['stop-btn']}`}
              aria-label={t('voiceOverlay.stopConversation')}
              title={t('voiceOverlay.stopConversation')}
            >
              <PhosphorIcon icon={Stop} size={20} weight="fill" />
              <span>{t('voiceOverlay.stop')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
