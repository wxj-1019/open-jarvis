import { PaperPlaneRight, CaretLeft, Stop } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { useI18n } from '../../hooks/use-i18n';
import styles from './InputArea.module.css';

export function SendButton({ isStreaming, hasInput, disabled, onSend, onSteer, onStop }: {
  isStreaming: boolean;
  hasInput: boolean;
  disabled: boolean;
  onSend: () => void;
  onSteer: () => void;
  onStop: () => void;
}) {
  const { t } = useI18n();

  // 三态：发送 / 插话 / 停止
  const mode = isStreaming ? (hasInput ? 'steer' : 'stop') : 'send';

  return (
    <button
      className={`${styles['send-btn']}${mode === 'steer' ? ` ${styles['is-steer']}` : mode === 'stop' ? ` ${styles['is-streaming']}` : ''}`}
      disabled={disabled}
      onClick={mode === 'steer' ? onSteer : mode === 'stop' ? onStop : onSend}
    >
      {mode === 'send' && (
        <span className={styles['send-label']}>
          <PhosphorIcon icon={PaperPlaneRight} size={14} className={styles['send-enter-icon']} />
          <span>{t('chat.send')}</span>
        </span>
      )}
      {mode === 'steer' && (
        <span className={styles['send-label']}>
          <PhosphorIcon icon={CaretLeft} size={14} className={styles['send-enter-icon']} />
          <span>{t('chat.steer')}</span>
        </span>
      )}
      {mode === 'stop' && (
        <span className={styles['send-label']}>
          <PhosphorIcon icon={Stop} size={14} weight="fill" />
          <span>{t('chat.stop')}</span>
        </span>
      )}
    </button>
  );
}
