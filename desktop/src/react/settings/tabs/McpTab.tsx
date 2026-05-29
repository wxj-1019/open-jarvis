import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../store';
import { t } from '../helpers';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { Toggle } from '../widgets/Toggle';
import { AgentConnectorControls } from './mcp/AgentConnectorControls';
import { ConnectorForm } from './mcp/ConnectorForm';
import { ConnectorList } from './mcp/ConnectorList';
import { RegistryBrowser } from './mcp/RegistryBrowser';
import { connectorsFromMcpJson } from './mcp/mcp-config';
import {
  EMPTY_MCP_STATE,
  addMcpConnector,
  loadMcpState,
  logoutMcpOAuth,
  pollMcpOAuth,
  removeMcpConnector,
  runMcpConnectorAction,
  setAgentMcpConnector,
  setAgentMcpTool,
  setMcpEnabled,
  startMcpOAuth,
  updateMcpConnector,
} from './mcp/mcp-api';
import type { McpConnectorInput } from './mcp/types';
import tabStyles from '../Settings.module.css';
import styles from './McpTab.module.css';

const platform = window.platform;

export function McpTab() {
  const currentAgentId = useSettingsStore(s => s.currentAgentId);
  const showToast = useSettingsStore(s => s.showToast);
  const [viewAgentId, setViewAgentId] = useState<string | null>(currentAgentId);
  const viewAgentIdRef = useRef(viewAgentId);
  viewAgentIdRef.current = viewAgentId;

  const [state, setState] = useState(EMPTY_MCP_STATE);
  const [loadingState, setLoadingState] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [subTab, setSubTab] = useState<'connectors' | 'registry'>('connectors');

  useEffect(() => {
    if (!viewAgentId && currentAgentId) setViewAgentId(currentAgentId);
  }, [currentAgentId, viewAgentId]);

  const loadState = useCallback(async () => {
    const agentId = viewAgentIdRef.current;
    if (!agentId) {
      setLoadingState(false);
      return;
    }
    const snapshotAgentId = agentId;
    setLoadingState(true);
    try {
      const data = await loadMcpState(agentId);
      if (viewAgentIdRef.current !== snapshotAgentId) return;
      setState(data);
    } catch (err) {
      console.error('[mcp] load failed:', err);
    } finally {
      if (viewAgentIdRef.current === snapshotAgentId) setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState, viewAgentId]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
      await loadState();
      showToast(t('settings.autoSaved'), 'success');
    } catch (err: unknown) {
      showToast(t('settings.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const toggleGlobal = (enabled: boolean) => run('global', () => setMcpEnabled(enabled));

  const addConnector = (input: McpConnectorInput) => run('add', () => addMcpConnector(input));
  const updateConnector = (connectorId: string, input: McpConnectorInput) =>
    run(`update-${connectorId}`, async () => {
      await updateMcpConnector(connectorId, input);
      setEditingConnectorId(null);
    });

  const importConnectors = () => run('import-json', async () => {
    const connectors = connectorsFromMcpJson(importJson);
    for (const connector of connectors) {
      await addMcpConnector(connector);
    }
    setImportJson('');
    setImportOpen(false);
  });

  const connectorAction = (connectorId: string, action: 'start' | 'stop' | 'refresh-tools') =>
    run(`${action}-${connectorId}`, () => runMcpConnectorAction(connectorId, action));

  const removeConnector = (connectorId: string) => {
    if (!confirm(t('settings.mcp.removeConfirm'))) return;
    run(`remove-${connectorId}`, () => removeMcpConnector(connectorId));
  };

  const setAgentConnector = (connectorId: string, enabled: boolean) => run(`agent-connector-${connectorId}`, async () => {
    const agentId = viewAgentIdRef.current;
    if (!agentId) throw new Error('agentId is required');
    await setAgentMcpConnector(agentId, connectorId, enabled);
  });

  const setAgentTool = (connectorId: string, toolName: string, enabled: boolean) => run(`tool-${connectorId}-${toolName}`, async () => {
    const agentId = viewAgentIdRef.current;
    if (!agentId) throw new Error('agentId is required');
    await setAgentMcpTool(agentId, connectorId, toolName, enabled);
  });

  const connectOAuth = (connectorId: string) => run(`oauth-${connectorId}`, async () => {
    const { sessionId, url } = await startMcpOAuth(connectorId);
    platform?.openExternal?.(url);
    await waitForOAuth(sessionId);
  });

  const disconnectOAuth = (connectorId: string) =>
    run(`oauth-logout-${connectorId}`, () => logoutMcpOAuth(connectorId));

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="mcp">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.mcp.pageDesc')}</p>

        <SettingsSection title={t('settings.mcp.masterTitle')}>
          <SettingsSection.Note>{t('settings.mcp.masterSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.mcp.masterName')}
            hint={t('settings.mcp.masterDesc')}
            control={
              <Toggle
                on={loadingState ? undefined : state.enabled}
                onChange={toggleGlobal}
                disabled={busyKey === 'global'}
                label={loadingState ? t('status.loading') : state.enabled ? t('common.on') : t('common.off')}
              />
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.mcp.connectorsTitle')} variant="flush">
          <SettingsSection.Note>{t('settings.mcp.connectorsSectionNote')}</SettingsSection.Note>

          <div className={styles.subTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'connectors'}
              className={`${styles.subTab}${subTab === 'connectors' ? ` ${styles.subTabActive}` : ''}`}
              onClick={() => setSubTab('connectors')}
            >
              {t('settings.mcp.myConnectors')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'registry'}
              className={`${styles.subTab}${subTab === 'registry' ? ` ${styles.subTabActive}` : ''}`}
              onClick={() => setSubTab('registry')}
            >
              {t('settings.mcp.browseRegistry')}
            </button>
          </div>

          {subTab === 'registry' ? (
            <RegistryBrowser onInstalled={() => { setSubTab('connectors'); loadState(); }} />
          ) : (
            <>
              <div className={styles.importToolbar}>
                <button
                  type="button"
                  className={tabStyles['settings-btn-secondary']}
                  disabled={busyKey === 'import-json'}
                  onClick={() => setImportOpen(!importOpen)}
                >
                  {t('settings.mcp.importJson')}
                </button>
              </div>
              {importOpen && (
                <div className={`${tabStyles['pv-add-form']} ${styles.importPanel}`}>
                  <div className={tabStyles['settings-form-field']}>
                    <label className={tabStyles['settings-form-label']}>{t('settings.mcp.importJson')}</label>
                    <textarea
                      className={tabStyles['settings-textarea']}
                      value={importJson}
                      onChange={(e) => setImportJson(e.target.value)}
                      placeholder={'{"mcpServers":{"example":{"command":"npx","args":["-y","mcp-server-example"]}}}'}
                    />
                    <span className={tabStyles['settings-form-hint']}>{t('settings.mcp.importJsonHint')}</span>
                  </div>
                  <div className={tabStyles['pv-add-form-actions']}>
                    <button
                      type="button"
                      className={tabStyles['pv-add-form-btn']}
                      onClick={() => setImportOpen(false)}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className={`${tabStyles['pv-add-form-btn']} ${tabStyles['primary']}`}
                      disabled={!importJson.trim() || busyKey === 'import-json'}
                      onClick={importConnectors}
                    >
                      {t('settings.mcp.importJson')}
                    </button>
                  </div>
                </div>
              )}
              <ConnectorForm
                disabled={busyKey === 'add' || (editingConnectorId ? busyKey === `update-${editingConnectorId}` : false)}
                editingConnector={state.connectors.find(connector => connector.id === editingConnectorId) || null}
                onAdd={addConnector}
                onUpdate={updateConnector}
                onCancelEdit={() => setEditingConnectorId(null)}
              />
              <ConnectorList
                connectors={state.connectors}
                globalEnabled={state.enabled}
                busyKey={busyKey}
                onAction={connectorAction}
                onEdit={setEditingConnectorId}
                onRemove={removeConnector}
                onOAuthStart={connectOAuth}
                onOAuthLogout={disconnectOAuth}
              />
            </>
          )}
        </SettingsSection>

        <AgentConnectorControls
          connectors={state.connectors}
          globalEnabled={state.enabled}
          loading={loadingState}
          viewAgentId={viewAgentId}
          busyKey={busyKey}
          agentConfig={state.agentConfig}
          onAgentChange={setViewAgentId}
          onConnectorToggle={setAgentConnector}
          onToolToggle={setAgentTool}
        />
      </div>
    </div>
  );
}

async function waitForOAuth(sessionId: string): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const status = await pollMcpOAuth(sessionId);
    if (status.status === 'done') return;
    if (status.status === 'error') throw new Error(status.error || 'OAuth failed');
  }
  throw new Error('OAuth login timed out');
}
