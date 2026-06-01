/**
 * VoiceChatPage — 语音对话页面容器
 *
 * 设计文档: docs/superpowers/specs/2026-05-30-voice-chat-page-toggle-design.md
 * - 简单包装 VoiceChatOverlay 作为页面级组件
 * - handleClose 切换回 chat 模式
 * - 页面动画由 CSS module 处理 (scale 0.95→1 + opacity)
 */

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
