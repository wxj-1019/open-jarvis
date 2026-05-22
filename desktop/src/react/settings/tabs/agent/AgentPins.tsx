import React, { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store';
import { t, savePins } from '../../helpers';
import styles from '../../Settings.module.css';
import { PhosphorIcon } from '../../../ui/PhosphorIcon';
import { X, Plus } from '@phosphor-icons/react';

export function PinItem({ text, index, onDelete }: { text: string; index: number; onDelete: (i: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const val = editVal.trim();
    const pins = [...useSettingsStore.getState().currentPins];
    if (val && val !== text) {
      pins[index] = val;
      useSettingsStore.setState({ currentPins: pins });
      savePins();
    } else if (!val) {
      pins.splice(index, 1);
      useSettingsStore.setState({ currentPins: pins });
      savePins();
    }
    setEditing(false);
  };

  return (
    <div className={styles['pin-item']}>
      {editing ? (
        <input
          ref={inputRef}
          className={`${styles['settings-input']} ${styles['pin-edit-input']}`}
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className={styles['pin-item-text']} title={text} onClick={() => { setEditVal(text); setEditing(true); }}>
          {text}
        </span>
      )}
      <div className={styles['pin-item-actions']}>
        <button className={`${styles['pin-item-action']} ${styles['delete']}`} title={t('settings.pins.delete')} onClick={() => onDelete(index)}>
          <PhosphorIcon icon={X} size={12} />
        </button>
      </div>
    </div>
  );
}
