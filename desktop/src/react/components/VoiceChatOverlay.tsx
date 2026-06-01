/**
 * VoiceChatOverlay.tsx — 全屏语音对话浮层
 *
 * 设计文档: docs/superpowers/specs/2026-05-30-voice-chat-page-toggle-design.md
 *
 * 功能:
 * - 首次切换到语音页面时请求麦克风权限
 * - 用户拒绝权限时显示引导对话框
 * - STT/TTS 服务未配置时显示配置引导界面
 * - 提供快捷入口跳转到设置页面的语音配置 Tab
 * - 显示当前对话状态 (listening/processing/speaking)
 * - 显示用户识别文本和 AI 回复文本
 * - 提供停止/暂停/恢复控制
 */

import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { X, Microphone, MicrophoneSlash, Lightbulb, SpeakerHigh, Pause, Play, Stop, Gear } from '@phosphor-icons/react';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { formatDuration } from '../utils/voice-helpers';
import { useVoiceConversation, type VoiceConversationState } from '../hooks/useVoiceConversation';
import { openSettingsModal } from '../stores/settings-modal-actions';
import styles from './VoiceChatOverlay.module.css';

const t = (key: string, vars?: Record<string, string | number>): string => window.t?.(key, vars) ?? key;

interface VoiceChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
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
    case 'error': return <PhosphorIcon icon={MicrophoneSlash} size={48} weight="bold" />;
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
  const [permissionDenied, setPermissionDenied] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRequestedPermission = useRef(false);

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

  // 请求麦克风权限
  const requestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionDenied(false);
      hasRequestedPermission.current = true;
      // 权限获取后启动对话
      start();
    } catch {
      setPermissionDenied(true);
    }
  }, [start]);

  // 打开时请求权限并启动对话
  useEffect(() => {
    if (!isOpen) return;

    if (!isAvailable) return;

    // 首次打开时请求麦克风权限
    if (!hasRequestedPermission.current) {
      requestMicPermission();
    } else {
      start();
    }

    return () => {
      stop();
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

  const handleOpenVoiceSettings = useCallback(() => {
    openSettingsModal('voice');
  }, []);

  if (!isOpen) return null;

  // Web Speech API 不可用 — 显示配置引导
  if (!isAvailable) {
    return (
      <div className={styles.overlay} role="dialog" aria-modal="true">
        <button onClick={handleClose} className={styles['close-btn']} aria-label={t('voiceOverlay.closeVoice')}>
          <PhosphorIcon icon={X} size={24} weight="regular" />
        </button>
        <div className={styles['permission-guide']}>
          <div className={styles['icon-wrapper']}>
            <PhosphorIcon icon={MicrophoneSlash} size={48} weight="bold" />
          </div>
          <h2 className={styles.title}>{t('voiceOverlay.unavailableTitle', { fallback: '语音识别不可用' })}</h2>
          <p className={styles.desc}>
            {t('voiceOverlay.unavailableDesc', { fallback: '当前环境不支持 Web Speech API。请使用 Chrome 或 Edge 浏览器，或在设置中配置 Whisper API。' })}
          </p>
          <div className={styles.actions}>
            <button className={styles['primary-btn']} onClick={handleOpenVoiceSettings}>
              <PhosphorIcon icon={Gear} size={16} />
              {t('voiceOverlay.openSettings', { fallback: '打开语音设置' })}
            </button>
            <button className={styles['secondary-btn']} onClick={handleClose}>
              {t('common.close', { fallback: '关闭' })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 麦克风权限被拒绝 — 显示引导
  if (permissionDenied) {
    return (
      <div className={styles.overlay} role="dialog" aria-modal="true">
        <button onClick={handleClose} className={styles['close-btn']} aria-label={t('voiceOverlay.closeVoice')}>
          <PhosphorIcon icon={X} size={24} weight="regular" />
        </button>
        <div className={styles['permission-guide']}>
          <div className={styles['icon-wrapper']}>
            <PhosphorIcon icon={MicrophoneSlash} size={48} weight="bold" />
          </div>
          <h2 className={styles.title}>{t('voiceOverlay.permissionDenied', { fallback: '需要麦克风权限' })}</h2>
          <p className={styles.desc}>
            {t('voiceOverlay.permissionDeniedDesc', { fallback: '语音对话需要使用麦克风。请在浏览器地址栏中允许麦克风权限，然后重试。' })}
          </p>
          <div className={styles.actions}>
            <button className={styles['primary-btn']} onClick={requestMicPermission}>
              <PhosphorIcon icon={Microphone} size={16} />
              {t('voiceOverlay.retryPermission', { fallback: '重新授权' })}
            </button>
            <button className={styles['secondary-btn']} onClick={handleClose}>
              {t('common.close', { fallback: '关闭' })}
            </button>
          </div>
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
              <PhosphorIcon icon={state === 'paused' ? Play : Pause} size={20} weight="fill" />
              <span>{state === 'paused' ? t('pageMode.resume', { fallback: '继续对话' }) : t('voiceOverlay.pause')}</span>
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
