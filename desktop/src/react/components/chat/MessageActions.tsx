// desktop/src/react/components/chat/MessageActions.tsx
import { memo, useCallback, useMemo } from 'react';
import { Copy, Check, Camera, CheckSquare } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { useStore } from '../../stores';
import { useI18n } from '../../hooks/use-i18n';
import { selectSelectedIdsBySession } from '../../stores/session-selectors';
import styles from './Chat.module.css';

interface Props {
  messageId: string;
  sessionPath: string;
  onCopy: () => void;
  onScreenshot: () => void;
  copied: boolean;
  isStreaming: boolean;
  align?: 'left' | 'right';
}

export const MessageActions = memo(function MessageActions({
  messageId, sessionPath, onCopy, onScreenshot, copied, isStreaming, align = 'right',
}: Props) {
  const { t } = useI18n();
  const selectedIds = useStore(s => selectSelectedIdsBySession(s, sessionPath));
  const sessionItems = useStore(s => s.chatSessions[sessionPath]?.items);
  const isSelected = selectedIds.includes(messageId);
  const toggle = useStore(s => s.toggleMessageSelection);
  const setSelection = useStore(s => s.setMessageSelection);
  const selectableIds = useMemo(() => (
    (sessionItems || [])
      .filter(item => item.type === 'message')
      .map(item => item.data.id)
  ), [sessionItems]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.includes(id));

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggle(sessionPath, messageId);
  }, [toggle, sessionPath, messageId]);

  const handleSelectAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelection(sessionPath, allSelected ? [] : selectableIds);
  }, [allSelected, selectableIds, setSelection, sessionPath]);

  return (
    <div
      className={`${styles.msgActions}${align === 'left' ? ` ${styles.msgActionsLeft}` : ''}${isSelected ? ` ${styles.msgActionsVisible}` : ''}`}
    >
      <div className={styles.msgActionsPopover}>
        <button
          className={`${styles.msgActionBtn}${copied ? ` ${styles.msgActionBtnCopied}` : ''}`}
          onClick={onCopy}
          title={t('common.copyText')}
          disabled={isStreaming}
        >
          {copied
            ? <PhosphorIcon icon={Check} size={14} />
            : <PhosphorIcon icon={Copy} size={14} />
          }
        </button>
        <button
          className={styles.msgActionBtn}
          onClick={onScreenshot}
          title={t('common.screenshot')}
          disabled={isStreaming}
        >
          <PhosphorIcon icon={Camera} size={14} />
        </button>
        <button
          className={`${styles.msgActionBtn}${allSelected ? ` ${styles.msgActionBtnActive}` : ''}`}
          onClick={handleSelectAll}
          title={t('common.selectAllMessages')}
          aria-pressed={allSelected}
          disabled={isStreaming}
        >
          <PhosphorIcon icon={CheckSquare} size={14} />
        </button>
      </div>
      <button
        className={`${styles.msgActionBtn}${isSelected ? ` ${styles.msgActionBtnActive}` : ''}`}
        onClick={handleToggle}
        title={t('common.selectMessage')}
        disabled={isStreaming}
      >
        {isSelected
          ? <PhosphorIcon icon={CheckSquare} size={14} weight="fill" />
          : <PhosphorIcon icon={CheckSquare} size={14} />
        }
      </button>
    </div>
  );
});
