import React, { useState } from 'react';
import { t } from '../../helpers';
import styles from '../../Settings.module.css';
import type { McpConnector, McpResource, McpPrompt } from './types';

interface ConnectorListProps {
  connectors: McpConnector[];
  globalEnabled: boolean;
  busyKey: string | null;
  onAction: (connectorId: string, action: 'start' | 'stop' | 'refresh-tools') => void;
  onEdit: (connectorId: string) => void;
  onRemove: (connectorId: string) => void;
  onOAuthStart: (connectorId: string) => void;
  onOAuthLogout: (connectorId: string) => void;
}

export function ConnectorList({
  connectors,
  globalEnabled,
  busyKey,
  onAction,
  onEdit,
  onRemove,
  onOAuthStart,
  onOAuthLogout,
}: ConnectorListProps) {
  if (connectors.length === 0) {
    return <p className={styles['settings-muted-note']}>{t('settings.mcp.noConnectors')}</p>;
  }

  return (
    <div className={styles['skills-list-block']}>
      {connectors.map(connector => (
        <ConnectorItem
          key={connector.id}
          connector={connector}
          globalEnabled={globalEnabled}
          busyKey={busyKey}
          onAction={onAction}
          onEdit={onEdit}
          onRemove={onRemove}
          onOAuthStart={onOAuthStart}
          onOAuthLogout={onOAuthLogout}
        />
      ))}
    </div>
  );
}

function ConnectorItem({
  connector,
  globalEnabled,
  busyKey,
  onAction,
  onEdit,
  onRemove,
  onOAuthStart,
  onOAuthLogout,
}: {
  connector: McpConnector;
  globalEnabled: boolean;
  busyKey: string | null;
  onAction: (connectorId: string, action: 'start' | 'stop' | 'refresh-tools') => void;
  onEdit: (connectorId: string) => void;
  onRemove: (connectorId: string) => void;
  onOAuthStart: (connectorId: string) => void;
  onOAuthLogout: (connectorId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`${styles['skills-list-item']} ${styles['mcp-list-item']}`}>
      <div className={styles['skills-list-info']}>
        <div className={styles['skills-list-name']}>
          {connector.name}
          {connector.serverInfo?.name && connector.serverInfo.name !== connector.name && (
            <span className={styles['skills-list-name-hint']}> ({connector.serverInfo.name} v{connector.serverInfo.version || '?'})</span>
          )}
          <span className={styles['skills-list-name-hint']}>{statusLabel(connector)}</span>
        </div>
        <div className={styles['skills-list-desc']}>{connectorTarget(connector)}</div>
        <div className={styles['settings-muted-note']}>
          {transportLabel(connector.transport)}
          {' · '}
          {authLabel(connector)}
          {connector.autoStart && (
            <>
              {' · '}
              {t('settings.mcp.autoStart')}
            </>
          )}
          {recordCount(connector.env) > 0 && (
            <>
              {' · '}
              {recordCount(connector.env)} {t('settings.mcp.envCount')}
            </>
          )}
          {recordCount(connector.headers) > 0 && (
            <>
              {' · '}
              {recordCount(connector.headers)} {t('settings.mcp.headersCount')}
            </>
          )}
          {' · '}
          {connector.toolCount ?? connector.tools.length} tools
          {(connector.resourceCount ?? 0) > 0 && (
            <> · {connector.resourceCount} resources</>
          )}
          {(connector.promptCount ?? 0) > 0 && (
            <> · {connector.promptCount} prompts</>
          )}
        </div>

        {/* Server capabilities badges */}
        {connector.status === 'running' && connector.serverCapabilities && (
          <div className={styles['settings-muted-note']} style={{ marginTop: 4 }}>
            {Object.keys(connector.serverCapabilities).map(cap => (
              <span key={cap} style={{
                display: 'inline-block',
                padding: '1px 6px',
                marginRight: 4,
                borderRadius: 3,
                fontSize: '0.75em',
                background: 'var(--bg-secondary, #f0f0f0)',
                color: 'var(--text-secondary, #666)',
              }}>
                {cap}
              </span>
            ))}
          </div>
        )}

        {/* Expandable details: tools, resources, prompts */}
        {connector.status === 'running' && (connector.tools.length > 0 || (connector.resources?.length ?? 0) > 0 || (connector.prompts?.length ?? 0) > 0) && (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-link, #0066cc)',
                cursor: 'pointer',
                padding: 0,
                fontSize: '0.8em',
              }}
            >
              {expanded ? '▾' : '▸'} {expanded ? t('common.hide') : t('common.show')} details
            </button>
            {expanded && (
              <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: '2px solid var(--border-color, #e0e0e0)' }}>
                {connector.tools.length > 0 && (
                  <DetailsSection title={`Tools (${connector.tools.length})`} items={connector.tools.map(t => ({
                    name: t.name,
                    desc: t.description || t.title || '',
                  }))} />
                )}
                {(connector.resources?.length ?? 0) > 0 && (
                  <DetailsSection title={`Resources (${connector.resources!.length})`} items={connector.resources!.map(r => ({
                    name: r.name || r.uri,
                    desc: r.description || r.mimeType || '',
                  }))} />
                )}
                {(connector.prompts?.length ?? 0) > 0 && (
                  <DetailsSection title={`Prompts (${connector.prompts!.length})`} items={connector.prompts!.map(p => ({
                    name: p.name,
                    desc: p.description || '',
                    args: p.arguments?.map(a => `${a.name}${a.required ? '*' : ''}`).join(', '),
                  }))} />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`${styles['skills-list-actions']} ${styles['mcp-list-actions']}`}>
        {connector.authType === 'oauth' && connector.authStatus !== 'connected' && (
          <button
            className={styles['pv-add-form-btn']}
            type="button"
            disabled={busyKey === `oauth-${connector.id}`}
            onClick={() => onOAuthStart(connector.id)}
          >
            {t('settings.mcp.oauthConnect')}
          </button>
        )}
        {connector.authType === 'oauth' && connector.authStatus === 'connected' && (
          <button
            className={styles['pv-add-form-btn']}
            type="button"
            disabled={busyKey === `oauth-logout-${connector.id}`}
            onClick={() => onOAuthLogout(connector.id)}
          >
            {t('settings.oauth.logout')}
          </button>
        )}
        <button
          className={styles['pv-add-form-btn']}
          type="button"
          disabled={!globalEnabled || busyKey === `start-${connector.id}` || connector.status === 'running'}
          onClick={() => onAction(connector.id, 'start')}
        >
          {t('settings.mcp.start')}
        </button>
        <button
          className={styles['pv-add-form-btn']}
          type="button"
          disabled={busyKey === `stop-${connector.id}` || connector.status !== 'running'}
          onClick={() => onAction(connector.id, 'stop')}
        >
          {t('settings.mcp.stop')}
        </button>
        <button
          className={styles['pv-add-form-btn']}
          type="button"
          disabled={busyKey === `refresh-tools-${connector.id}` || connector.status !== 'running'}
          onClick={() => onAction(connector.id, 'refresh-tools')}
        >
          {t('settings.mcp.refresh')}
        </button>
        <button
          className={styles['pv-add-form-btn']}
          type="button"
          disabled={busyKey === `remove-${connector.id}`}
          onClick={() => onEdit(connector.id)}
        >
          {t('common.edit')}
        </button>
        <button
          className={styles['pv-add-form-btn']}
          type="button"
          disabled={busyKey === `remove-${connector.id}`}
          onClick={() => onRemove(connector.id)}
        >
          {t('common.remove')}
        </button>
      </div>
    </div>
  );
}

function DetailsSection({ title, items }: { title: string; items: { name: string; desc: string; args?: string }[] }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 600, fontSize: '0.8em', marginBottom: 4 }}>{title}</div>
      <div style={{ maxHeight: 150, overflowY: 'auto' }}>
        {items.map((item, i) => (
          <div key={i} style={{ fontSize: '0.78em', padding: '2px 0', lineHeight: 1.4 }}>
            <code style={{ background: 'var(--bg-code, #f5f5f5)', padding: '1px 4px', borderRadius: 2 }}>
              {item.name}
            </code>
            {item.args && <span style={{ color: 'var(--text-secondary, #888)', marginLeft: 4 }}>({item.args})</span>}
            {item.desc && <span style={{ color: 'var(--text-secondary, #888)', marginLeft: 4 }}>— {item.desc}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function connectorTarget(connector: McpConnector): string {
  if (connector.transport === 'stdio') {
    return [connector.command, ...(connector.args || [])].filter(Boolean).join(' ');
  }
  return connector.url || connector.id;
}

function statusLabel(connector: McpConnector): string {
  return connector.status === 'running' ? t('settings.mcp.statusRunning') : t('settings.mcp.statusStopped');
}

function transportLabel(transport: string): string {
  if (transport === 'stdio') return t('settings.mcp.modeLocal');
  if (transport === 'streamable-http') return t('settings.mcp.transportStreamable');
  if (transport === 'sse') return t('settings.mcp.transportSse');
  return t('settings.mcp.transportAuto');
}

function authLabel(connector: McpConnector): string {
  if (connector.authType === 'bearer') return t('settings.mcp.authBearer');
  if (connector.authType === 'oauth') {
    return connector.authStatus === 'connected'
      ? t('settings.mcp.oauthConnected')
      : t('settings.mcp.oauthDisconnected');
  }
  return t('settings.mcp.authNone');
}

function recordCount(record?: Record<string, string>): number {
  return record ? Object.keys(record).length : 0;
}
