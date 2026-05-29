import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { Toggle } from '../widgets/Toggle';
import { CodeSigningPanel } from '../components/CodeSigningPanel';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { useSettingsStore } from '../store';
import tabStyles from '../Settings.module.css';
import styles from './ComputerUseTab.module.css';

interface ComputerProviderStatus {
  providerId: string;
  status?: {
    available?: boolean;
    reason?: string;
    error?: string;
    permissions?: Array<{ name?: string; granted?: boolean }>;
  };
}

interface ComputerUseStatusResponse {
  selectedProviderId?: string | null;
  status?: {
    enabled?: boolean;
    activeLease?: {
      leaseId?: string;
      agentId?: string | null;
      appId?: string | null;
    } | null;
    providers?: ComputerProviderStatus[];
  } | null;
  settings?: {
    enabled?: boolean;
    app_approvals?: Array<{ providerId: string; appId: string; appName?: string }>;
  };
}

function StatusPill({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`${styles.statusPill} ${ok ? styles.statusOk : styles.statusWarn}`} title={text}>
      <span className={`${styles.statusDot} ${ok ? styles.statusDotOk : styles.statusDotWarn}`} />
      <span>{text}</span>
    </span>
  );
}

export function ComputerUseTab() {
  const [data, setData] = useState<ComputerUseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const showToast = useSettingsStore((state) => state.showToast);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hanaFetch('/api/preferences/computer-use');
      setData(await res.json());
    } catch (err) {
      console.warn('[computer-use] load status failed:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProvider = useMemo(() => {
    const id = data?.selectedProviderId || null;
    return data?.status?.providers?.find((provider) => provider.providerId === id) || null;
  }, [data]);

  const enabled = data ? data.settings?.enabled === true : undefined;
  const available = selectedProvider?.status?.available === true;
  const availabilityIssue = selectedProvider?.status?.reason || selectedProvider?.status?.error || '';
  const permissions = selectedProvider?.status?.permissions || [];
  const permissionsOk = permissions.length === 0 || permissions.every((p) => p.granted !== false);
  const permissionText = permissions.length > 0
    ? permissions.map((p) => `${p.name || 'permission'}:${p.granted ? 'ok' : 'missing'}`).join(' · ')
    : t('settings.computerUse.permissionsEmpty');
  const approvals = data?.settings?.app_approvals || [];
  const approvalsText = approvals.length > 0
    ? approvals.map((item) => item.appName || item.appId).join(' · ')
    : t('settings.computerUse.approvalsEmpty');
  const activeLease = data?.status?.activeLease;
  const activeLeaseText = activeLease
    ? activeLease.appId || activeLease.agentId || activeLease.leaseId || t('settings.computerUse.active')
    : t('settings.computerUse.idle');

  const saveEnabled = async (next: boolean) => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await hanaFetch('/api/preferences/computer-use', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { enabled: next } }),
      });
      const body = await res.json();
      setData((prev) => ({
        ...(prev || {}),
        settings: {
          ...(prev?.settings || {}),
          ...(body.settings || {}),
        },
      }));
      await load();
    } catch (err: unknown) {
      showToast(t('settings.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestPermissions = async () => {
    setRequesting(true);
    try {
      await hanaFetch('/api/preferences/computer-use/request-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: data?.selectedProviderId || undefined }),
      });
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`${t('settings.computerUse.requestPermissionsFailed')}: ${message}`, 'error');
    } finally {
      setRequesting(false);
    }
  };

  const refreshButton = (
    <button
      type="button"
      className={tabStyles['settings-icon-btn']}
      title={t('settings.computerUse.refresh')}
      onClick={load}
      disabled={loading}
    >
      <PhosphorIcon icon={ArrowsClockwise} size={14} className={loading ? tabStyles['spin'] : ''} />
    </button>
  );

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="computer">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.computerUse.pageDesc')}</p>

        <SettingsSection
          title={t('settings.computerUse.title')}
          context={<div className={styles.toolbar}>{refreshButton}</div>}
        >
          <SettingsSection.Warning data-testid="computer-use-experimental-warning">
            {t('settings.computerUse.experimentalWarning')}
          </SettingsSection.Warning>
          <SettingsSection.Note>{t('settings.computerUse.controlSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.computerUse.enabled')}
            hint={t('settings.computerUse.enabledHint')}
            control={<Toggle on={enabled} onChange={(next) => saveEnabled(next)} disabled={saving || loading} />}
          />
          <SettingsRow
            label={t('settings.computerUse.permissions')}
            hint={t('settings.computerUse.permissionsHint')}
            control={
              <button
                type="button"
                className={tabStyles['settings-btn-secondary']}
                onClick={requestPermissions}
                disabled={requesting || loading}
              >
                {t('settings.computerUse.requestPermissions')}
              </button>
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.computerUse.statusSection')}>
          <SettingsSection.Note>{t('settings.computerUse.statusSectionNote')}</SettingsSection.Note>
          {loading && !data ? (
            <p className={styles.intro} style={{ margin: '0 4px 12px' }}>{t('status.loading')}</p>
          ) : (
            <>
              <SettingsRow
                label={t('settings.computerUse.provider')}
                control={
                  <StatusPill
                    ok={!!data?.selectedProviderId}
                    text={data?.selectedProviderId || '—'}
                  />
                }
              />
              <SettingsRow
                label={t('settings.computerUse.availability')}
                hint={availabilityIssue || undefined}
                control={
                  <StatusPill
                    ok={available}
                    text={available ? t('settings.computerUse.available') : t('settings.computerUse.unavailable')}
                  />
                }
              />
              <SettingsRow
                label={t('settings.computerUse.permissionsStatus')}
                control={<StatusPill ok={permissionsOk} text={permissionText} />}
              />
              <SettingsRow
                label={t('settings.computerUse.approvals')}
                control={<StatusPill ok={approvals.length > 0} text={approvalsText} />}
              />
              <SettingsRow
                label={t('settings.computerUse.activeSession')}
                control={<StatusPill ok={!activeLease} text={activeLeaseText} />}
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title={t('settings.codeSigning.title')} variant="flush">
          <SettingsSection.Note>{t('settings.codeSigning.description')}</SettingsSection.Note>
          <div className={styles.codeSigningWrap}>
            <CodeSigningPanel embedded />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
