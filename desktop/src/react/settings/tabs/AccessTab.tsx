import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeviceMobile, Desktop, Devices, Globe, Key, LockKey } from '@phosphor-icons/react';
import { hanaFetch, hanaUrl } from '../api';
import { t } from '../helpers';
import { useSettingsStore } from '../store';
import {
  connectDeviceServerConnection,
  persistServerConnectionSelection,
  upsertServerConnection,
} from '../../services/server-connection';
import { Toggle } from '../widgets/Toggle';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import tabStyles from '../Settings.module.css';
import styles from './AccessTab.module.css';

type AccessMode = 'loopback' | 'lan';

interface AccessSummary {
  network: {
    mode: AccessMode;
    listenHost: string;
    configuredPort: number;
    actualPort: number;
    runtimeMode: AccessMode;
    runtimeHost: string;
    restartRequired: boolean;
    lanAddresses: string[];
    localServerUrl: string;
    candidateLanServerUrl: string | null;
    lanServerUrl: string | null;
    localMobileUrl: string;
    candidateLanMobileUrl: string | null;
    lanMobileUrl: string | null;
  };
  account: {
    userId: string;
    username: string;
    displayName: string;
    passwordSet: boolean;
  };
  devices: Array<{
    deviceId: string;
    displayName: string;
    deviceKind?: string;
    status: string;
    trustState?: string;
    lastSeenAt?: string | null;
  }>;
  credentials: Array<{
    credentialId: string;
    deviceId: string;
    status: string;
    scopes: string[];
    secretPrefix?: string;
    createdAt?: string | null;
    lastUsedAt?: string | null;
  }>;
}

const DEFAULT_SCOPES = ['chat', 'resources.read', 'files.read', 'files.write'];

export function AccessTab() {
  const showToast = useSettingsStore(s => s.showToast);
  const [summary, setSummary] = useState<AccessSummary | null>(null);
  const [mode, setMode] = useState<AccessMode>('loopback');
  const [port, setPort] = useState('14500');
  const [mobileKey, setMobileKey] = useState('');
  const [desktopKey, setDesktopKey] = useState('');
  const [generatingMobileKey, setGeneratingMobileKey] = useState(false);
  const [generatingDesktopKey, setGeneratingDesktopKey] = useState(false);
  const [remoteServerUrl, setRemoteServerUrl] = useState('');
  const [remoteServerKey, setRemoteServerKey] = useState('');
  const [connectingRemoteServer, setConnectingRemoteServer] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ username: '', displayName: '' });
  const [passwordDraft, setPasswordDraft] = useState('');

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await hanaFetch('/api/access/summary');
      const data = await res.json();
      setSummary(data);
      setMode(data.network.mode);
      setPort(String(data.network.configuredPort));
      setAccountDraft({
        username: data.account.username || '',
        displayName: data.account.displayName || '',
      });
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    loadSummary().catch((err) => {
      showToast(`${t('settings.access.loadFailed')}: ${err.message}`, 'error');
    });
  }, [loadSummary, showToast]);

  const mobileUrl = useMemo(() => {
    if (!summary) return '';
    if (mode !== 'lan') return '';
    return summary.network.lanMobileUrl || '';
  }, [mode, summary]);

  const desktopUrl = useMemo(() => {
    if (!summary) return '';
    if (mode !== 'lan') return '';
    return summary.network.lanServerUrl || '';
  }, [mode, summary]);

  const qrUrl = useMemo(() => {
    if (mode !== 'lan' || !mobileUrl || summary?.network.restartRequired) return '';
    const query = summary?.network.actualPort
      ? `?port=${encodeURIComponent(String(summary.network.actualPort))}`
      : '';
    return hanaUrl(`/api/access/mobile-qr.svg${query}`);
  }, [mode, mobileUrl, summary?.network.actualPort, summary?.network.restartRequired]);

  const canCopyMobileUrl = mobileUrl.length > 0;
  const canCopyDesktopUrl = desktopUrl.length > 0;
  const canShowQr = mode === 'lan' && mobileUrl.length > 0 && !summary?.network.restartRequired;
  const runtimeEndpoint = summary ? `${summary.network.runtimeHost}:${summary.network.actualPort}` : '';
  const effectiveMobileUrl = summary?.network.lanMobileUrl || summary?.network.localMobileUrl || '';
  const effectiveDesktopUrl = summary?.network.lanServerUrl || summary?.network.localServerUrl || '';
  const lanAddressText = summary?.network.lanAddresses.length
    ? summary.network.lanAddresses.join(', ')
    : t('settings.access.noLanAddresses');
  const activeDevices = (summary?.devices || []).filter(device => device.status === 'active');
  const activeCredentials = (summary?.credentials || []).filter(credential => credential.status === 'active');
  const activeCredentialDeviceIds = new Set(activeCredentials.map(credential => credential.deviceId));
  const activeDevicesWithoutCredentials = activeDevices.filter(device => !activeCredentialDeviceIds.has(device.deviceId));
  const deviceById = useMemo(() => new Map(activeDevices.map(device => [device.deviceId, device])), [activeDevices]);

  const copyText = useCallback(async (value: string) => {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    showToast(t('settings.access.copied'), 'success');
  }, [showToast]);

  const saveNetworkSettings = useCallback(async (nextMode: AccessMode, nextPort: string) => {
    const listenPort = Number(nextPort);
    if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535) {
      showToast(t('settings.access.invalidPort'), 'error');
      return;
    }
    setSavingNetwork(true);
    try {
      const res = await hanaFetch('/api/access/network', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode, listenPort }),
      });
      const data = await res.json();
      setSummary(prev => prev ? { ...prev, network: data.network } : prev);
      setMode(data.network.mode);
      setPort(String(data.network.configuredPort));
      showToast(t('settings.access.saved'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.saveFailed')}: ${err.message}`, 'error');
      setMode(summary?.network.mode || nextMode);
    } finally {
      setSavingNetwork(false);
    }
  }, [showToast, summary?.network.mode]);

  const saveNetwork = useCallback(async () => {
    await saveNetworkSettings(mode, port);
  }, [mode, port, saveNetworkSettings]);

  const handleLanToggle = useCallback((on: boolean) => {
    if (!summary || loadingSummary || savingNetwork) return;
    const nextMode = on ? 'lan' : 'loopback';
    setMode(nextMode);
    void saveNetworkSettings(nextMode, port);
  }, [loadingSummary, port, saveNetworkSettings, savingNetwork, summary]);

  const generateMobileKey = useCallback(async () => {
    setGeneratingMobileKey(true);
    try {
      const res = await hanaFetch('/api/access/mobile-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Mobile PWA',
          scopes: DEFAULT_SCOPES,
        }),
      });
      const data = await res.json();
      setMobileKey(data.secret || '');
      await loadSummary();
      showToast(t('settings.access.mobileKeyCreated'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.access.mobileKeyFailed')}: ${err.message}`, 'error');
    } finally {
      setGeneratingMobileKey(false);
    }
  }, [loadSummary, showToast]);

  const generateDesktopKey = useCallback(async () => {
    setGeneratingDesktopKey(true);
    try {
      const res = await hanaFetch('/api/access/desktop-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Desktop Frontend',
          scopes: DEFAULT_SCOPES,
        }),
      });
      const data = await res.json();
      setDesktopKey(data.secret || '');
      await loadSummary();
      showToast(t('settings.access.desktopKeyCreated'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.access.desktopKeyFailed')}: ${err.message}`, 'error');
    } finally {
      setGeneratingDesktopKey(false);
    }
  }, [loadSummary, showToast]);

  const connectRemoteServer = useCallback(async () => {
    setConnectingRemoteServer(true);
    try {
      const connection = await connectDeviceServerConnection({
        baseUrl: remoteServerUrl,
        credential: remoteServerKey,
      });
      persistServerConnectionSelection(connection);
      const current = useSettingsStore.getState();
      current.set({
        serverConnections: upsertServerConnection(current.serverConnections, connection),
        activeServerConnectionId: connection.connectionId,
        activeServerConnection: connection,
      });
      setRemoteServerKey('');
      showToast(t('settings.access.remoteServerConnected'), 'success');
      window.hana?.reloadMainWindow?.();
    } catch (err: any) {
      showToast(`${t('settings.access.remoteServerFailed')}: ${err.message}`, 'error');
    } finally {
      setConnectingRemoteServer(false);
    }
  }, [remoteServerKey, remoteServerUrl, showToast]);

  const saveAccount = useCallback(async () => {
    try {
      const res = await hanaFetch('/api/access/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountDraft),
      });
      const data = await res.json();
      setSummary(prev => prev ? { ...prev, account: data.account } : prev);
      showToast(t('settings.access.accountSaved'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.saveFailed')}: ${err.message}`, 'error');
    }
  }, [accountDraft, showToast]);

  const savePassword = useCallback(async () => {
    try {
      const res = await hanaFetch('/api/access/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordDraft }),
      });
      const data = await res.json();
      setSummary(prev => prev ? { ...prev, account: data.account } : prev);
      setPasswordDraft('');
      showToast(t('settings.access.passwordSaved'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.saveFailed')}: ${err.message}`, 'error');
    }
  }, [passwordDraft, showToast]);

  const clearPassword = useCallback(async () => {
    try {
      const res = await hanaFetch('/api/access/account/password', { method: 'DELETE' });
      const data = await res.json();
      setSummary(prev => prev ? { ...prev, account: data.account } : prev);
      setPasswordDraft('');
      showToast(t('settings.access.passwordCleared'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.saveFailed')}: ${err.message}`, 'error');
    }
  }, [showToast]);

  const revokeDevice = useCallback(async (deviceId: string) => {
    try {
      await hanaFetch(`/api/devices/${encodeURIComponent(deviceId)}/revoke`, { method: 'POST' });
      await loadSummary();
      showToast(t('settings.access.deviceRevoked'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.access.deviceRevokeFailed')}: ${err.message}`, 'error');
    }
  }, [loadSummary, showToast]);

  const revokeCredential = useCallback(async (credentialId: string) => {
    try {
      await hanaFetch(`/api/devices/credentials/${encodeURIComponent(credentialId)}/revoke`, { method: 'POST' });
      await loadSummary();
      showToast(t('settings.access.credentialRevoked'), 'success');
    } catch (err: any) {
      showToast(`${t('settings.access.credentialRevokeFailed')}: ${err.message}`, 'error');
    }
  }, [loadSummary, showToast]);

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="access">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.access.pageDesc')}</p>

        {loadingSummary && (
          <div className={styles.loading}>{t('settings.access.loading')}</div>
        )}

        <SettingsSection title={t('settings.access.networkAccess')}>
          <SettingsSection.Note>{t('settings.access.networkSectionNote')}</SettingsSection.Note>
          <SettingsRow
          label={t('settings.access.lanToggle')}
          hint={t('settings.access.lanHint')}
          control={
            <Toggle
              label={t('settings.access.lanToggle')}
              on={summary ? mode === 'lan' : undefined}
              onChange={handleLanToggle}
              disabled={loadingSummary || savingNetwork}
            />
          }
        />
        <SettingsRow
          label={t('settings.access.port')}
          hint={t('settings.access.portHint')}
          control={
            <input
              className={`${tabStyles['settings-input']} ${tabStyles['settings-port-input']}`}
              value={port}
              inputMode="numeric"
              onChange={(event) => setPort(event.target.value)}
            />
          }
        />
        <SettingsRow
          label={t('settings.access.status')}
          hint={summary?.network.restartRequired ? t('settings.access.restartRequired') : t('settings.access.statusHint')}
          layout="stacked"
          control={
            <div className={styles.statusGrid}>
              <div className={styles.statusCard}>
                <span>{t('settings.access.runtimeEndpoint')}</span>
                <strong>{runtimeEndpoint || '—'}</strong>
              </div>
              <div className={styles.statusCard}>
                <span>{t('settings.access.effectiveMobileUrl')}</span>
                <strong>{effectiveMobileUrl || '—'}</strong>
              </div>
              <div className={styles.statusCard}>
                <span>{t('settings.access.effectiveDesktopUrl')}</span>
                <strong>{effectiveDesktopUrl || '—'}</strong>
              </div>
              <div className={styles.statusCard}>
                <span>{t('settings.access.lanAddresses')}</span>
                <strong>{lanAddressText}</strong>
              </div>
            </div>
          }
        />
        {summary?.network.restartRequired && (
          <SettingsSection.Warning>{t('settings.access.restartRequired')}</SettingsSection.Warning>
        )}
        <SettingsSection.Footer>
          <button className={tabStyles['settings-btn-primary']} type="button" onClick={saveNetwork} disabled={loadingSummary || savingNetwork || !summary}>
            {t('settings.access.saveNetwork')}
          </button>
        </SettingsSection.Footer>
        </SettingsSection>

        <SettingsSection title={t('settings.access.mobileAccess')}>
          <SettingsSection.Note>{t('settings.access.mobileSectionNote')}</SettingsSection.Note>
          <SettingsRow
          label={t('settings.access.mobileUrl')}
          hint={mode === 'lan' ? t('settings.access.mobileUrlLanHint') : t('settings.access.mobileUrlLocalHint')}
          layout="stacked"
          control={
            <div className={styles.urlRow}>
              <input className={tabStyles['settings-input']} value={mobileUrl} readOnly />
              <button
                className={tabStyles['settings-btn-secondary']}
                type="button"
                onClick={() => copyText(mobileUrl)}
                disabled={!canCopyMobileUrl}
              >
                {t('settings.access.copy')}
              </button>
            </div>
          }
        />
        {canShowQr && (
          <SettingsRow
            label={t('settings.access.qrCode')}
            hint={t('settings.access.qrCodeHint')}
            control={<img className={styles.qr} src={qrUrl} alt={t('settings.access.qrCode')} />}
          />
        )}
        <SettingsRow
          label={t('settings.access.generateMobileKey')}
          hint={t('settings.access.mobileKeyHint')}
          control={
            <button className={tabStyles['settings-btn-secondary']} type="button" onClick={generateMobileKey} disabled={generatingMobileKey}>
              <PhosphorIcon icon={Key} size={14} />
              {t('settings.access.generateMobileKey')}
            </button>
          }
        />
        {mobileKey && (
          <SettingsRow
            label={t('settings.access.mobileKey')}
            hint={t('settings.access.mobileKeyOnce')}
            layout="stacked"
            control={
              <div className={styles.secretBox}>
                <input className={`${tabStyles['settings-input']} ${styles.secretInput}`} value={mobileKey} readOnly />
                <button className={tabStyles['settings-btn-primary']} type="button" onClick={() => copyText(mobileKey)}>
                  {t('settings.access.copy')}
                </button>
              </div>
            }
          />
        )}
        </SettingsSection>

        <SettingsSection title={t('settings.access.desktopAccess')}>
          <SettingsSection.Note>{t('settings.access.desktopSectionNote')}</SettingsSection.Note>
          <SettingsRow
          label={t('settings.access.desktopUrl')}
          hint={mode === 'lan' ? t('settings.access.desktopUrlLanHint') : t('settings.access.desktopUrlLocalHint')}
          layout="stacked"
          control={
            <div className={styles.urlRow}>
              <input className={tabStyles['settings-input']} value={desktopUrl} readOnly />
              <button
                className={tabStyles['settings-btn-secondary']}
                type="button"
                onClick={() => copyText(desktopUrl)}
                disabled={!canCopyDesktopUrl}
              >
                {t('settings.access.copy')}
              </button>
            </div>
          }
        />
        <SettingsRow
          label={t('settings.access.generateDesktopKey')}
          hint={t('settings.access.desktopKeyHint')}
          control={
            <button className={tabStyles['settings-btn-secondary']} type="button" onClick={generateDesktopKey} disabled={generatingDesktopKey}>
              <PhosphorIcon icon={Key} size={14} />
              {t('settings.access.generateDesktopKey')}
            </button>
          }
        />
        {desktopKey && (
          <SettingsRow
            label={t('settings.access.desktopKey')}
            hint={t('settings.access.desktopKeyOnce')}
            layout="stacked"
            control={
              <div className={styles.secretBox}>
                <input className={`${tabStyles['settings-input']} ${styles.secretInput}`} value={desktopKey} readOnly />
                <button className={tabStyles['settings-btn-primary']} type="button" onClick={() => copyText(desktopKey)}>
                  {t('settings.access.copy')}
                </button>
              </div>
            }
          />
        )}
        </SettingsSection>

        <SettingsSection title={t('settings.access.connectLanServer')}>
          <SettingsSection.Note>{t('settings.access.remoteSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.access.remoteServerUrl')}
            hint={t('settings.access.remoteServerUrlHint')}
            layout="stacked"
            control={
              <input
                aria-label={t('settings.access.remoteServerUrl')}
                className={`${tabStyles['settings-input']} ${styles.fieldInput}`}
                value={remoteServerUrl}
                placeholder="http://192.168.31.75:14500"
                onChange={(event) => setRemoteServerUrl(event.target.value)}
              />
            }
          />
          <SettingsRow
            label={t('settings.access.remoteServerKey')}
            hint={t('settings.access.remoteServerKeyHint')}
            layout="stacked"
            control={
              <input
                aria-label={t('settings.access.remoteServerKey')}
                className={`${tabStyles['settings-input']} ${styles.fieldInput}`}
                value={remoteServerKey}
                type="password"
                placeholder="hana_dev_..."
                onChange={(event) => setRemoteServerKey(event.target.value)}
              />
            }
          />
          <SettingsSection.Footer>
            <button
              className={tabStyles['settings-btn-primary']}
              type="button"
              onClick={connectRemoteServer}
              disabled={connectingRemoteServer || !remoteServerUrl.trim() || !remoteServerKey.trim()}
            >
              <PhosphorIcon icon={Globe} size={14} />
              {t('settings.access.connectLanServer')}
            </button>
          </SettingsSection.Footer>
        </SettingsSection>

        <SettingsSection title={t('settings.access.pairedDevices')}>
          <SettingsSection.Note>{t('settings.access.devicesSectionNote')}</SettingsSection.Note>
          <div className={styles.deviceList}>
            {activeDevicesWithoutCredentials.length === 0 && activeCredentials.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                  <PhosphorIcon icon={Devices} size={20} />
                </span>
                <span>{t('settings.access.noDevices')}</span>
              </div>
            ) : (
              <>
                {activeCredentials.map(credential => {
                  const device = deviceById.get(credential.deviceId);
                  const isMobile = device?.deviceKind === 'mobile';
                  return (
                    <div className={styles.deviceItem} key={credential.credentialId}>
                      <span className={styles.deviceIcon}>
                        <PhosphorIcon icon={isMobile ? DeviceMobile : Desktop} size={16} />
                      </span>
                      <div className={styles.deviceMain}>
                        <div className={styles.deviceName}>{device?.displayName || credential.deviceId}</div>
                        <div className={styles.deviceMeta}>
                          {device?.deviceKind || 'device'} · {credential.secretPrefix || credential.credentialId} · {credential.scopes.join(', ')}
                        </div>
                      </div>
                      <button
                        className={tabStyles['settings-btn-secondary']}
                        type="button"
                        onClick={() => revokeCredential(credential.credentialId)}
                      >
                        {t('settings.access.revokeCredential')}
                      </button>
                    </div>
                  );
                })}
                {activeDevicesWithoutCredentials.map(device => (
                  <div className={styles.deviceItem} key={device.deviceId}>
                    <span className={styles.deviceIcon}>
                      <PhosphorIcon icon={device.deviceKind === 'mobile' ? DeviceMobile : Desktop} size={16} />
                    </span>
                    <div className={styles.deviceMain}>
                      <div className={styles.deviceName}>{device.displayName}</div>
                      <div className={styles.deviceMeta}>{device.deviceKind || 'device'} · {device.trustState || 'lan'}</div>
                    </div>
                    <button className={tabStyles['settings-btn-secondary']} type="button" onClick={() => revokeDevice(device.deviceId)}>
                      {t('settings.access.revoke')}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.access.localAccount')}>
          <SettingsSection.Note>{t('settings.access.accountSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.access.username')}
            layout="stacked"
            control={
              <input
                aria-label={t('settings.access.username')}
                className={`${tabStyles['settings-input']} ${styles.fieldInput}`}
                value={accountDraft.username}
                onChange={(event) => setAccountDraft(prev => ({ ...prev, username: event.target.value }))}
              />
            }
          />
          <SettingsRow
            label={t('settings.access.displayName')}
            layout="stacked"
            control={
              <input
                aria-label={t('settings.access.displayName')}
                className={`${tabStyles['settings-input']} ${styles.fieldInput}`}
                value={accountDraft.displayName}
                onChange={(event) => setAccountDraft(prev => ({ ...prev, displayName: event.target.value }))}
              />
            }
          />
          <SettingsSection.Footer>
            <button className={tabStyles['settings-btn-primary']} type="button" onClick={saveAccount}>
              {t('settings.access.saveAccount')}
            </button>
          </SettingsSection.Footer>
        </SettingsSection>

        <SettingsSection title={t('settings.access.password')}>
          <SettingsRow
            label={summary?.account.passwordSet ? t('settings.access.passwordSet') : t('settings.access.passwordNotSet')}
            hint={t('settings.access.passwordHint')}
            layout="stacked"
            control={
              <input
                aria-label={t('settings.access.newPassword')}
                className={`${tabStyles['settings-input']} ${styles.fieldInput}`}
                type="password"
                value={passwordDraft}
                onChange={(event) => setPasswordDraft(event.target.value)}
              />
            }
          />
          <SettingsSection.Footer>
            <div className={styles.footerRow}>
              {summary?.account.passwordSet && (
                <button className={tabStyles['settings-btn-secondary']} type="button" onClick={clearPassword}>
                  {t('settings.access.clearPassword')}
                </button>
              )}
              <button className={tabStyles['settings-btn-primary']} type="button" onClick={savePassword} disabled={!passwordDraft}>
                <PhosphorIcon icon={LockKey} size={14} />
                {t('settings.access.savePassword')}
              </button>
            </div>
          </SettingsSection.Footer>
        </SettingsSection>
      </div>
    </div>
  );
}
