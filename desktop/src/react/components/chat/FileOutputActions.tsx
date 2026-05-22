import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowSquareOut, CaretDown, FolderOpen, Copy, DownloadSimple } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import styles from './Chat.module.css';

interface FileOutputActionsProps {
  filePath: string;
  displayName: string;
  downloadUrl?: string | null;
  downloadName?: string;
}

function actionLabel(label: string, displayName: string): string {
  return `${label} ${displayName}`;
}

export function FileOutputActions({ filePath, displayName, downloadUrl, downloadName }: FileOutputActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openLabel = window.t('desk.openWithDefault');
  const moreLabel = window.t('chat.fileActions.more');
  const revealLabel = window.t('chat.fileActions.revealInFinder');
  const copyLabel = window.t('chat.fileActions.copyPath');
  const downloadLabel = window.t('chat.fileActions.downloadToDevice');
  const isWebRuntime = document.documentElement.getAttribute('data-platform') === 'web';
  const canOpenLocalFile = !isWebRuntime && typeof window.platform?.openFile === 'function';
  const canRevealLocalFile = !isWebRuntime && typeof window.platform?.showInFinder === 'function';
  const resolvedDownloadName = downloadName || displayName;

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleOpen = useCallback((event: ReactMouseEvent) => {
    event.stopPropagation();
    window.platform?.openFile?.(filePath);
  }, [filePath]);

  const handleToggleMenu = useCallback((event: ReactMouseEvent) => {
    event.stopPropagation();
    setMenuOpen(open => !open);
  }, []);

  const revealFile = useCallback(() => {
    window.platform?.showInFinder?.(filePath);
  }, [filePath]);

  const copyPath = useCallback(() => {
    navigator.clipboard?.writeText?.(filePath).catch(() => {});
  }, [filePath]);

  const handleMenuItem = useCallback((event: ReactMouseEvent, action: () => void) => {
    event.stopPropagation();
    closeMenu();
    action();
  }, [closeMenu]);

  const handleDownloadClick = useCallback((event: ReactMouseEvent) => {
    event.stopPropagation();
    closeMenu();
  }, [closeMenu]);

  useEffect(() => {
    if (!menuOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 168;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      Math.max(8, window.innerWidth - menuWidth - 8),
    );
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 6,
      left,
      width: menuWidth,
      zIndex: 9999,
    });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeMenu, menuOpen]);

  return (
    <div className={styles.fileOutputActions} data-file-output-actions="">
      {canOpenLocalFile ? (
        <button
          type="button"
          className={`${styles.fileOutputActionButton} ${styles.fileOutputActionPrimary}`}
          onClick={handleOpen}
          aria-label={actionLabel(openLabel, displayName)}
          title={openLabel}
        >
          <PhosphorIcon icon={ArrowSquareOut} size={12} />
        </button>
      ) : downloadUrl ? (
        <a
          className={`${styles.fileOutputActionButton} ${styles.fileOutputActionPrimary}`}
          href={downloadUrl}
          download={resolvedDownloadName}
          onClick={handleDownloadClick}
          aria-label={actionLabel(downloadLabel, displayName)}
          title={downloadLabel}
        >
          <PhosphorIcon icon={DownloadSimple} size={13} />
        </a>
      ) : (
        <button
          type="button"
          className={`${styles.fileOutputActionButton} ${styles.fileOutputActionPrimary}`}
          disabled
          aria-label={actionLabel(openLabel, displayName)}
          title={openLabel}
        >
          <PhosphorIcon icon={ArrowSquareOut} size={12} />
        </button>
      )}
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.fileOutputActionButton} ${styles.fileOutputActionMenuButton}`}
        onClick={handleToggleMenu}
        aria-label={actionLabel(moreLabel, displayName)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={moreLabel}
      >
        <PhosphorIcon icon={CaretDown} size={11} />
      </button>
      {menuOpen && createPortal(
        <div
          ref={menuRef}
          className={styles.fileOutputActionMenu}
          style={menuStyle}
          role="menu"
        >
          {downloadUrl && (
            <a
              className={styles.fileOutputActionMenuItem}
              role="menuitem"
              href={downloadUrl}
              download={resolvedDownloadName}
              onClick={handleDownloadClick}
            >
              <PhosphorIcon icon={DownloadSimple} size={13} />
              <span>{downloadLabel}</span>
            </a>
          )}
          {canRevealLocalFile && (
            <button
              type="button"
              className={styles.fileOutputActionMenuItem}
              role="menuitem"
              onClick={(event) => handleMenuItem(event, revealFile)}
            >
              <PhosphorIcon icon={FolderOpen} size={13} />
              <span>{revealLabel}</span>
            </button>
          )}
          <button
            type="button"
            className={styles.fileOutputActionMenuItem}
            role="menuitem"
            onClick={(event) => handleMenuItem(event, copyPath)}
          >
            <PhosphorIcon icon={Copy} size={13} />
            <span>{copyLabel}</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
