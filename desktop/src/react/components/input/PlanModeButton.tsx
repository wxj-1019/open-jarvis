import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Question, Terminal } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { hanaFetch } from '../../hooks/use-hana-fetch';
import { useI18n } from '../../hooks/use-i18n';
import { useStore } from '../../stores';
import styles from './InputArea.module.css';

export type PermissionMode = 'operate' | 'ask' | 'read_only';

const PERMISSION_MODES: PermissionMode[] = ['operate', 'ask', 'read_only'];

function permissionModeLabelKey(mode: PermissionMode) {
  if (mode === 'read_only') return 'input.readOnlyMode';
  if (mode === 'ask') return 'input.askMode';
  return 'input.operateMode';
}

function PermissionModeIcon({ mode }: { mode: PermissionMode }) {
  if (mode === 'read_only') {
    return (
      <PhosphorIcon icon={Lock} size={14} data-permission-mode={mode} />
    );
  }
  if (mode === 'ask') {
    return (
      <PhosphorIcon icon={Question} size={14} data-permission-mode={mode} />
    );
  }
  return (
    <PhosphorIcon icon={Terminal} size={14} data-permission-mode={mode} />
  );
}

export function PlanModeButton({ mode, onChange, locked = false }: {
  mode: PermissionMode;
  onChange: (v: PermissionMode) => void;
  locked?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectMode = useCallback(async (nextMode: PermissionMode) => {
    setOpen(false);
    if (nextMode === mode) return;
    try {
      const state = useStore.getState();
      const pendingNewSession = state.pendingNewSession === true;
      const sessionPath = pendingNewSession ? null : state.currentSessionPath;
      const body = {
        mode: nextMode,
        pendingNewSession,
        ...(sessionPath ? { sessionPath } : {}),
      };
      const res = await hanaFetch('/api/session-permission-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.locked) {
        window.dispatchEvent(new CustomEvent('hana-inline-notice', {
          detail: { text: t('input.accessModeLocked'), type: 'error' },
        }));
      }
      onChange((data.mode || nextMode) as PermissionMode);
    } catch (err) {
      console.error('[plan-mode] select failed:', err);
    }
  }, [mode, onChange, t]);

  const label = t(permissionModeLabelKey(mode));

  return (
    <div className={`${styles['thinking-selector']} ${styles['plan-mode-selector']}${open ? ` ${styles.open}` : ''}`} ref={ref}>
      <button
        className={`${styles['plan-mode-btn']} ${styles[`plan-mode-${mode}`] || ''}`}
        title={locked ? t('input.accessModeLocked') : t('input.accessMode')}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        disabled={locked}
      >
        <PermissionModeIcon mode={mode} />
        <span className={styles['plan-mode-label']}>{label}</span>
      </button>
      {open && (
        <div className={`${styles['thinking-dropdown']} ${styles['plan-mode-dropdown']}`}>
          {PERMISSION_MODES.map((permissionMode) => (
            <button
              key={permissionMode}
              className={`${styles['thinking-option']}${permissionMode === mode ? ` ${styles.active}` : ''}`}
              onClick={() => selectMode(permissionMode)}
            >
              <span>{t(permissionModeLabelKey(permissionMode))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
