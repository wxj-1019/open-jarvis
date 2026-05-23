import { useState, useEffect } from 'react';
import { hanaFetch } from '../../api';
import { t } from '../../helpers';
import { useSettingsStore } from '../../store';
import type { BackupConfig } from './backup-types';

export function AutoBackupConfig() {
  const [config, setConfig] = useState<BackupConfig>({
    enabled: false,
    frequency: 'weekly',
    time: '02:00',
    retainCount: 10,
  });
  const [saving, setSaving] = useState(false);
  const showToast = useSettingsStore(s => s.showToast);

  useEffect(() => {
    hanaFetch('/api/settings/backup-config')
      .then(res => res.json())
      .then(data => {
        if (data.config) setConfig(data.config);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await hanaFetch('/api/settings/backup-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await res.json();
      if (result.success) {
        showToast(t('settings.backup.configSaved'), 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
        />
        {t('settings.backup.enableAutoBackup')}
      </label>

      {config.enabled && (
        <>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #666)' }}>{t('settings.backup.frequency')}</span>
              <select
                value={config.frequency}
                onChange={(e) => setConfig({ ...config, frequency: e.target.value as any })}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border, #e1e4e8)', background: 'var(--surface-2, #fff)', color: 'var(--text, #1a1a1a)' }}
              >
                <option value="daily">{t('settings.backup.daily')}</option>
                <option value="weekly">{t('settings.backup.weekly')}</option>
                <option value="monthly">{t('settings.backup.monthly')}</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #666)' }}>{t('settings.backup.time')}</span>
              <input
                type="time"
                value={config.time}
                onChange={(e) => setConfig({ ...config, time: e.target.value })}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border, #e1e4e8)', background: 'var(--surface-2, #fff)', color: 'var(--text, #1a1a1a)' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #666)' }}>{t('settings.backup.retainCount')}</span>
              <input
                type="number"
                value={config.retainCount}
                onChange={(e) => setConfig({ ...config, retainCount: Number(e.target.value) })}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border, #e1e4e8)', background: 'var(--surface-2, #fff)', color: 'var(--text, #1a1a1a)', width: '80px' }}
                min="1"
                max="50"
              />
            </label>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: saving ? 'var(--text-muted, #666)' : 'var(--accent, #4a9eff)',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
              alignSelf: 'flex-start',
            }}
          >
            {saving ? '...' : 'Save'}
          </button>
        </>
      )}
    </div>
  );
}
