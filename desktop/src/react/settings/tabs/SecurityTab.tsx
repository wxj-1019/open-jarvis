import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Clock,
  FileText,
  Globe,
  HardDrives,
  Lock,
  ShieldWarning,
  Wrench,
} from '@phosphor-icons/react';
import { useSettingsStore } from '../store';
import { autoSaveConfig, t } from '../helpers';
import { hanaFetch } from '../api';
import { loadSettingsConfig } from '../actions';
import { Toggle } from '../widgets/Toggle';
import { SelectWidget } from '@/ui';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { ExpandableRow } from '../components/ExpandableRow';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import tabStyles from '../Settings.module.css';
import styles from './SecurityTab.module.css';

interface Checkpoint {
  id: string;
  ts: number;
  tool: string;
  path: string;
  size: number;
}

const RETENTION_OPTIONS = [
  { value: 1, key: 'settings.security.retention1d' },
  { value: 3, key: 'settings.security.retention3d' },
  { value: 7, key: 'settings.security.retention7d' },
];

const SIZE_OPTIONS = [
  { value: 512, label: '512 KB' },
  { value: 1024, label: '1 MB' },
  { value: 5120, label: '5 MB' },
  { value: 10240, label: '10 MB' },
];

const PROXY_MODES = ['system', 'manual', 'direct'] as const;

type NetworkProxyMode = (typeof PROXY_MODES)[number];

interface NetworkProxyConfig {
  mode: NetworkProxyMode;
  httpProxy: string;
  httpsProxy: string;
  wsProxy: string;
  wssProxy: string;
  noProxy: string;
}

type NetworkProxyTextField = Exclude<keyof NetworkProxyConfig, 'mode'>;

const DEFAULT_NETWORK_PROXY: NetworkProxyConfig = {
  mode: 'system',
  httpProxy: '',
  httpsProxy: '',
  wsProxy: '',
  wssProxy: '',
  noProxy: 'localhost, 127.0.0.1, ::1',
};

function normalizeNetworkProxyDraft(value: Partial<NetworkProxyConfig> | null | undefined): NetworkProxyConfig {
  const mode = value?.mode === 'manual' || value?.mode === 'direct' ? value.mode : 'system';
  return {
    ...DEFAULT_NETWORK_PROXY,
    ...(value || {}),
    mode,
    httpProxy: value?.httpProxy || '',
    httpsProxy: value?.httpsProxy || '',
    wsProxy: value?.wsProxy || '',
    wssProxy: value?.wssProxy || '',
    noProxy: value?.noProxy || DEFAULT_NETWORK_PROXY.noProxy,
  };
}

function proxyConfigEqual(a: NetworkProxyConfig, b: NetworkProxyConfig): boolean {
  return (
    a.mode === b.mode
    && a.httpProxy === b.httpProxy
    && a.httpsProxy === b.httpsProxy
    && a.wsProxy === b.wsProxy
    && a.wssProxy === b.wssProxy
    && a.noProxy === b.noProxy
  );
}

function formatPath(p: string) {
  const parts = p.split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return `.../${parts.slice(-2).join('/')}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function CheckpointList({
  checkpoints,
  loading,
  onRestore,
}: {
  checkpoints: Checkpoint[];
  loading: boolean;
  onRestore: (id: string) => void;
}) {
  if (loading) {
    return <div className={styles.loading}>{t('settings.security.loadingCheckpoints')}</div>;
  }

  if (checkpoints.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>
          <PhosphorIcon icon={FileText} size={20} />
        </span>
        <span>{t('settings.security.noBackups')}</span>
      </div>
    );
  }

  return (
    <div className={styles.checkpointList}>
      {checkpoints.map((cp) => (
        <div key={cp.id} className={styles.checkpointItem}>
          <span className={styles.checkpointIcon}>
            <PhosphorIcon icon={FileText} size={16} />
          </span>
          <div className={styles.checkpointMain}>
            <div className={styles.checkpointPath} title={cp.path}>{formatPath(cp.path)}</div>
            <div className={styles.checkpointMeta}>
              <span>
                <PhosphorIcon icon={Clock} size={11} />
                {formatTime(cp.ts)}
              </span>
              {cp.tool ? (
                <span>
                  <PhosphorIcon icon={Wrench} size={11} />
                  {cp.tool}
                </span>
              ) : null}
              {cp.size > 0 ? (
                <span>
                  <PhosphorIcon icon={HardDrives} size={11} />
                  {formatSize(cp.size)}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className={styles.restoreBtn}
            onClick={() => onRestore(cp.id)}
          >
            {t('settings.security.restoreBtn')}
          </button>
        </div>
      ))}
    </div>
  );
}

export function SecurityTab() {
  const settingsConfig = useSettingsStore(s => s.settingsConfig);
  const platformName = useSettingsStore(s => s.platformName);
  const showToast = useSettingsStore(s => s.showToast);

  const sandboxEnabled = settingsConfig?.sandbox !== false;
  const isWindows = platformName === 'win32';
  const sandboxNetworkEnabled = isWindows || settingsConfig?.sandbox_network !== false;
  const sandboxNetworkDisabled = !sandboxEnabled || isWindows;
  const fileBackup = settingsConfig?.file_backup || { enabled: false, retention_days: 1, max_file_size_kb: 1024 };

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [proxyDraft, setProxyDraft] = useState<NetworkProxyConfig>(
    () => normalizeNetworkProxyDraft(settingsConfig?.network_proxy),
  );

  const savedProxy = useMemo(
    () => normalizeNetworkProxyDraft(settingsConfig?.network_proxy),
    [settingsConfig?.network_proxy],
  );

  const proxyDirty = !proxyConfigEqual(proxyDraft, savedProxy);

  useEffect(() => {
    setProxyDraft(savedProxy);
  }, [savedProxy]);

  const handleSandboxToggle = useCallback(async (on: boolean) => {
    await autoSaveConfig({ sandbox: on }, { silent: true });
    await loadSettingsConfig();
  }, []);

  const handleSandboxNetworkToggle = useCallback(async (on: boolean) => {
    await autoSaveConfig({ sandbox_network: on }, { silent: true });
    await loadSettingsConfig();
  }, []);

  const handleBackupToggle = useCallback(async (on: boolean) => {
    const current = useSettingsStore.getState().settingsConfig?.file_backup || {};
    await autoSaveConfig({ file_backup: { ...current, enabled: on } }, { silent: true });
    await loadSettingsConfig();
  }, []);

  const handleRetentionChange = useCallback(async (value: string) => {
    const days = parseInt(value, 10);
    const current = useSettingsStore.getState().settingsConfig?.file_backup || {};
    await autoSaveConfig({ file_backup: { ...current, retention_days: days } }, { silent: true });
    await loadSettingsConfig();
  }, []);

  const handleMaxSizeChange = useCallback(async (value: string) => {
    const kb = parseInt(value, 10);
    const current = useSettingsStore.getState().settingsConfig?.file_backup || {};
    await autoSaveConfig({ file_backup: { ...current, max_file_size_kb: kb } }, { silent: true });
    await loadSettingsConfig();
  }, []);

  const handleProxyFieldChange = useCallback((field: NetworkProxyTextField, value: string) => {
    setProxyDraft(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleProxyModeChange = useCallback((mode: NetworkProxyMode) => {
    setProxyDraft(prev => ({ ...prev, mode }));
  }, []);

  const handleProxySave = useCallback(async () => {
    const saved = await autoSaveConfig({ network_proxy: proxyDraft }, { silent: true });
    if (!saved) return;
    const latest = useSettingsStore.getState().settingsConfig?.network_proxy || proxyDraft;
    window.platform?.settingsChanged?.('network-proxy-changed', { network_proxy: latest });
    showToast(t('settings.autoSaved'), 'success');
    await loadSettingsConfig();
  }, [proxyDraft, showToast]);

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hanaFetch('/api/checkpoints');
      const data = await res.json();
      setCheckpoints(data.checkpoints || []);
    } catch {
      setCheckpoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestore = useCallback(async (id: string) => {
    try {
      const res = await hanaFetch(`/api/checkpoints/${id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast(t('settings.security.restoreSuccess'), 'success');
        loadCheckpoints();
      } else {
        showToast(t('settings.security.restoreFailed'), 'error');
      }
    } catch {
      showToast(t('settings.security.restoreFailed'), 'error');
    }
  }, [showToast, loadCheckpoints]);

  const proxyModeLabel = (mode: NetworkProxyMode) => {
    if (mode === 'manual') return t('settings.security.networkProxyManual');
    if (mode === 'direct') return t('settings.security.networkProxyDirect');
    return t('settings.security.networkProxySystem');
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="security">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.security.pageDesc')}</p>

        <SettingsSection title={t('settings.security.sandbox')}>
          <SettingsSection.Note>{t('settings.security.sandboxSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.security.sandbox')}
            hint={t('settings.security.sandboxDesc')}
            control={<Toggle on={sandboxEnabled} onChange={handleSandboxToggle} />}
          />
          <SettingsRow
            label={t('settings.security.sandboxNetwork')}
            hint={isWindows
              ? t('settings.security.sandboxNetworkWin32Unsupported')
              : sandboxEnabled
                ? t('settings.security.sandboxNetworkDesc')
                : t('settings.security.sandboxNetworkDisabledDesc')}
            control={
              <Toggle
                on={sandboxNetworkEnabled}
                onChange={handleSandboxNetworkToggle}
                disabled={sandboxNetworkDisabled}
              />
            }
          />
          {!sandboxEnabled && (
            <div className={styles.statusBanner} role="alert">
              <PhosphorIcon icon={ShieldWarning} size={16} className={styles.statusBannerIcon} />
              <span>{t('settings.security.sandboxWarning')}</span>
            </div>
          )}
        </SettingsSection>

        <SettingsSection title={t('settings.security.fileBackup')}>
          <SettingsSection.Note>{t('settings.security.fileBackupSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.security.fileBackup')}
            hint={t('settings.security.fileBackupDesc')}
            control={<Toggle on={fileBackup.enabled} onChange={handleBackupToggle} />}
          />

          {fileBackup.enabled && (
            <>
              <SettingsRow
                label={t('settings.security.retention')}
                control={
                  <SelectWidget
                    value={String(fileBackup.retention_days)}
                    onChange={handleRetentionChange}
                    options={RETENTION_OPTIONS.map(opt => ({ value: String(opt.value), label: t(opt.key) }))}
                  />
                }
              />

              <SettingsRow
                label={t('settings.security.maxFileSize')}
                control={
                  <SelectWidget
                    value={String(fileBackup.max_file_size_kb)}
                    onChange={handleMaxSizeChange}
                    options={SIZE_OPTIONS.map(opt => ({ value: String(opt.value), label: opt.label }))}
                  />
                }
              />

              <div className={styles.checkpointPanel}>
                <ExpandableRow
                  label={t('settings.security.viewBackups')}
                  count={checkpoints.length || undefined}
                  onToggle={(expanded) => {
                    if (expanded) loadCheckpoints();
                  }}
                >
                  <CheckpointList
                    checkpoints={checkpoints}
                    loading={loading}
                    onRestore={handleRestore}
                  />
                </ExpandableRow>
              </div>
            </>
          )}
        </SettingsSection>

        <SettingsSection title={t('settings.security.networkProxy')}>
          <SettingsSection.Note>{t('settings.security.networkProxySectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.security.networkProxyMode')}
            hint={t('settings.security.networkProxyModeDesc')}
            control={
              <div className={styles.proxyModeGroup} role="group" aria-label={t('settings.security.networkProxyMode')}>
                {PROXY_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.proxyModeBtn}${proxyDraft.mode === mode ? ` ${styles.proxyModeBtnActive}` : ''}`}
                    aria-pressed={proxyDraft.mode === mode}
                    onClick={() => handleProxyModeChange(mode)}
                  >
                    {proxyModeLabel(mode)}
                  </button>
                ))}
              </div>
            }
          />

          {proxyDraft.mode === 'manual' && (
            <SettingsRow
              label={t('settings.security.networkProxyManualTitle')}
              hint={t('settings.security.networkProxyManualDesc')}
              layout="stacked"
              control={
                <div className={styles.proxyGrid}>
                  {([
                    ['httpProxy', 'networkProxyHttp'],
                    ['httpsProxy', 'networkProxyHttps'],
                    ['wsProxy', 'networkProxyWs'],
                    ['wssProxy', 'networkProxyWss'],
                  ] as const).map(([field, labelKey]) => (
                    <label key={field}>
                      <span className={styles.proxyFieldLabel}>{t(`settings.security.${labelKey}`)}</span>
                      <input
                        className={`${tabStyles['settings-input']} ${styles.proxyField}`}
                        value={proxyDraft[field]}
                        onChange={(e) => handleProxyFieldChange(field, e.target.value)}
                        placeholder={t(`settings.security.${labelKey}`)}
                      />
                    </label>
                  ))}
                  <label className={styles.proxyGridWide}>
                    <span className={styles.proxyFieldLabel}>{t('settings.security.networkProxyNoProxy')}</span>
                    <input
                      className={`${tabStyles['settings-input']} ${styles.proxyField}`}
                      value={proxyDraft.noProxy}
                      onChange={(e) => handleProxyFieldChange('noProxy', e.target.value)}
                      placeholder={t('settings.security.networkProxyNoProxy')}
                    />
                  </label>
                </div>
              }
            />
          )}

          {proxyDraft.mode === 'direct' && (
            <SettingsSection.Note>
              <PhosphorIcon icon={Globe} size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              {t('settings.security.networkProxyDirectNote')}
            </SettingsSection.Note>
          )}

          <SettingsSection.Footer>
            <div className={styles.proxyFooter}>
              {proxyDirty ? (
                <span className={styles.proxyDirtyHint}>{t('settings.security.networkProxyUnsaved')}</span>
              ) : (
                <span className={styles.proxyDirtyHint}>
                  <PhosphorIcon icon={Lock} size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                  {t('settings.security.networkProxySaved')}
                </span>
              )}
              <button
                type="button"
                className={tabStyles['settings-btn-primary']}
                onClick={handleProxySave}
                disabled={!proxyDirty}
              >
                {t('settings.security.networkProxySave')}
              </button>
            </div>
          </SettingsSection.Footer>
        </SettingsSection>
      </div>
    </div>
  );
}
