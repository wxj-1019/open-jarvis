import { useState, useEffect, useCallback } from 'react';
import { Clock, Database, FileArchive, HardDrives } from '@phosphor-icons/react';
import { hanaFetch } from '../../api';
import { t } from '../../helpers';
import { useSettingsStore } from '../../store';
import { PhosphorIcon } from '../../../ui/PhosphorIcon';
import type { BackupRecord } from './backup-types';
import styles from './BackupTab.module.css';

export function BackupHistory() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selectedAgentId = useSettingsStore(s => s.backupSelectedAgentId);
  const showToast = useSettingsStore(s => s.showToast);

  const loadBackups = useCallback(async () => {
    if (!selectedAgentId) {
      setBackups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await hanaFetch(`/api/agents/${selectedAgentId}/backups`);
      const data = await res.json();
      setBackups(data.backups || []);
    } catch (err) {
      console.error('[BackupHistory] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  useEffect(() => {
    const handler = () => loadBackups();
    window.addEventListener('backup-created', handler);
    return () => window.removeEventListener('backup-created', handler);
  }, [loadBackups]);

  const handleDelete = async (backup: BackupRecord) => {
    if (!window.confirm(t('settings.backup.deleteConfirm', { name: backup.filename }))) {
      return;
    }

    setDeletingId(backup.filename);
    try {
      const res = await hanaFetch(`/api/agents/${backup.agentId}/backups/${backup.filename}`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (result.success) {
        showToast(t('settings.backup.deleteSuccess'), 'success');
        loadBackups();
      } else {
        showToast(result.error || t('settings.backup.deleteFailed'), 'error');
      }
    } catch (err) {
      console.error('[BackupHistory] Delete failed:', err);
      showToast(t('settings.backup.deleteFailed'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (!selectedAgentId) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>
          <PhosphorIcon icon={Database} size={22} />
        </span>
        <span className={styles.emptyTitle}>{t('settings.backup.selectAgent')}</span>
        <span className={styles.emptyDesc}>{t('settings.backup.selectAgentFirst')}</span>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.loading}>{t('settings.backup.loading')}</div>;
  }

  if (backups.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>
          <PhosphorIcon icon={FileArchive} size={22} />
        </span>
        <span className={styles.emptyTitle}>{t('settings.backup.noBackups')}</span>
        <span className={styles.emptyDesc}>{t('settings.backup.noBackupsDesc')}</span>
      </div>
    );
  }

  return (
    <div className={styles.historyList}>
      {backups.map((backup) => (
        <div key={backup.filename} className={styles.historyItem}>
          <span className={styles.historyIcon}>
            <PhosphorIcon icon={FileArchive} size={16} />
          </span>
          <div className={styles.historyMain}>
            <div className={styles.historyName} title={backup.filename}>{backup.filename}</div>
            <div className={styles.historyMeta}>
              <span>
                <PhosphorIcon icon={HardDrives} size={12} />
                {formatSize(backup.size)}
              </span>
              <span>
                <PhosphorIcon icon={Clock} size={12} />
                {formatDate(backup.createdAt)}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.deleteBtn}
            disabled={deletingId === backup.filename}
            onClick={() => handleDelete(backup)}
          >
            {deletingId === backup.filename ? '...' : t('settings.backup.delete')}
          </button>
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(isoString: string) {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}
