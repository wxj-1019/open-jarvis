/**
 * AttachmentChip — 统一的附件/引用胶囊组件
 *
 * 用于输入区文件标签、输入区引用标签、聊天区文件附件、聊天区引用文本。
 */

import { memo, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import styles from './AttachmentChip.module.css';

interface AttachmentChipProps {
  icon: ReactNode;
  name: string;
  onRemove?: () => void;
  className?: string;
  variant?: 'normal' | 'expired';
}

export const AttachmentChip = memo(function AttachmentChip({
  icon,
  name,
  onRemove,
  className,
  variant = 'normal',
}: AttachmentChipProps) {
  return (
    <span className={`${styles.chip}${variant === 'expired' ? ` ${styles.expired}` : ''}${className ? ` ${className}` : ''}`}>
      <span className={styles.name}>
        <span className={styles.icon}>{icon}</span>
        {name}
      </span>
      {onRemove && (
        <button className={styles.remove} onClick={onRemove}>
          <PhosphorIcon icon={X} size={10} />
        </button>
      )}
    </span>
  );
});
