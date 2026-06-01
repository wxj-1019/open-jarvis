import { memo, useCallback } from 'react';
import { ChatCircle, Microphone } from '@phosphor-icons/react';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { useStore } from '../stores';
import styles from './PageModeTabs.module.css';

export const PageModeTabs = memo(function PageModeTabs() {
  const currentPage = useStore((s) => s.currentPage);
  const setPageMode = useStore((s) => s.setPageMode);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const modes: Array<'chat' | 'voice'> = ['chat', 'voice'];
      const currentIndex = modes.indexOf(currentPage);
      if (currentIndex === -1) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[PageModeTabs] Invalid currentPage: ${currentPage}`);
        }
        return;
      }
      const newIndex = e.key === 'ArrowLeft' 
        ? (currentIndex - 1 + modes.length) % modes.length
        : (currentIndex + 1) % modes.length;
      setPageMode(modes[newIndex]);
    }
  }, [currentPage, setPageMode]);

  return (
    <div 
      className={styles.tabs} 
      role="tablist" 
      aria-label="Page mode"
      onKeyDown={handleKeyDown}
    >
      <button
        role="tab"
        id="tab-chat"
        aria-selected={currentPage === 'chat'}
        aria-controls="panel-chat"
        className={`${styles.tab} ${currentPage === 'chat' ? styles.active : ''}`}
        onClick={() => setPageMode('chat')}
      >
        <PhosphorIcon icon={ChatCircle} size={16} />
        <span>{window.t?.('pageMode.chat') ?? '文字对话'}</span>
      </button>

      <button
        role="tab"
        id="tab-voice"
        aria-selected={currentPage === 'voice'}
        aria-controls="panel-voice"
        className={`${styles.tab} ${currentPage === 'voice' ? styles.active : ''}`}
        onClick={() => setPageMode('voice')}
      >
        <PhosphorIcon icon={Microphone} size={16} />
        <span>{window.t?.('pageMode.voice') ?? '语音模式'}</span>
      </button>
    </div>
  );
});
