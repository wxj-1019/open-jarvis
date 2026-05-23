import { useState, useEffect, useCallback } from 'react';
import { hanaFetch } from '../../api';
import { t } from '../../helpers';
import { useSettingsStore } from '../../store';
import type { BackupRecord } from './backup-types';

export function BackupHistory() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const agents = useSettingsStore(s => s.agents);
  const selectedAgentId = useSettingsStore(s => s.backupSelectedAgentId);
  const set = useSettingsStore(s => s.set);

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
    try {
      const res = await hanaFetch(`/api/agents/${backup.agentId}/backups/${backup.filename}`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (result.success) {
        loadBackups();
      }
    } catch (err) {
      console.error('[BackupHistory] Delete failed:', err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  if (loading) return <div style={{ padding: '16px', color: 'var(--text-muted, #666)' }}>{t('settings.backup.loading')}</div>;
  if (backups.length === 0) return <div style={{ padding: '16px', color: 'var(--text-muted, #666)' }}>{t('settings.backup.noBackups')}</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border, #e1e4e8)' }}>
            <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>{t('settings.backup.filename')}</th>
            <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>{t('settings.backup.size')}</th>
            <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>{t('settings.backup.date')}</th>
            <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>{t('settings.backup.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.filename} style={{ borderBottom: '1px solid var(--border, #e1e4e8)' }}>
              <td style={{ padding: '8px 4px', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>{backup.filename}</td>
              <td style={{ padding: '8px 4px' }}>{formatSize(backup.size)}</td>
              <td style={{ padding: '8px 4px' }}>{formatDate(backup.createdAt)}</td>
              <td style={{ padding: '8px 4px' }}>
                <button
                  onClick={() => handleDelete(backup)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--error, #dc3545)',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {t('settings.backup.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
