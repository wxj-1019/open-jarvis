import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Folder, File } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import styles from './FileBadgeView.module.css';

export function FileBadgeView({ node }: NodeViewProps) {
  const name = (node.attrs.name || node.attrs.path || '') as string;
  const isDirectory = node.attrs.isDirectory === true;

  return (
    <NodeViewWrapper as="span" className={styles.badge}>
      {isDirectory ? (
        <PhosphorIcon icon={Folder} size={13} className={styles.icon} />
      ) : (
        <PhosphorIcon icon={File} size={13} className={styles.icon} />
      )}
      <span className={styles.name}>{name}</span>
    </NodeViewWrapper>
  );
}
