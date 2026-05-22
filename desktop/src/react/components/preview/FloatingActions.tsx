import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './FloatingActions.module.css';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { Camera, Copy, Eye } from '@phosphor-icons/react';

interface Props {
  content: string;
  showMarkdownPreviewToggle?: boolean;
  markdownPreviewActive?: boolean;
  onToggleMarkdownPreview?: () => void;
}

export function FloatingActions({
  content,
  showMarkdownPreviewToggle = false,
  markdownPreviewActive = false,
  onToggleMarkdownPreview,
}: Props) {
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      const _t = window.t ?? ((p: string) => p);
      setCopyLabel(_t('attach.copied'));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopyLabel(null), 1500);
    });
  }, [content]);

  const handleScreenshot = useCallback(async () => {
    const { takeArticleScreenshot } = await import('../../utils/screenshot');
    await takeArticleScreenshot(content);
  }, [content]);

  const t = window.t ?? ((p: string) => p);

  return (
    <div className={styles.floatingActions} data-react-managed>
      <button className={styles.actionBtn} onClick={handleCopy}>
        <PhosphorIcon icon={Copy} size={12} />
        <span>{copyLabel ?? t('attach.copy')}</span>
      </button>
      {showMarkdownPreviewToggle && (
        <button
          className={`${styles.actionBtn}${markdownPreviewActive ? ` ${styles.actionBtnActive}` : ''}`}
          onClick={onToggleMarkdownPreview}
          title={t(markdownPreviewActive ? 'preview.exitMarkdownPreview' : 'preview.markdownPreview')}
          aria-label={t('preview.markdownPreview')}
        >
          <PhosphorIcon icon={Eye} size={13} />
        </button>
      )}
      <button className={styles.actionBtn} onClick={handleScreenshot} title={t('common.screenshot')} aria-label={t('common.screenshot')}>
        <PhosphorIcon icon={Camera} size={12} />
      </button>
    </div>
  );
}
