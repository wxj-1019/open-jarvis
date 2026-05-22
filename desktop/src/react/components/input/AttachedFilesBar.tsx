import { memo } from 'react';
import { Folder, Paperclip } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { AttachmentChip } from '../shared/AttachmentChip';
import styles from './InputArea.module.css';

export const AttachedFilesBar = memo(function AttachedFilesBar({ files, onRemove }: {
  files: Array<{ path: string; name: string; isDirectory?: boolean }>;
  onRemove: (index: number) => void;
}) {
  return (
    <div className={styles['attached-files']}>
      {files.map((f, i) => (
        <AttachmentChip
          key={f.path}
          icon={f.isDirectory ? <PhosphorIcon icon={Folder} size={14} /> : <PhosphorIcon icon={Paperclip} size={14} />}
          name={f.name}
          onRemove={() => onRemove(i)}
        />
      ))}
    </div>
  );
});
