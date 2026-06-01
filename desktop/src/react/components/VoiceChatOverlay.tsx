/**
 * VoiceChatOverlay.tsx — 全屏语音对话浮层
 *
 * 提供沉浸式语音对话体验:
 * - 显示当前对话状态 (listening/processing/speaking)
 * - 显示用户识别文本和 AI 回复文本
 * - 提供停止/暂停/恢复控制
 * - 对话结束后自动隐藏
 * - 使用 CSS 动画提供视觉反馈
 *
 * 使用渲染进程侧 useVoiceConversation hook 实现完整对话循环。
 */

import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { X, Microphone, Lightbulb, SpeakerHigh, Pause, Play, Stop } from '@phosphor-icons/react';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { formatDuration } from '../utils/voice-helpers';
import { useVoiceConversation, type VoiceConversationState } from '../hooks/useVoiceConversation';
import styles from './VoiceChatOverlay.module.css';

const t = (key: string, vars?: Record<string, string | number>): string => window.t?.(key, vars) ?? key;

interface VoiceChatOverlayProps {
  /** 是否打开浮层 */
  isOpen: boolean;
  /** 关闭浮层回调 */
  onClose: () => void;
  /** 状态变化时回调 */
  onStateChange?: (state: VoiceConversationState) => void;
}

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => i);

function getStateLabel(state: VoiceConversationState): string {
  return t(`voiceOverlay.${state}`);
}

function getStateIcon(state: VoiceConversationState): React.ReactNode {
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
  const [duration, setDuration] = useState(0);
  const [isAutoClosing, setIsAutoClosing] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    state,
    userText,
    aiText,
    start,
    stop,
    pause,
    resume,
    isAvailable,
  } = useVoiceConversation({
    lang: 'zh-CN',
    continuous: true,
    autoSpeak: true,
    onStateChange,
    onUserText: () => {
      clearAutoCloseTimer();
      setIsAutoClosing(false);
    },
  });

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  // 打开时启动对话
  useEffect(() => {
    if (isOpen && isAvailable) {
      start();
    }
    return () => {
      if (isOpen) stop();
      clearAutoCloseTimer();
    };
  }, [isOpen, isAvailable]);

  // 对话结束后自动关闭
  useEffect(() => {
    if (state === 'idle' && userText && aiText && isOpen) {
      clearAutoCloseTimer();
      autoCloseTimerRef.current = setTimeout(() => {
        setIsAutoClosing(true);
        autoCloseTimerRef.current = setTimeout(() => onClose(), 300);
      }, 3000);
    }
  }, [state, userText, aiText, isOpen, onClose, clearAutoCloseTimer]);

  // 监听/说话时计时
  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      setDuration(0);
      const timer = setInterval(() => setDuration((d) => d + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [state]);

  const handleStop = useCallback(() => {
    clearAutoCloseTimer();
    setIsAutoClosing(false);
    stop();
  }, [stop, clearAutoCloseTimer]);

  const handlePauseResume = useCallback(() => {
    if (state === 'paused') {
      resume();
    } else if (state !== 'idle' && state !== 'error') {
      pause();
    }
  }, [state, pause, resume]);

  const handleClose = useCallback(() => {
    clearAutoCloseTimer();
    setIsAutoClosing(false);
    stop();
    onClose();
  }, [onClose, stop, clearAutoCloseTimer]);

  if (!isOpen) return null;

  // Web Speech API 不可用时显示提示
  if (!isAvailable) {
    return (
      <div className={styles.overlay} role="dialog" aria-modal="true">
        <button onClick={handleClose} className={styles['close-btn']} aria-label={t('voiceOverlay.closeVoice')}>
          <PhosphorIcon icon={X} size={24} weight="regular" />
        </button>
        <div className={styles.content}>
          <div className={`${styles['icon-wrapper']} ${styles['state-error']}`}>
            <PhosphorIcon icon={Microphone} size={48} weight="bold" />
          </div>
          <h2 className={styles.title}>Jarvis</h2>
          <p className={styles.status}>{t('voiceOverlay.unavailable', { fallback: '语音识别不可用。请使用 Chrome 或 Edge 浏览器。' })}</p>
        </div>
      </div>
    );
  }

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
