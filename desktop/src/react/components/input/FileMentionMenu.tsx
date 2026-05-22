import { memo, useEffect, useRef } from 'react';
import type { FileMentionItem } from '../../utils/file-mention-items';
import { Folder, File } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import styles from './InputArea.module.css';

export const FileMentionMenu = memo(function FileMentionMenu({
  items,
  selected,
  busy,
  onSelect,
  onHover,
}: {
  items: FileMentionItem[];
  selected: number;
  busy: boolean;
  onSelect: (item: FileMentionItem) => void;
  onHover: (index: number) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className={styles['file-mention-menu']}>
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={i === selected ? selectedRef : undefined}
          className={`${styles['file-mention-item']}${i === selected ? ` ${styles.selected}` : ''}`}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
        >
          <span className={styles['file-mention-icon']} aria-hidden="true">
            {item.isDirectory ? <PhosphorIcon icon={Folder} size={14} /> : <PhosphorIcon icon={File} size={14} />}
          </span>
          <span className={styles['file-mention-main']}>
            <span className={styles['file-mention-name']}>{item.name}</span>
            <span className={styles['file-mention-detail']}>{item.detail || item.path}</span>
          </span>
        </button>
      ))}
      {items.length === 0 && busy && <div className={styles['file-mention-empty']}>...</div>}
    </div>
  );
});
