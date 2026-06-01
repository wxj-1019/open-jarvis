/**
 * VoiceChatButton.tsx — 语音对话按钮
 *
 * 点击一次进入连续对话模式，VAD 自动检测说话开始/结束。
 * 状态可视化：idle → listening → processing → speaking → paused
 */

import { useState, useEffect, useCallback, memo } from 'react';
import { Microphone, MicrophoneSlash, Pause, Play, Spinner } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import styles from './InputArea.module.css';

declare function t(key: string, vars?: Record<string, string | number>): string;

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'paused' | 'error';

interface VoiceChatButtonProps {
  /** 状态变化时回调 */
  onStateChange?: (state: VoiceState) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义 className */
  className?: string;
  /** 初始状态（用于同步后端状态） */
  initialState?: VoiceState;
}

function getStateConfig(): Record<VoiceState, { label: string; color: string; active: boolean }> {
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
  initialState = 'idle',
}: VoiceChatButtonProps) {
  const [state, setState] = useState<VoiceState>(initialState);
  const [duration, setDuration] = useState(0);

  const handleToggle = useCallback(async () => {
    if (disabled) return;

    const hana = (window as any).hana;
    if (!hana) return;

    if (state === 'idle' || state === 'error') {
      await hana.startVoiceConversation({});
    } else if (state === 'paused') {
      hana.resumeVoiceConversation();
    } else {
      await hana.stopVoiceConversation();
    }
  }, [state, disabled]);

  const handlePauseResume = useCallback(() => {
    if (disabled) return;

    const hana = (window as any).hana;
    if (!hana) return;

    if (state === 'paused') {
      hana.resumeVoiceConversation();
    } else if (state !== 'idle' && state !== 'error') {
      hana.pauseVoiceConversation();
    }
  }, [state, disabled]);

  useEffect(() => {
    const hana = (window as any).hana;
    if (!hana?.onVoiceStateChange) return;

    // 初始化时尝试获取当前状态（如果 API 可用）
    if (hana.getVoiceState) {
      const currentState = hana.getVoiceState();
      if (currentState) {
        setState(currentState);
        onStateChange?.(currentState);
      }
    }

    const cleanup = hana.onVoiceStateChange((newState: VoiceState) => {
      setState(newState);
      onStateChange?.(newState);
    });
    return cleanup;
  }, [onStateChange]);

  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      setDuration(0);
      const timer = setInterval(() => setDuration((d) => d + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [state]);

  const config = getStateConfig()[state];

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

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
