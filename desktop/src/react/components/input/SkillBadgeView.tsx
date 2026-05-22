import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { StarFour } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import styles from './SkillBadgeView.module.css';

export function SkillBadgeView({ node }: NodeViewProps) {
  const name = node.attrs.name as string;

  return (
    <NodeViewWrapper as="span" className={styles.badge}>
      <PhosphorIcon icon={StarFour} size={13} className={styles.icon} />
      <span className={styles.name}>{name}</span>
    </NodeViewWrapper>
  );
}
