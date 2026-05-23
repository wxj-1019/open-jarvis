import { SettingsSection } from '../components/SettingsSection';
import { t } from '../helpers';
import { ManualBackup } from './backup/ManualBackup';
import { BackupHistory } from './backup/BackupHistory';
import { AutoBackupConfig } from './backup/AutoBackupConfig';

export function BackupTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SettingsSection title={t('settings.backup.manualBackup')}>
        <ManualBackup />
      </SettingsSection>

      <SettingsSection title={t('settings.backup.backupHistory')}>
        <BackupHistory />
      </SettingsSection>

      <SettingsSection title={t('settings.backup.autoBackup')}>
        <AutoBackupConfig />
      </SettingsSection>
    </div>
  );
}
