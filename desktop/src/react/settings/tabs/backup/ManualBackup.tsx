import { useState } from 'react';
import { hanaFetch } from '../../api';
import { t } from '../../helpers';
import { useSettingsStore } from '../../store';

export function ManualBackup() {
  const selectedAgentId = useSettingsStore(s => s.backupSelectedAgentId);
  const set = useSettingsStore(s => s.set);
  const [exporting, setExporting] = useState(false);
  const showToast = useSettingsStore(s => s.showToast);
  const agents = useSettingsStore(s => s.agents);

  const handleExport = async () => {
    if (!selectedAgentId) {
      showToast(t('settings.backup.selectAgent'), 'error');
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
    } catch (err: any) {
      showToast(err.message || t('settings.backup.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (!selectedAgentId) {
        showToast(t('settings.backup.selectAgent'), 'error');
        return;
      }

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
      } catch (err: any) {
        showToast(err.message || t('settings.backup.importFailed'), 'error');
      }
    };
    input.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <select
        value={selectedAgentId || ''}
        onChange={(e) => set({ backupSelectedAgentId: e.target.value || null })}
        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border, #e1e4e8)', background: 'var(--surface-2, #fff)', color: 'var(--text, #1a1a1a)' }}
      >
        <option value="">{t('settings.backup.selectAgent')}</option>
        {agents.map((agent: any) => (
          <option key={agent.id} value={agent.id}>
            {agent.name || agent.id}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleExport}
          disabled={exporting || !selectedAgentId}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: exporting || !selectedAgentId ? 'var(--text-muted, #666)' : 'var(--accent, #4a9eff)',
            color: '#fff',
            cursor: exporting || !selectedAgentId ? 'not-allowed' : 'pointer',
            opacity: exporting || !selectedAgentId ? 0.5 : 1,
          }}
        >
          {exporting ? '...' : t('settings.backup.exportBackup')}
        </button>

        <button
          onClick={handleImport}
          disabled={!selectedAgentId}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: !selectedAgentId ? 'var(--text-muted, #666)' : 'var(--success, #28a745)',
            color: '#fff',
            cursor: !selectedAgentId ? 'not-allowed' : 'pointer',
            opacity: !selectedAgentId ? 0.5 : 1,
          }}
        >
          {t('settings.backup.importBackup')}
        </button>
      </div>
    </div>
  );
}
