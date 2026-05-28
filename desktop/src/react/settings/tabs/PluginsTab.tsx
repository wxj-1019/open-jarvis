import React, { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import tabStyles from '../Settings.module.css';
import styles from './PluginsTab.module.css';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { ArrowsClockwise, Info, UploadSimple, Gear, X, PuzzlePiece } from '@phosphor-icons/react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { Toggle } from '../widgets/Toggle';

const platform = window.platform;

interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
  status: 'loaded' | 'failed' | 'disabled' | 'restricted';
  activationState?: string | null;
  activationEvents?: string[];
  activationError?: string | null;
  source: 'builtin' | 'community';
  trust: 'restricted' | 'full-access';
  contributions?: string[];
  error?: string | null;
}

interface PluginConfigProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  sensitive?: boolean;
  scope?: 'global' | 'per-agent' | 'per-session';
  ui?: { control?: string };
}

interface PluginConfigResponse {
  pluginId: string;
  schema: {
    properties?: Record<string, PluginConfigProperty>;
  };
  values: Record<string, unknown>;
}

interface PluginDiagnostics {
  id: string;
  name?: string;
  status?: string;
  error?: string | null;
  activationState?: string | null;
  activationEvents?: string[];
  activationError?: string | null;
  source?: string;
  trust?: string;
  contributions?: string[];
  routes?: {
    hasRouteApp?: boolean;
    pages?: unknown[];
    widgets?: unknown[];
    settingsTabs?: unknown[];
  };
  tools?: { name: string; dynamic?: boolean }[];
  commands?: { name: string }[];
  providers?: { id: string; name?: string }[];
  config?: { hasSchema?: boolean; keys?: string[] };
}

interface PluginDiagnosticsResponse {
  plugins: PluginDiagnostics[];
  eventBus: { type: string; available?: boolean }[];
  tasks: { taskId: string; type: string; status?: string }[];
  schedules: { scheduleId: string; type: string; enabled?: boolean }[];
}

/* ── Status badge ── */

function StatusBadge({ status }: { status: PluginInfo['status'] }) {
  const labelKey =
    status === 'loaded' ? 'settings.plugins.statusLoaded' :
    status === 'failed' ? 'settings.plugins.statusFailed' :
    status === 'restricted' ? 'settings.plugins.statusRestricted' :
    'settings.plugins.statusDisabled';

  const statusClass =
    status === 'loaded' ? styles.statusLoaded :
    status === 'failed' ? styles.statusFailed :
    status === 'restricted' ? styles.statusRestricted :
    styles.statusDisabled;

  return (
    <span className={`${styles.statusBadge} ${statusClass}`}>
      {t(labelKey)}
    </span>
  );
}

/* ── Contribution badges ── */

function ContributionBadges({ contributions }: { contributions?: string[] }) {
  if (!contributions || contributions.length === 0) return null;
  return (
    <span className={styles.contribWrap}>
      {contributions.map(c => (
        <span key={c} className={styles.contribBadge}>{c}</span>
      ))}
    </span>
  );
}

function formatConfigValue(property: PluginConfigProperty, value: unknown): string {
  if (property.type === 'object' || property.type === 'array') {
    return value === undefined ? '' : JSON.stringify(value, null, 2);
  }
  return value === undefined || value === null ? '' : String(value);
}

function parseConfigValue(property: PluginConfigProperty, value: string): unknown {
  if (property.type === 'number') return Number(value);
  if (property.type === 'integer') return Number.parseInt(value, 10);
  if (property.type === 'object' || property.type === 'array') return value.trim() ? JSON.parse(value) : property.type === 'array' ? [] : {};
  return value;
}

function count(value: unknown[] | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

/* ── Main tab ── */

export function PluginsTab() {
  const { pluginAllowFullAccess, pluginDevToolsEnabled, pluginUserDir } = useSettingsStore(
    useShallow(s => ({
      pluginAllowFullAccess: s.pluginAllowFullAccess,
      pluginDevToolsEnabled: s.pluginDevToolsEnabled,
      pluginUserDir: s.pluginUserDir,
    }))
  );
  const showToast = useSettingsStore(s => s.showToast);
  const set = useSettingsStore(s => s.set);

  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [configPlugin, setConfigPlugin] = useState<PluginInfo | null>(null);
  const [pluginConfig, setPluginConfig] = useState<PluginConfigResponse | null>(null);
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({});
  const [dirtyConfigKeys, setDirtyConfigKeys] = useState<Set<string>>(new Set());
  const [configSaving, setConfigSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PluginDiagnosticsResponse | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  /* ── data fetchers ── */

  const loadPlugins = useCallback(async () => {
    try {
      const res = await hanaFetch('/api/plugins?source=community');
      const data = await res.json();
      setPlugins(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[plugins] load failed:', err);
      setPlugins([]);
    }
  }, []);

  const loadPluginConfig = useCallback(async (plugin: PluginInfo) => {
    try {
      const res = await hanaFetch(`/api/plugins/${encodeURIComponent(plugin.id)}/config`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConfigPlugin(plugin);
      setPluginConfig(data);
      setConfigDraft(data.values || {});
      setDirtyConfigKeys(new Set());
    } catch (err: unknown) {
      showToast(t('settings.plugins.configLoadError') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast]);

  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    try {
      const res = await hanaFetch('/api/plugins/diagnostics');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDiagnostics({
        plugins: Array.isArray(data.plugins) ? data.plugins : [],
        eventBus: Array.isArray(data.eventBus) ? data.eventBus : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        schedules: Array.isArray(data.schedules) ? data.schedules : [],
      });
    } catch (err: unknown) {
      showToast(t('settings.plugins.diagnosticsLoadError') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [showToast]);

  const reload = useCallback(async () => {
    setLoading(true);
    await loadPlugins();
    setLoading(false);
  }, [loadPlugins]);

  useEffect(() => { reload(); }, [reload]);

  /* ── full-access toggle ── */

  const toggleFullAccess = async () => {
    const next = !pluginAllowFullAccess;
    set({ pluginAllowFullAccess: next });
    try {
      const res = await hanaFetch('/api/plugins/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_full_access: next }),
      });
      const data = await res.json();
      if (Array.isArray(data)) setPlugins(data);
      showToast(t('settings.autoSaved'), 'success');
    } catch (err: unknown) {
      set({ pluginAllowFullAccess: !next });
      showToast(t('settings.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const togglePluginDevTools = async () => {
    const next = !pluginDevToolsEnabled;
    set({ pluginDevToolsEnabled: next });
    try {
      const res = await hanaFetch('/api/plugins/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin_dev_tools_enabled: next }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(t('settings.autoSaved'), 'success');
    } catch (err: unknown) {
      set({ pluginDevToolsEnabled: !next });
      showToast(t('settings.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  /* ── install ── */

  const installFromPath = async (filePath: string) => {
    try {
      const res = await hanaFetch('/api/plugins/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(t('settings.plugins.installSuccess', { name: data.name || '' }), 'success');
      await loadPlugins();
    } catch (err: unknown) {
      showToast(
        t('settings.plugins.installError') + ': ' + (err instanceof Error ? err.message : String(err)),
        'error',
      );
    }
  };

  const installByPicker = async () => {
    const selectedPath = await platform?.selectPlugin?.();
    if (!selectedPath) return;
    await installFromPath(selectedPath);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const filePath = platform?.getFilePath?.(file) || (file as File & { path?: string })?.path;
    if (filePath) await installFromPath(filePath);
  };

  /* ── enable / disable ── */

  const togglePlugin = async (id: string, enable: boolean) => {
    // Optimistic update
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, status: enable ? 'loaded' : 'disabled' } as PluginInfo : p));
    try {
      const res = await hanaFetch(`/api/plugins/${encodeURIComponent(id)}/enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(t('settings.autoSaved'), 'success');
      await loadPlugins();
    } catch (err: unknown) {
      // Revert
      setPlugins(prev => prev.map(p => p.id === id ? { ...p, status: enable ? 'disabled' : 'loaded' } as PluginInfo : p));
      showToast(t('settings.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  /* ── delete ── */

  const deletePlugin = async (plugin: PluginInfo) => {
    const msg = t('settings.plugins.deleteConfirm', { name: plugin.name });
    if (!confirm(msg)) return;
    try {
      const res = await hanaFetch(`/api/plugins/${encodeURIComponent(plugin.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(t('settings.autoSaved'), 'success');
      await loadPlugins();
    } catch (err: unknown) {
      showToast(t('settings.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const updateConfigDraft = (key: string, value: unknown) => {
    setConfigDraft(prev => ({ ...prev, [key]: value }));
    setDirtyConfigKeys(prev => new Set(prev).add(key));
  };

  const savePluginConfig = async () => {
    if (!configPlugin || !pluginConfig) return;
    const values: Record<string, unknown> = {};
    for (const key of dirtyConfigKeys) {
      const property = pluginConfig.schema.properties?.[key] || {};
      const value = configDraft[key];
      if (property.sensitive && value === '********') continue;
      values[key] = value;
    }
    setConfigSaving(true);
    try {
      const res = await hanaFetch(`/api/plugins/${encodeURIComponent(configPlugin.id)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.fields?.[0]?.message || data.error);
      setPluginConfig(data);
      setConfigDraft(data.values || {});
      setDirtyConfigKeys(new Set());
      showToast(t('settings.autoSaved'), 'success');
    } catch (err: unknown) {
      showToast(t('settings.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setConfigSaving(false);
    }
  };

  /* ── render ── */

  const isEnabled = (p: PluginInfo) => p.status === 'loaded' || p.status === 'failed';
  const isDimmed = (p: PluginInfo) => p.status === 'disabled' || p.status === 'restricted';

  const reloadButton = (
    <button
      type="button"
      className={tabStyles['settings-icon-btn']}
      title={t('settings.plugins.reload')}
      onClick={reload}
      disabled={loading}
    >
      <PhosphorIcon
        icon={ArrowsClockwise} size={14}
        className={loading ? tabStyles['spin'] : ''}
      />
    </button>
  );

  const diagnosticsButton = (
    <button
      type="button"
      className={tabStyles['settings-icon-btn']}
      title={t('settings.plugins.showDiagnostics')}
      onClick={loadDiagnostics}
      disabled={diagnosticsLoading}
    >
      <PhosphorIcon
        icon={Info} size={14}
        className={diagnosticsLoading ? tabStyles['spin'] : ''}
      />
    </button>
  );

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="plugins">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.plugins.pageDesc')}</p>

        <SettingsSection title={t('settings.plugins.marketplaceTitle')}>
          <SettingsSection.Note>{t('settings.plugins.marketplaceHint')}</SettingsSection.Note>
          <div className={styles.marketplaceRow}>
            <button
              type="button"
              className={tabStyles['settings-btn-primary']}
              title={t('settings.plugins.openMarketplace')}
              onClick={() => set({ activeTab: 'plugin-marketplace' })}
            >
              {t('settings.plugins.openMarketplace')}
            </button>
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.plugins.manageSection')}
          context={<div className={styles.toolbar}>{diagnosticsButton}{reloadButton}</div>}
        >
          <SettingsSection.Note>{t('settings.plugins.manageSectionNote')}</SettingsSection.Note>
          <div
            className={`${styles.dropzone}${dragOver ? ` ${styles.dropzoneActive}` : ''}`}
            onClick={installByPicker}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <PhosphorIcon icon={UploadSimple} size={20} />
            <span>{t('settings.plugins.dropzone')}</span>
          </div>

          {!loading && plugins.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <PhosphorIcon icon={PuzzlePiece} size={20} />
              </span>
              <span>{t('settings.plugins.empty')}</span>
            </div>
          ) : (
            <div className={tabStyles['skills-list-block']}>
            {plugins.map(plugin => {
              const dimmed = isDimmed(plugin);
              const restricted = plugin.status === 'restricted';
              const enabled = isEnabled(plugin);
              const configurable = plugin.contributions?.includes('configuration');

              return (
                <div
                  key={plugin.id}
                  className={tabStyles['skills-list-item']}
                  style={dimmed ? { opacity: 0.55 } : undefined}
                >
                  <div className={tabStyles['skills-list-info']}>
                    <div className={styles.pluginHead}>
                      <span className={tabStyles['skills-list-name']}>{plugin.name}</span>
                      {plugin.version && (
                        <span className={tabStyles['skills-list-name-hint']}>v{plugin.version}</span>
                      )}
                      <StatusBadge status={plugin.status} />
                      <ContributionBadges contributions={plugin.contributions} />
                    </div>
                    {plugin.description && (
                      <span className={tabStyles['skills-list-desc']}>{plugin.description}</span>
                    )}
                    {plugin.status === 'failed' && plugin.error && (
                      <span className={`${tabStyles['skills-list-desc']} ${styles.errorText}`}>
                        {plugin.error}
                      </span>
                    )}
                    {restricted && (
                      <span className={`${tabStyles['skills-list-desc']} ${styles.errorText}`}>
                        {t('settings.plugins.needsFullAccess')}
                      </span>
                    )}
                  </div>

                  <div className={tabStyles['skills-list-actions']}>
                    {configurable && (
                      <button
                        type="button"
                        className={tabStyles['skill-card-delete']}
                        title={t('settings.plugins.configure', { name: plugin.name })}
                        onClick={() => loadPluginConfig(plugin)}
                      >
                        <PhosphorIcon icon={Gear} size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={tabStyles['skill-card-delete']}
                      title={t('settings.plugins.deleteConfirm', { name: plugin.name })}
                      onClick={() => deletePlugin(plugin)}
                    >
                      <PhosphorIcon icon={X} size={14} />
                    </button>
                    <Toggle
                      on={enabled}
                      onChange={(on) => togglePlugin(plugin.id, on)}
                      disabled={restricted}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 插件目录路径提示 */}
        {pluginUserDir && (
          <p className={styles.pluginsDir}>
            {t('settings.plugins.pluginsDir', { path: pluginUserDir })}
          </p>
        )}
        </SettingsSection>

      {diagnostics && (
        <SettingsSection
          title={t('settings.plugins.diagnosticsTitle')}
          context={
            <span className={styles.contribBadge}>
              {t('settings.plugins.diagnosticsSummary', {
                capabilities: String(diagnostics.eventBus.filter(item => item.available).length),
                total: String(diagnostics.eventBus.length),
                tasks: String(diagnostics.tasks.length),
                schedules: String(diagnostics.schedules.length),
              })}
            </span>
          }
        >
          {diagnostics.plugins.length === 0 ? (
            <div className={styles.empty}>
              <span>{t('settings.plugins.noDiagnostics')}</span>
            </div>
          ) : (
            <div className={tabStyles['skills-list-block']}>
              {diagnostics.plugins.map(plugin => {
                const routeText = t('settings.plugins.diagnosticRoutes', {
                  pages: String(count(plugin.routes?.pages)),
                  widgets: String(count(plugin.routes?.widgets)),
                  settingsTabs: String(count(plugin.routes?.settingsTabs)),
                });
                const capabilityText = [
                  t('settings.plugins.diagnosticTools', { count: String(count(plugin.tools)) }),
                  t('settings.plugins.diagnosticCommands', { count: String(count(plugin.commands)) }),
                  t('settings.plugins.diagnosticConfig', { count: String(count(plugin.config?.keys)) }),
                ].join(' · ');
                const activationText = plugin.activationState
                  ? t('settings.plugins.diagnosticActivation', { state: plugin.activationState })
                  : t('settings.plugins.diagnosticActivation', { state: '-' });
                return (
                  <div key={plugin.id} className={tabStyles['skills-list-item']}>
                    <div className={tabStyles['skills-list-info']}>
                      <div className={styles.pluginHead}>
                        <span className={tabStyles['skills-list-name']}>{plugin.name || plugin.id}</span>
                        <span className={tabStyles['skills-list-name-hint']}>{plugin.id}</span>
                        {plugin.status && <span className={styles.contribBadge}>{plugin.status}</span>}
                        {plugin.activationState && <span className={styles.contribBadge}>{plugin.activationState}</span>}
                      </div>
                      <span className={tabStyles['skills-list-desc']}>{activationText} · {routeText}</span>
                      <span className={tabStyles['skills-list-desc']}>{capabilityText}</span>
                      {(plugin.error || plugin.activationError) && (
                        <span className={`${tabStyles['skills-list-desc']} ${styles.errorText}`}>
                          {plugin.error || plugin.activationError}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SettingsSection>
      )}

      {configPlugin && pluginConfig && (
        <SettingsSection
          title={t('settings.plugins.configTitle', { name: configPlugin.name })}
          context={
            <button
              type="button"
              className={tabStyles['settings-btn-primary']}
              disabled={configSaving || dirtyConfigKeys.size === 0}
              onClick={savePluginConfig}
            >
              {t('settings.save')}
            </button>
          }
        >
          {Object.entries(pluginConfig.schema.properties || {}).filter(([, property]) => (property.scope || 'global') === 'global').map(([key, property]) => {
            const label = property.title || key;
            const hint = property.description || (property.sensitive ? t('settings.plugins.sensitiveHint') : undefined);
            const value = configDraft[key];
            const control = property.type === 'boolean' ? (
              <Toggle
                on={value === true}
                onChange={(on) => updateConfigDraft(key, on)}
              />
            ) : property.enum ? (
              <select
                className={tabStyles['settings-input']}
                value={formatConfigValue(property, value)}
                onChange={(e) => updateConfigDraft(key, parseConfigValue(property, e.target.value))}
              >
                {property.enum.map((item) => (
                  <option key={String(item)} value={String(item)}>{String(item)}</option>
                ))}
              </select>
            ) : property.type === 'object' || property.type === 'array' ? (
              <textarea
                className={tabStyles['settings-input']}
                rows={4}
                value={formatConfigValue(property, value)}
                onChange={(e) => updateConfigDraft(key, e.target.value)}
                onBlur={(e) => {
                  try { updateConfigDraft(key, parseConfigValue(property, e.target.value)); }
                  catch { showToast(t('settings.plugins.invalidJson'), 'error'); }
                }}
              />
            ) : (
              <input
                className={tabStyles['settings-input']}
                type={property.sensitive ? 'password' : property.type === 'number' || property.type === 'integer' ? 'number' : 'text'}
                value={formatConfigValue(property, value)}
                onChange={(e) => updateConfigDraft(key, parseConfigValue(property, e.target.value))}
              />
            );
            return (
              <SettingsRow
                key={key}
                label={label}
                hint={hint}
                control={control}
                layout={property.type === 'object' || property.type === 'array' ? 'stacked' : 'inline'}
              />
            );
          })}
        </SettingsSection>
      )}

        <SettingsSection title={t('settings.plugins.permissionsSection')}>
          <SettingsSection.Note>{t('settings.plugins.permissionsSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.plugins.fullAccessToggle')}
            hint={t('settings.plugins.fullAccessDesc')}
            control={
              <Toggle
                on={pluginAllowFullAccess}
                onChange={(on) => { if (on !== pluginAllowFullAccess) void toggleFullAccess(); }}
              />
            }
          />
          <SettingsRow
            label={t('settings.plugins.devToolsToggle')}
            hint={t('settings.plugins.devToolsDesc')}
            control={
              <Toggle
                on={pluginDevToolsEnabled}
                onChange={(on) => { if (on !== pluginDevToolsEnabled) void togglePluginDevTools(); }}
              />
            }
          />
        </SettingsSection>
      </div>
    </div>
  );
}
