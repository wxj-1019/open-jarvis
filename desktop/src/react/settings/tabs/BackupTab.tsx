import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { SettingsSection } from '../components/SettingsSection';
import { t } from '../helpers';
import { useSettingsStore } from '../store';
import { AgentSelect } from './bridge/AgentSelect';
import { ManualBackup } from './backup/ManualBackup';
import { BackupHistory } from './backup/BackupHistory';
import { AutoBackupConfig } from './backup/AutoBackupConfig';
import tabStyles from '../Settings.module.css';
import styles from './backup/BackupTab.module.css';

export function BackupTab() {
  const { backupSelectedAgentId, currentAgentId, agents, set } = useSettingsStore(
    useShallow(s => ({
      backupSelectedAgentId: s.backupSelectedAgentId,
      currentAgentId: s.currentAgentId,
      agents: s.agents,
      set: s.set,
    }))
  );

  useEffect(() => {
    if (backupSelectedAgentId) return;
    if (currentAgentId) {
      set({ backupSelectedAgentId: currentAgentId });
      return;
    }
    if (agents.length > 0) {
      set({ backupSelectedAgentId: agents[0].id });
    }
  }, [backupSelectedAgentId, currentAgentId, agents, set]);

  const setAgent = (agentId: string) => {
    set({ backupSelectedAgentId: agentId || null });
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="backup">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.backup.pageDesc')}</p>

        <SettingsSection
          title={t('settings.backup.manualBackup')}
          context={
            <AgentSelect
              value={backupSelectedAgentId}
              onChange={setAgent}
            />
          }
        >
          <SettingsSection.Note>{t('settings.backup.manualBackupDesc')}</SettingsSection.Note>
          <ManualBackup />
        </SettingsSection>

        <SettingsSection title={t('settings.backup.backupHistory')}>
          <BackupHistory />
        </SettingsSection>

        <SettingsSection title={t('settings.backup.autoBackup')}>
          <SettingsSection.Note>{t('settings.backup.autoBackupDesc')}</SettingsSection.Note>
          <AutoBackupConfig />
        </SettingsSection>
      </div>
    </div>
  );
}
