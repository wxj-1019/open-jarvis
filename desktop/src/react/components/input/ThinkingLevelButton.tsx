import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Lightbulb } from '@phosphor-icons/react';
import { hanaFetch } from '../../hooks/use-hana-fetch';
import { invalidateConfigCache } from '../../hooks/use-config';
import { useI18n } from '../../hooks/use-i18n';
import { useStore } from '../../stores';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import type { ThinkingLevel } from '../../stores/model-slice';
import styles from './InputArea.module.css';

const ALL_THINKING_LEVELS: ThinkingLevel[] = ['off', 'auto', 'high', 'xhigh'];

export function ThinkingLevelButton({ level, onChange, modelXhigh }: {
  level: ThinkingLevel;
  onChange: (level: ThinkingLevel) => void;
  modelXhigh: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentSessionPath = useStore(s => s.currentSessionPath);
  const pendingNewSession = useStore(s => s.pendingNewSession);

  const availableLevels = useMemo(() => {
    return ALL_THINKING_LEVELS.filter(lv => lv !== 'xhigh' || modelXhigh);
  }, [modelXhigh]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectLevel = useCallback(async (next: ThinkingLevel) => {
    setOpen(false);
    try {
      const useSessionThinking = !!currentSessionPath && !pendingNewSession;
      const res = await hanaFetch(useSessionThinking ? '/api/session-thinking-level' : '/api/config', {
        method: useSessionThinking ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: useSessionThinking
          ? JSON.stringify({ sessionPath: currentSessionPath, level: next })
          : JSON.stringify({ thinking_level: next }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || 'failed to save thinking level');
      }
      onChange((data?.thinkingLevel || next) as ThinkingLevel);
      if (!useSessionThinking) invalidateConfigCache();
    } catch (err) {
      console.error('[thinking-level] save failed:', err);
    }
  }, [currentSessionPath, onChange, pendingNewSession]);

  const tLevel = (key: string, fallback: string) => {
    const v = t(key);
    return v !== key ? v : fallback;
  };

  const isOff = level === 'off';

  return (
    <div className={`${styles['thinking-selector']}${open ? ` ${styles.open}` : ''}`} ref={ref}>
      <button
        className={`${styles['thinking-pill']}${isOff ? '' : ` ${styles.active}`}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <PhosphorIcon icon={Lightbulb} />
      </button>
      {open && (
        <div className={styles['thinking-dropdown']}>
          {availableLevels.map(lv => (
            <button
              key={lv}
              className={`${styles['thinking-option']}${lv === level ? ` ${styles.active}` : ''}`}
              onClick={() => selectLevel(lv)}
            >
              <span>{tLevel(`input.thinkingLevel.${lv}`, lv)}</span>
              <span className={styles['thinking-option-desc']}>{tLevel(`input.thinkingDesc.${lv}`, '')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
