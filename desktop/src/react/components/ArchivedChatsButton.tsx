import { useState } from 'react';
import { Archive } from '@phosphor-icons/react';
import { useI18n } from '../hooks/use-i18n';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { ArchivedSessionsModal } from './ArchivedSessionsModal';

/**
 * Sidebar 最底部的小方形入口：点击打开 ArchivedSessionsModal。
 * 复用 `sidebar-action-btn` 的幽灵高亮样式（默认透明，hover 才现圆角浅色底）。
 */
export function ArchivedChatsButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="sidebar-action-btn"
        title={t('session.archived.entry')}
        aria-label={t('session.archived.entry')}
        onClick={() => setOpen(true)}
      >
        <PhosphorIcon icon={Archive} />
      </button>
      <ArchivedSessionsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
