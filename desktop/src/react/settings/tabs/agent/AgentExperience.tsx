import React, { useState, useEffect, useRef } from 'react';
import { hanaFetch } from '../../api';
import { t } from '../../helpers';
import styles from '../../Settings.module.css';
import { PhosphorIcon } from '../../../ui/PhosphorIcon';
import { PencilSimple, X } from '@phosphor-icons/react';

export interface ExpCategory { name: string; entries: string[]; }

export function parseExperience(raw: string): ExpCategory[] {
  if (!raw?.trim()) return [];
  const cats: ExpCategory[] = [];
  let cur: ExpCategory | null = null;
  for (const line of raw.split('\n')) {
    const m = line.match(/^#\s+(.+)/);
    if (m) {
      cur = { name: m[1].trim(), entries: [] };
      cats.push(cur);
    } else if (cur) {
      const entry = line.replace(/^\d+\.\s*/, '').trim();
      if (entry) cur.entries.push(entry);
    }
  }
  return cats;
}

export function serializeExperience(cats: ExpCategory[]): string {
  return cats
    .filter(c => c.entries.length > 0)
    .map(c => `# ${c.name}\n${c.entries.map((e, i) => `${i + 1}. ${e}`).join('\n')}`)
    .join('\n\n') + (cats.length ? '\n' : '');
}

export async function putExperience(
  store: { getSettingsAgentId: () => string | null; showToast: (msg: string, type: 'success' | 'error') => void },
  cats: ExpCategory[],
) {
  try {
    const agentId = store.getSettingsAgentId();
    const content = serializeExperience(cats);
    const res = await hanaFetch(`/api/agents/${agentId}/experience`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    store.showToast(t('settings.saveFailed') + ': ' + msg, 'error');
  }
}

export function ExperienceBlock({ category, onSave, onDelete }: {
  category: ExpCategory;
  onSave: (updated: ExpCategory) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => {
    setEditVal(category.entries.map((e, i) => `${i + 1}. ${e}`).join('\n'));
    setEditing(true);
  };

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const saveEdit = () => {
    const entries = editVal
      .split('\n')
      .map(l => l.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean);
    onSave({ name: category.name, entries });
    setEditing(false);
  };

  return (
    <div className={styles['exp-block']}>
      <div className={styles['exp-block-header']}>
        <span className={styles['exp-block-title']}>{category.name}</span>
        <div className={styles['exp-block-actions']}>
          <button
            className={styles['exp-block-action']}
            title={t('settings.experience.edit')}
            onClick={startEdit}
          >
            <PhosphorIcon icon={PencilSimple} size={13} />
          </button>
          <button
            className={`${styles['exp-block-action']} ${styles['delete']}`}
            title={t('settings.experience.deleteCategory')}
            onClick={onDelete}
          >
            <PhosphorIcon icon={X} size={13} />
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          ref={textareaRef}
          className={styles['exp-block-editor']}
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setEditing(false); }
          }}
          spellCheck={false}
        />
      ) : (
        <div className={styles['exp-block-body']}>
          {category.entries.map((entry, i) => (
            <div key={`${category.name}-${i}`} className={styles['exp-entry']}>
              <span className={styles['exp-entry-num']}>{i + 1}.</span>
              <span className={styles['exp-entry-text']}>{entry}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
