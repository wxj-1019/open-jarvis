import React, { useState, useCallback, useEffect } from 'react';
import { ChartLine } from '@phosphor-icons/react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore, type ProviderSummary } from '../store';
import { hanaFetch } from '../api';
import { t, PROVIDER_PRESETS } from '../helpers';
import { loadSettingsConfig } from '../actions';
import { ProviderDetail } from './providers/ProviderDetail';
import { AddCustomButton, AddProviderOverlay } from './providers/ProviderList';
import { OtherModelsSection } from './providers/OtherModelsSection';
import { SettingsSection } from '../components/SettingsSection';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import tabStyles from '../Settings.module.css';
import styles from './ProvidersTab.module.css';

export function ProvidersTab() {
  const { providersSummary, selectedProviderId, settingsConfig } = useSettingsStore(
    useShallow(s => ({ providersSummary: s.providersSummary, selectedProviderId: s.selectedProviderId, settingsConfig: s.settingsConfig }))
  );
  const providers = settingsConfig?.providers || {};
  const [addingProvider, setAddingProvider] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await hanaFetch('/api/providers/summary');
      const data = await res.json();
      useSettingsStore.setState({ providersSummary: data.providers || {} });
    } catch { /* swallow */ }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const providerIds = Object.keys(providersSummary);
  const configuredProviderIds = providerIds.filter(id => providersSummary[id].is_configured !== false);
  const setupProviderIds = providerIds.filter(id => providersSummary[id].is_configured === false);
  const selected = selectedProviderId;

  const oauthProviders = configuredProviderIds.filter(id => providersSummary[id].supports_oauth);
  const codingPlanProviders = configuredProviderIds.filter(id => !providersSummary[id].supports_oauth && providersSummary[id].is_coding_plan);
  const registeredApiKey = configuredProviderIds.filter(id => !providersSummary[id].supports_oauth && !providersSummary[id].is_coding_plan);
  const registeredSet = new Set(configuredProviderIds);

  const unregisteredPresets = PROVIDER_PRESETS.filter(p =>
    !registeredSet.has(p.value) && !oauthProviders.includes(p.value)
  );
  const presetValues = new Set(PROVIDER_PRESETS.map(p => p.value));
  const unregisteredCodingPresets = unregisteredPresets.filter(p => p.value.endsWith('-coding'));
  const unregisteredApiPresets = unregisteredPresets.filter(p => !p.value.endsWith('-coding'));
  const registryOnlyCodingProviders = setupProviderIds.filter(id => !presetValues.has(id) && providersSummary[id].is_coding_plan);
  const registryOnlyApiProviders = setupProviderIds.filter(id => !presetValues.has(id) && !providersSummary[id].supports_oauth && !providersSummary[id].is_coding_plan);
  const customProviders = registeredApiKey.filter(id => !presetValues.has(id));
  const presetProviders = registeredApiKey.filter(id => presetValues.has(id));

  const selectProvider = (id: string) => {
    useSettingsStore.setState({ selectedProviderId: id });
  };

  const renderRegistered = (id: string) => {
    const p = providersSummary[id];
    const preset = PROVIDER_PRESETS.find(pr => pr.value === id);
    const modelCount = (p.models || []).length;
    return (
      <button
        key={id}
        type="button"
        className={`${tabStyles['pv-list-item']}${selected === id ? ` ${tabStyles['selected']}` : ''}`}
        onClick={() => selectProvider(id)}
      >
        <span className={`${tabStyles['pv-status-dot']}${p.has_credentials ? ` ${tabStyles['on']}` : ''}`} />
        <span className={tabStyles['pv-list-item-name']}>{preset?.label || p.display_name || id}</span>
        <span className={tabStyles['pv-list-item-count']}>{modelCount}</span>
      </button>
    );
  };

  const renderUnregistered = (preset: typeof PROVIDER_PRESETS[0]) => (
    <button
      key={preset.value}
      type="button"
      className={`${tabStyles['pv-list-item']} ${tabStyles['dim']}${selected === preset.value ? ` ${tabStyles['selected']}` : ''}`}
      onClick={() => selectProvider(preset.value)}
    >
      <span className={tabStyles['pv-status-dot']} />
      <span className={tabStyles['pv-list-item-name']}>{preset.label}</span>
    </button>
  );

  const renderRegistrySetup = (id: string) => {
    const p = providersSummary[id];
    return (
      <button
        key={id}
        type="button"
        className={`${tabStyles['pv-list-item']} ${tabStyles['dim']}${selected === id ? ` ${tabStyles['selected']}` : ''}`}
        onClick={() => selectProvider(id)}
      >
        <span className={tabStyles['pv-status-dot']} />
        <span className={tabStyles['pv-list-item-name']}>{p.display_name || id}</span>
      </button>
    );
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="providers">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.providers.pageDesc')}</p>

        <SettingsSection
          title={t('settings.providers.providersSection')}
          variant="double-column"
          className={styles.providerShell}
        >
          <SettingsSection.Note>{t('settings.providers.providersSectionNote')}</SettingsSection.Note>
          <div className={tabStyles['pv-layout']}>
            <div className={tabStyles['pv-list']}>
              {oauthProviders.length > 0 && (
                <>
                  <div className={tabStyles['pv-list-group-label']}>{t('settings.providers.groupOAuth')}</div>
                  {oauthProviders.map(renderRegistered)}
                </>
              )}

              {(codingPlanProviders.length > 0 || unregisteredCodingPresets.length > 0 || registryOnlyCodingProviders.length > 0) && (
                <>
                  <div className={tabStyles['pv-list-group-label']}>{t('settings.providers.groupCodingPlan')}</div>
                  {codingPlanProviders.map(renderRegistered)}
                  {unregisteredCodingPresets.map(renderUnregistered)}
                  {registryOnlyCodingProviders.map(renderRegistrySetup)}
                </>
              )}

              <div className={tabStyles['pv-list-group-label']}>{t('settings.providers.groupApi')}</div>
              {presetProviders.map(renderRegistered)}
              {unregisteredApiPresets.map(renderUnregistered)}
              {registryOnlyApiProviders.map(renderRegistrySetup)}
              {customProviders.map(renderRegistered)}

              <AddCustomButton onClick={() => setAddingProvider(true)} />
            </div>

            <div className={tabStyles['pv-detail']}>
              {selected ? (() => {
                const existing = providersSummary[selected];
                const preset = PROVIDER_PRESETS.find(p => p.value === selected);
                const isRegistryOnlySetup = existing?.is_configured === false;
                const summary: ProviderSummary = existing || {
                  type: 'api-key' as const,
                  auth_type: 'api-key' as const,
                  display_name: preset?.label || selected,
                  base_url: preset?.url || '',
                  api: preset?.api || '',
                  api_key: '',
                  models: [],
                  custom_models: [],
                  has_credentials: false,
                  supports_oauth: false,
                  can_delete: false,
                };
                return (
                  <ProviderDetail
                    key={selected}
                    providerId={selected}
                    summary={summary}
                    providerConfig={providers[selected]}
                    isPresetSetup={(!existing || isRegistryOnlySetup) && !!preset}
                    presetInfo={preset}
                    onRefresh={async () => { await loadSettingsConfig(); await loadSummary(); }}
                  />
                );
              })() : (
                <div className={styles.emptyDetail}>
                  <span className={styles.emptyIcon}>
                    <PhosphorIcon icon={ChartLine} size={22} />
                  </span>
                  <span>{t('settings.providers.selectHint')}</span>
                </div>
              )}
            </div>

            {addingProvider && (
              <AddProviderOverlay
                onDone={() => { setAddingProvider(false); loadSummary(); }}
                onCancel={() => setAddingProvider(false)}
              />
            )}
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.api.otherModelSection')}>
          <SettingsSection.Note>{t('settings.providers.otherModelsSectionNote')}</SettingsSection.Note>
          <OtherModelsSection providers={providers} />
        </SettingsSection>
      </div>
    </div>
  );
}
