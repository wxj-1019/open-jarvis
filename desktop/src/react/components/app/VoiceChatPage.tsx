import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../stores';
import { VoiceChatOverlay } from '../VoiceChatOverlay';
import { RegionalErrorBoundary } from '../RegionalErrorBoundary';
import styles from './VoiceChatPage.module.css';

export const VoiceChatPage = memo(function VoiceChatPage() {
  const setPageMode = useStore((s) => s.setPageMode);
  const [visible, setVisible] = useState(false);

  // 页面挂载后触发动画
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    // 等待动画结束后再切换页面
    closeTimerRef.current = setTimeout(() => setPageMode('chat'), 300);
  }, [setPageMode]);

  return (
    <div className={`${styles.page} ${visible ? styles.visible : ''}`} role="region" aria-label="Voice chat">
      <RegionalErrorBoundary region="voice-chat">
        <VoiceChatOverlay isOpen onClose={handleClose} />
      </RegionalErrorBoundary>
    </div>
  );
});
