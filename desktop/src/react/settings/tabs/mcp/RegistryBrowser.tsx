import React, { useCallback, useEffect, useState } from 'react';
import { t } from '../../helpers';
import styles from '../../Settings.module.css';
import { searchRegistry, addMcpConnector, type RegistryServer } from './mcp-api';
import type { McpConnectorInput } from './types';

interface RegistryBrowserProps {
  onInstalled: () => void;
}

export function RegistryBrowser({ onInstalled }: RegistryBrowserProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegistryServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [envValues, setEnvValues] = useState<Record<string, Record<string, string>>>({});

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const servers = await searchRegistry(q);
      setResults(servers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all on mount
  useEffect(() => {
    doSearch('');
  }, [doSearch]);

  const handleSearch = () => {
    doSearch(query);
  };

  const handleInstall = async (server: RegistryServer) => {
    setInstalling(server.id);
    setError('');
    try {
      const env: Record<string, string> = {};
      for (const hint of server.envHints || []) {
        const val = envValues[server.id]?.[hint] || '';
        if (val) env[hint] = val;
      }

      const input: McpConnectorInput = {
        name: server.name,
        transport: 'stdio' as const,
        command: server.command,
        args: server.args,
        description: server.description,
        env: Object.keys(env).length > 0 ? env : undefined,
        autoStart: true,
      };
      await addMcpConnector(input);
      onInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(null);
    }
  };

  const setEnvValue = (serverId: string, key: string, value: string) => {
    setEnvValues(prev => ({
      ...prev,
      [serverId]: { ...(prev[serverId] || {}), [key]: value },
    }));
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className={styles['settings-input']}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={t('settings.mcp.registrySearchPlaceholder') || 'Search MCP servers...'}
          style={{ flex: 1 }}
        />
        <button
          className={`${styles['pv-add-form-btn']} ${styles['primary']}`}
          type="button"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? '...' : t('common.search') || 'Search'}
        </button>
      </div>

      {error && <p className={styles['settings-muted-note']} style={{ color: 'var(--color-error, #d32f2f)' }}>{error}</p>}

      {results.length === 0 && !loading && !error && (
        <p className={styles['settings-muted-note']}>{t('settings.mcp.registryEmpty') || 'No servers found.'}</p>
      )}

      <div className={styles['skills-list-block']}>
        {results.map(server => (
          <div key={server.id} className={styles['skills-list-item']}>
            <div className={styles['skills-list-info']}>
              <div className={styles['skills-list-name']}>
                {server.name}
                {server.source && (
                  <span className={styles['skills-list-name-hint']}> [{server.source}]</span>
                )}
                {server.category && (
                  <span style={{
                    display: 'inline-block',
                    padding: '1px 6px',
                    marginLeft: 6,
                    borderRadius: 3,
                    fontSize: '0.7em',
                    background: 'var(--bg-secondary, #f0f0f0)',
                    color: 'var(--text-secondary, #666)',
                  }}>
                    {server.category}
                  </span>
                )}
              </div>
              <div className={styles['skills-list-desc']}>{server.description}</div>
              <div className={styles['settings-muted-note']}>
                <code style={{ fontSize: '0.8em' }}>{server.command} {(server.args || []).join(' ')}</code>
              </div>
              {/* Env hints */}
              {(server.envHints || []).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div className={styles['settings-muted-note']} style={{ marginBottom: 4 }}>
                    {t('settings.mcp.registryEnvHints') || 'Required environment variables:'}
                  </div>
                  {server.envHints.map(hint => (
                    <div key={hint} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <code style={{ fontSize: '0.78em', minWidth: 140 }}>{hint}</code>
                      <input
                        className={styles['settings-input']}
                        type="password"
                        value={envValues[server.id]?.[hint] || ''}
                        onChange={(e) => setEnvValue(server.id, hint, e.target.value)}
                        placeholder={hint}
                        style={{ fontSize: '0.8em', padding: '2px 6px' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles['skills-list-actions']}>
              <button
                className={`${styles['pv-add-form-btn']} ${styles['primary']}`}
                type="button"
                disabled={installing === server.id}
                onClick={() => handleInstall(server)}
              >
                {installing === server.id
                  ? (t('settings.mcp.installing') || 'Installing...')
                  : (t('settings.mcp.install') || 'Install')
                }
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
