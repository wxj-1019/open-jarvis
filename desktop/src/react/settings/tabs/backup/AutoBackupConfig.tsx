import { useState, useEffect } from 'react';
import { hanaFetch } from '../../api';
import { t } from '../../helpers';
import { useSettingsStore } from '../../store';
import { Toggle } from '../../widgets/Toggle';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSection } from '../../components/SettingsSection';
import { NumberInput } from '../../components/NumberInput';
import tabStyles from '../../Settings.module.css';
import styles from './BackupTab.module.css';
import type { BackupConfig } from './backup-types';

const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  frequency: 'weekly',
  time: '02:00',
  retainCount: 10,
};

export function AutoBackupConfig() {
  const [config, setConfig] = useState<BackupConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showToast = useSettingsStore(s => s.showToast);

  useEffect(() => {
    hanaFetch('/api/settings/backup-config')
      .then(res => res.json())
      .then(data => {
        if (data.config) setConfig(data.config);
      })
      .catch(console.error)
      .finally(() => setLoaded(true));
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
      } else {
        showToast(result.error || t('settings.saveFailed'), 'error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('settings.saveFailed');
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsRow
        label={t('settings.backup.enableAutoBackup')}
        hint={t('settings.backup.enableAutoBackupDesc')}
        control={
          <Toggle
            on={loaded ? config.enabled : undefined}
            onChange={(enabled) => setConfig({ ...config, enabled })}
          />
        }
      />

      {config.enabled && (
        <div className={styles.autoFields}>
          <SettingsRow
            label={t('settings.backup.frequency')}
            control={
              <select
                className={`${tabStyles['settings-input']} ${styles.fieldFull}`}
                value={config.frequency}
                onChange={(e) => setConfig({ ...config, frequency: e.target.value as BackupConfig['frequency'] })}
              >
                <option value="daily">{t('settings.backup.daily')}</option>
                <option value="weekly">{t('settings.backup.weekly')}</option>
                <option value="monthly">{t('settings.backup.monthly')}</option>
              </select>
            }
          />
          <SettingsRow
            label={t('settings.backup.time')}
            control={
              <input
                type="time"
                className={`${tabStyles['settings-input']} ${styles.fieldFull}`}
                value={config.time}
                onChange={(e) => setConfig({ ...config, time: e.target.value })}
              />
            }
          />
          <SettingsRow
            label={t('settings.backup.retainCount')}
            hint={t('settings.backup.retainCountDesc')}
            control={
              <NumberInput
                value={config.retainCount}
                min={1}
                max={50}
                onChange={(retainCount) => setConfig({ ...config, retainCount })}
              />
            }
          />
        </div>
      )}

      {config.enabled && (
        <SettingsSection.Footer>
          <button
            type="button"
            className={tabStyles['settings-btn-primary']}
            onClick={handleSave}
            disabled={saving || !loaded}
          >
            {saving ? '...' : t('settings.save')}
          </button>
        </SettingsSection.Footer>
      )}
    </>
  );
}
