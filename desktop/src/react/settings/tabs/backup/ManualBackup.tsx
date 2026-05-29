import { useState } from 'react';
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { hanaFetch } from '../../api';
import { t } from '../../helpers';
import { useSettingsStore } from '../../store';
import { PhosphorIcon } from '../../../ui/PhosphorIcon';
import styles from './BackupTab.module.css';

export function ManualBackup() {
  const selectedAgentId = useSettingsStore(s => s.backupSelectedAgentId);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const showToast = useSettingsStore(s => s.showToast);

  const handleExport = async () => {
    if (!selectedAgentId) {
      showToast(t('settings.backup.selectAgentFirst'), 'error');
      return;
    }

    setExporting(true);
    try {
      const res = await hanaFetch(`/api/agents/${selectedAgentId}/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();

      if (result.success) {
        showToast(t('settings.backup.exportSuccess'), 'success');
        window.dispatchEvent(new CustomEvent('backup-created'));
      } else {
        showToast(result.error || t('settings.backup.exportFailed'), 'error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('settings.backup.exportFailed');
      showToast(message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedAgentId) {
      showToast(t('settings.backup.selectAgentFirst'), 'error');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setImporting(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agentId', selectedAgentId);

      try {
        const res = await hanaFetch('/api/agents/import', {
          method: 'POST',
          body: formData,
        });
        const result = await res.json();

        if (result.success) {
          showToast(t('settings.backup.importSuccess'), 'success');
        } else {
          showToast(result.error || t('settings.backup.importFailed'), 'error');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('settings.backup.importFailed');
        showToast(message, 'error');
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const disabled = !selectedAgentId;

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.actionCard}
        onClick={handleExport}
        disabled={disabled || exporting}
      >
        <span className={`${styles.actionIcon} ${styles.actionIconExport}`}>
          <PhosphorIcon icon={DownloadSimple} size={18} />
        </span>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>
            {exporting ? t('settings.backup.exporting') : t('settings.backup.exportBackup')}
          </span>
          <span className={styles.actionDesc}>{t('settings.backup.exportBackupDesc')}</span>
        </span>
      </button>

      <button
        type="button"
        className={styles.actionCard}
        onClick={handleImport}
        disabled={disabled || importing}
      >
        <span className={`${styles.actionIcon} ${styles.actionIconImport}`}>
          <PhosphorIcon icon={UploadSimple} size={18} />
        </span>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>
            {importing ? t('settings.backup.importing') : t('settings.backup.importBackup')}
          </span>
          <span className={styles.actionDesc}>{t('settings.backup.importBackupDesc')}</span>
        </span>
      </button>
    </div>
  );
}
