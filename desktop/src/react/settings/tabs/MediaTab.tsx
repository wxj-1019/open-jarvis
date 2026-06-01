import { useState, useCallback, useEffect } from 'react';
import { Image, MicrophoneStage } from '@phosphor-icons/react';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { MediaProviderDetail } from './media/MediaProviderDetail';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { SelectWidget } from '@/ui';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import tabStyles from '../Settings.module.css';
import styles from './MediaTab.module.css';

interface MediaProvider {
  providerId: string;
  displayName?: string;
  hasCredentials: boolean;
  unavailableReason?: string | null;
  models: { id: string; name: string }[];
  availableModels: { id: string; name: string }[];
}

interface MediaConfig {
  defaultImageModel?: { id: string; provider: string };
  providerDefaults?: Record<string, unknown>;
}

function encodeConfigPatch(updates: Partial<MediaConfig>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [key, value === undefined ? null : value]),
  );
}

function applyConfigPatch(prev: MediaConfig, updates: Partial<MediaConfig>): MediaConfig {
  const next = { ...prev } as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as MediaConfig;
}

export function MediaTab() {
  const [providers, setProviders] = useState<Record<string, MediaProvider>>({});
  const [config, setConfig] = useState<MediaConfig>({});
  const [selected, setSelected] = useState<string | null>(null);
  const showToast = useSettingsStore(s => s.showToast);
  const set = useSettingsStore(s => s.set);

  const load = useCallback(async () => {
    try {
      const res = await hanaFetch('/api/plugins/image-gen/providers');
      const data = await res.json();
      const nextProviders = data.providers || {};
      setProviders(nextProviders);
      setConfig(data.config || {});
      setSelected((current) => {
        if (current && nextProviders[current]) return current;
        const ids = Object.keys(nextProviders);
        return ids.find((id) => nextProviders[id]?.hasCredentials) || ids[0] || null;
      });
    } catch {
      /* plugin not loaded yet */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const providerIds = Object.keys(providers);
  const allImageModels = providerIds.flatMap((pid) =>
    (providers[pid].models || []).map((m) => ({ ...m, provider: pid })),
  );

  const saveConfig = async (updates: Partial<MediaConfig>) => {
    try {
      const res = await hanaFetch('/api/plugins/image-gen/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: encodeConfigPatch(updates) }),
      });
      const data = await res.json().catch(() => null);
      if (data?.values) setConfig(data.values);
      else setConfig((prev) => applyConfigPatch(prev, updates));
      showToast(t('settings.saved'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('settings.saveFailed');
      showToast(message, 'error');
    }
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="media">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.media.pageDesc')}</p>

        <SettingsSection title={t('settings.media.providersSection')} variant="double-column" className={styles.providerShell}>
          <div className={tabStyles['pv-layout']}>
            <div className={tabStyles['pv-list']}>
              <div className={tabStyles['pv-list-group-label']}>{t('settings.media.imageGeneration')}</div>
              {providerIds.length === 0 ? (
                <div className={styles.emptyDetail} style={{ minHeight: 120 }}>
                  <span>{t('settings.media.noProviders')}</span>
                </div>
              ) : (
                providerIds.map((pid) => {
                  const p = providers[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      className={`${tabStyles['pv-list-item']}${selected === pid ? ` ${tabStyles['selected']}` : ''}${!p.hasCredentials ? ` ${tabStyles['dim']}` : ''}`}
                      onClick={() => setSelected(pid)}
                    >
                      <span className={`${tabStyles['pv-status-dot']}${p.hasCredentials ? ` ${tabStyles['on']}` : ''}`} />
                      <span className={tabStyles['pv-list-item-name']}>{p.displayName || pid}</span>
                      <span className={tabStyles['pv-list-item-count']}>{p.models.length}</span>
                    </button>
                  );
                })
              )}

            </div>

            <div className={tabStyles['pv-detail']}>
              {selected && providers[selected] ? (
                <MediaProviderDetail
                  providerId={selected}
                  provider={providers[selected]}
                  config={config}
                  onSaveConfig={saveConfig}
                  onRefresh={load}
                />
              ) : (
                <div className={styles.emptyDetail}>
                  <span className={styles.emptyIcon}>
                    <PhosphorIcon icon={Image} size={22} />
                  </span>
                  <span>{t('settings.media.noProvider')}</span>
                </div>
              )}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.media.voiceSection')}>
          <SettingsSection.Note>{t('settings.media.voiceSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.media.voiceSettings')}
            control={
              <button
                type="button"
                className={tabStyles['settings-btn-secondary']}
                onClick={() => set({ activeTab: 'voice' })}
              >
                <PhosphorIcon icon={MicrophoneStage} size={14} />
                {t('settings.media.openVoiceTab')}
              </button>
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.media.globalDefault')}>
          <SettingsSection.Note>{t('settings.media.globalDefaultNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.media.defaultModel')}
            hint={t('settings.media.defaultModelHint')}
            control={
              <SelectWidget
                value={config.defaultImageModel ? `${config.defaultImageModel.provider}/${config.defaultImageModel.id}` : ''}
                onChange={(val) => {
                  if (!val) {
                    saveConfig({ defaultImageModel: undefined });
                    return;
                  }
                  const [provider, ...rest] = val.split('/');
                  saveConfig({ defaultImageModel: { id: rest.join('/'), provider } });
                }}
                options={[
                  { value: '', label: '—' },
                  ...allImageModels.map((m) => {
                    const providerHasCredentials = providers[m.provider]?.hasCredentials === true;
                    const label = `${m.provider} / ${m.name || m.id}`;
                    return {
                      value: `${m.provider}/${m.id}`,
                      label: providerHasCredentials ? label : `${label} (${t('settings.media.credentialMissing')})`,
                      disabled: !providerHasCredentials,
                    };
                  }),
                ]}
              />
            }
          />
        </SettingsSection>
      </div>
    </div>
  );
}
