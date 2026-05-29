import React, { useState, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../store';
import { t, autoSaveConfig } from '../helpers';
import { hanaFetch } from '../api';
import { Toggle } from '../widgets/Toggle';
import { AgentSelect } from './bridge/AgentSelect';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { NumberInput } from '../components/NumberInput';
import tabStyles from '../Settings.module.css';
import styles from './WorkTab.module.css';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { Folder, X } from '@phosphor-icons/react';
import { DEFAULT_HEARTBEAT_INTERVAL_MINUTES } from '../../../../../shared/default-workspace-constants.js';

type AgentDeskConfig = {
  home_folder: string;
  heartbeat_enabled: boolean;
  heartbeat_interval: number;
};

export function WorkTab() {
  const { settingsConfig, currentAgentId } = useSettingsStore(
    useShallow(s => ({ settingsConfig: s.settingsConfig, currentAgentId: s.currentAgentId }))
  );
  const showToast = useSettingsStore(s => s.showToast);

  const heartbeatMaster = settingsConfig?.desk?.heartbeat_master !== false;
  const cronAutoApprove = settingsConfig?.desk?.cron_auto_approve !== false;

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(currentAgentId);
  const selectedAgentIdRef = useRef(selectedAgentId);
  selectedAgentIdRef.current = selectedAgentId;

  useEffect(() => {
    if (selectedAgentId) return;
    if (currentAgentId) setSelectedAgentId(currentAgentId);
  }, [currentAgentId]);

  const [agentDesk, setAgentDesk] = useState<AgentDeskConfig | null>(null);
  const [hbIntervalDraft, setHbIntervalDraft] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedAgentId) return;
    setAgentDesk(null);
    setHbIntervalDraft(null);
    const ac = new AbortController();
    hanaFetch(`/api/agents/${selectedAgentId}/config`, { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        if (ac.signal.aborted) return;
        const desk: AgentDeskConfig = {
          home_folder: data.desk?.home_folder || '',
          heartbeat_enabled: data.desk?.heartbeat_enabled !== false,
          heartbeat_interval: data.desk?.heartbeat_interval ?? DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
        };
        setAgentDesk(desk);
        setHbIntervalDraft(desk.heartbeat_interval);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') console.warn('[work] fetch agent config failed:', err);
      });
    return () => ac.abort();
  }, [selectedAgentId]);

  const toggleHeartbeatMaster = async (on: boolean) => {
    await autoSaveConfig({ desk: { heartbeat_master: on } });
  };

  const toggleCronAutoApprove = async (on: boolean) => {
    await autoSaveConfig({ desk: { cron_auto_approve: on } });
  };

  const saveAgentConfig = async (agentId: string, patch: Record<string, unknown>): Promise<boolean> => {
    if (!agentId) return false;
    try {
      const res = await hanaFetch(`/api/agents/${agentId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (selectedAgentIdRef.current === agentId) {
        showToast(t('settings.autoSaved'), 'success');
      }
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(t('settings.saveFailed') + ': ' + message, 'error');
      return false;
    }
  };

  const togglePerAgentHeartbeat = async (on: boolean) => {
    if (!agentDesk) return;
    const agentId = selectedAgentIdRef.current;
    if (!agentId) return;
    const previous = agentDesk;
    setAgentDesk({ ...agentDesk, heartbeat_enabled: on });
    const saved = await saveAgentConfig(agentId, { desk: { heartbeat_enabled: on } });
    if (!saved && selectedAgentIdRef.current === agentId) {
      setAgentDesk(previous);
    }
  };

  const pickHomeFolder = async () => {
    if (!agentDesk) return;
    const agentId = selectedAgentIdRef.current;
    if (!agentId) return;
    const previous = agentDesk;
    const folder = await window.platform?.selectFolder?.();
    if (!folder) return;
    if (selectedAgentIdRef.current === agentId) {
      setAgentDesk({ ...agentDesk, home_folder: folder });
    }
    const saved = await saveAgentConfig(agentId, { desk: { home_folder: folder } });
    if (!saved && selectedAgentIdRef.current === agentId) {
      setAgentDesk(previous);
    }
  };

  const clearHomeFolder = async () => {
    if (!agentDesk) return;
    const agentId = selectedAgentIdRef.current;
    if (!agentId) return;
    const previous = agentDesk;
    setAgentDesk({ ...agentDesk, home_folder: '' });
    const saved = await saveAgentConfig(agentId, { desk: { home_folder: '' } });
    if (!saved && selectedAgentIdRef.current === agentId) {
      setAgentDesk(previous);
    }
  };

  const saveInterval = async () => {
    if (hbIntervalDraft == null || !agentDesk) return;
    const agentId = selectedAgentIdRef.current;
    if (!agentId) return;
    const previous = agentDesk;
    const previousDraft = hbIntervalDraft;
    const interval = Math.max(1, Math.min(120, hbIntervalDraft));
    setAgentDesk({ ...agentDesk, heartbeat_interval: interval });
    setHbIntervalDraft(interval);
    const saved = await saveAgentConfig(agentId, { desk: { heartbeat_interval: interval } });
    if (!saved && selectedAgentIdRef.current === agentId) {
      setAgentDesk(previous);
      setHbIntervalDraft(previousDraft);
    }
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="work">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.work.pageDesc')}</p>

        <SettingsSection title={t('settings.work.title')}>
          <SettingsSection.Note>{t('settings.work.globalSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.work.heartbeatMaster')}
            hint={t('settings.work.heartbeatMasterDesc')}
            control={<Toggle on={heartbeatMaster} onChange={toggleHeartbeatMaster} />}
          />
          <SettingsRow
            label={t('settings.work.cronAutoApprove')}
            hint={t('settings.work.cronAutoApproveDesc')}
            control={<Toggle on={cronAutoApprove} onChange={toggleCronAutoApprove} />}
          />
        </SettingsSection>

        <SettingsSection
          title={t('settings.work.agentSectionTitle')}
          context={<AgentSelect value={selectedAgentId} onChange={setSelectedAgentId} />}
        >
          <SettingsSection.Note>{t('settings.work.agentSectionNote')}</SettingsSection.Note>
          {!selectedAgentId ? (
            <p className={styles.noAgentHint}>{t('settings.work.selectAgentFirst')}</p>
          ) : !agentDesk ? (
            <p className={styles.loadingHint}>{t('settings.work.loadingAgent')}</p>
          ) : (
            <>
              <SettingsRow
                label={t('settings.work.heartbeatEnabled')}
                hint={t('settings.work.heartbeatDesc')}
                control={<Toggle on={agentDesk.heartbeat_enabled} onChange={togglePerAgentHeartbeat} />}
              />
              <SettingsRow
                label={t('settings.work.homeFolder')}
                hint={t('settings.work.homeFolderDesc')}
                layout="stacked"
                control={
                  <div className={tabStyles['settings-folder-picker']}>
                    <input
                      type="text"
                      className={`${tabStyles['settings-input']} ${tabStyles['settings-folder-input']}`}
                      readOnly
                      value={agentDesk.home_folder}
                      placeholder={t('settings.work.homeFolderPlaceholder')}
                      onClick={pickHomeFolder}
                    />
                    <button
                      type="button"
                      className={tabStyles['settings-folder-browse']}
                      onClick={pickHomeFolder}
                      title={t('settings.work.homeFolderBrowse')}
                    >
                      <PhosphorIcon icon={Folder} size={14} />
                    </button>
                    {agentDesk.home_folder ? (
                      <button
                        type="button"
                        className={tabStyles['settings-folder-clear']}
                        onClick={clearHomeFolder}
                        title={t('settings.work.homeFolderClear')}
                      >
                        <PhosphorIcon icon={X} size={12} />
                      </button>
                    ) : null}
                  </div>
                }
              />
              <SettingsRow
                label={t('settings.work.heartbeatInterval')}
                control={
                  <div className={styles.intervalControl}>
                    <NumberInput
                      value={hbIntervalDraft ?? agentDesk.heartbeat_interval}
                      onChange={setHbIntervalDraft}
                      unit={t('settings.work.heartbeatUnit')}
                      min={1}
                      max={120}
                      disabled={!agentDesk.heartbeat_enabled}
                    />
                    <button
                      type="button"
                      className={tabStyles['settings-btn-secondary']}
                      onClick={saveInterval}
                      disabled={!agentDesk.heartbeat_enabled}
                    >
                      {t('settings.save')}
                    </button>
                  </div>
                }
              />
            </>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}
