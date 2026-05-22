import { useStore } from '../../stores';
import { AttachmentChip } from '../shared/AttachmentChip';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { Columns } from '@phosphor-icons/react';

export function QuotedSelectionCard() {
  const quotedSelection = useStore(s => s.quotedSelection);
  const clearQuotedSelection = useStore(s => s.clearQuotedSelection);

  if (!quotedSelection) return null;

  return (
    <AttachmentChip
      icon={<PhosphorIcon icon={Columns} size={14} />}
      name={quotedSelection.text}
      onRemove={clearQuotedSelection}
    />
  );
}
