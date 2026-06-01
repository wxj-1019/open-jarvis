/**
 * VoiceChatButton.tsx — 语音对话按钮
 *
 * 点击一次进入连续对话模式，使用 Web Speech API 进行语音识别和合成。
 * 状态可视化：idle → listening → processing → speaking → paused
 */

import { useState, useEffect, useCallback, memo } from 'react';
import { Microphone, MicrophoneSlash, Pause, Play, Spinner } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { formatDuration } from '../../utils/voice-helpers';
import { useVoiceConversation, type VoiceConversationState } from '../../hooks/useVoiceConversation';
import styles from './InputArea.module.css';

const t = (key: string, vars?: Record<string, string | number>): string => window.t?.(key, vars) ?? key;

interface VoiceChatButtonProps {
  /** 状态变化时回调 */
  onStateChange?: (state: VoiceConversationState) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义 className */
  className?: string;
}

function getStateConfig(): Record<VoiceConversationState, { label: string; color: string; active: boolean }> {
  return {
    idle: {
      label: t('voiceButton.idle'),
      color: 'bg-blue-600 hover:bg-blue-700',
      active: false,
    },
    listening: {
      label: t('voiceButton.listening'),
      color: 'bg-red-600',
      active: true,
    },
    processing: {
      label: t('voiceButton.processing'),
      color: 'bg-amber-600',
      active: true,
    },
    speaking: {
      label: t('voiceButton.speaking'),
      color: 'bg-green-600',
      active: true,
    },
    paused: {
      label: t('voiceButton.paused'),
      color: 'bg-gray-600',
      active: false,
    },
    error: {
      label: t('voiceButton.error'),
      color: 'bg-red-800',
      active: false,
    },
  };
}

export const VoiceChatButton = memo(function VoiceChatButton({
  onStateChange,
  disabled = false,
  className = '',
}: VoiceChatButtonProps) {
  const [duration, setDuration] = useState(0);

  const {
    state,
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
  });

  const handleToggle = useCallback(() => {
    if (disabled) return;

    if (state === 'idle' || state === 'error') {
      start();
    } else if (state === 'paused') {
      resume();
    } else {
      stop();
    }
  }, [state, disabled, start, stop, resume]);

  const handlePauseResume = useCallback(() => {
    if (disabled) return;

    if (state === 'paused') {
      resume();
    } else if (state !== 'idle' && state !== 'error') {
      pause();
    }
  }, [state, disabled, pause, resume]);

  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      setDuration(0);
      const timer = setInterval(() => setDuration((d) => d + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [state]);

  const config = getStateConfig()[state];

  const renderIcon = () => {
    const iconSize = 16;

    if (state === 'processing') {
      return (
        <span className={styles['voice-icon-spin']}>
          <PhosphorIcon icon={Spinner} size={iconSize} weight="regular" />
        </span>
      );
    }

    if (state === 'listening' || state === 'speaking') {
      return (
        <span className={styles['voice-icon-pulse']}>
          <PhosphorIcon
            icon={state === 'listening' ? Microphone : MicrophoneSlash}
            size={iconSize}
            weight="fill"
          />
        </span>
      );
    }

    if (state === 'error') {
      return (
        <PhosphorIcon icon={MicrophoneSlash} size={iconSize} weight="bold" />
      );
    }

    if (state === 'paused') {
      return (
        <PhosphorIcon icon={Play} size={iconSize} weight="fill" />
      );
    }

    return (
      <PhosphorIcon icon={Microphone} size={iconSize} weight="regular" />
    );
  };

  // Web Speech API 不可用时隐藏按钮
  if (!isAvailable) return null;

  return (
    <div className={`${styles['voice-chat-container']} ${className}`}>
      <button
        onClick={handleToggle}
        className={`${styles['voice-chat-btn']} ${config.color}`}
        aria-label={config.label}
        title={config.label}
        disabled={disabled && state === 'idle'}
      >
        {renderIcon()}
        <span className={styles['voice-chat-label']}>{config.label}</span>
      </button>

      {(state === 'listening' || state === 'speaking') && (
        <span className={styles['voice-chat-duration']}>
          {formatDuration(duration)}
        </span>
      )}

      {state !== 'idle' && state !== 'error' && (
        <button
          onClick={handlePauseResume}
          className={styles['voice-chat-pause-btn']}
          aria-label={state === 'paused' ? t('voiceButton.resumeConversation') : t('voiceButton.pauseConversation')}
          title={state === 'paused' ? t('voiceButton.resumeConversation') : t('voiceButton.pauseConversation')}
        >
          <PhosphorIcon
            icon={state === 'paused' ? Play : Pause}
            size={14}
            weight="fill"
          />
        </button>
      )}
    </div>
  );
});
