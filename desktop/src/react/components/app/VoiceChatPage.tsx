import { memo, useCallback } from 'react';
import { useStore } from '../../stores';
import { VoiceChatOverlay } from '../VoiceChatOverlay';
import { RegionalErrorBoundary } from '../RegionalErrorBoundary';
import styles from './VoiceChatPage.module.css';

export const VoiceChatPage = memo(function VoiceChatPage() {
  const setPageMode = useStore((s) => s.setPageMode);

  const handleClose = useCallback(() => {
    setPageMode('chat');
  }, [setPageMode]);

  return (
    <div className={styles.page} role="region" aria-label="Voice chat">
      <RegionalErrorBoundary region="voice-chat">
        <VoiceChatOverlay isOpen onClose={handleClose} />
      </RegionalErrorBoundary>
    </div>
  );
});
