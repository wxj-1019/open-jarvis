import { useEffect, useState, useCallback, type MouseEvent } from 'react';
import { ArrowSquareOut, ArrowsClockwise, GithubLogo } from '@phosphor-icons/react';
import { useSettingsStore } from '../store';
import { autoSaveConfig, t } from '../helpers';
import { loadSettingsConfig } from '../actions';
import { Toggle } from '../widgets/Toggle';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { ExpandableRow } from '../components/ExpandableRow';
import { AutoUpdateStatus } from '../../components/AutoUpdateStatus';
import { useAutoUpdateState } from '../../hooks/use-auto-update-state';
import type { AutoLaunchStatus } from '../../types';
import appIconUrl from '../../../icon.png';
import tabStyles from '../Settings.module.css';
import styles from './AboutTab.module.css';
import { PhosphorIcon } from '../../ui/PhosphorIcon';

const GITHUB_URL = 'https://github.com/liliMozi';

export function AboutTab() {
  const hana = window.hana;
  const settingsConfig = useSettingsStore(s => s.settingsConfig);
  const [version, setVersion] = useState('');
  const [autoLaunch, setAutoLaunch] = useState<AutoLaunchStatus | null>(null);
  const [autoLaunchSaving, setAutoLaunchSaving] = useState(false);
  const autoUpdate = useAutoUpdateState();
  const isBeta = settingsConfig?.update_channel === 'beta';
  const autoCheck = settingsConfig?.auto_check_updates !== false;

  const showCheckButton = !autoUpdate
    || autoUpdate.status === 'idle'
    || autoUpdate.status === 'latest'
    || autoUpdate.status === 'error';

  useEffect(() => {
    hana?.getAppVersion?.().then((v: string) => setVersion(v || ''));
  }, [hana]);

  useEffect(() => {
    let alive = true;
    hana?.getAutoLaunchStatus?.()
      .then((status) => {
        if (alive && status) setAutoLaunch(status);
      })
      .catch(() => {
        if (alive) setAutoLaunch(null);
      });
    return () => {
      alive = false;
    };
  }, [hana]);

  const handleCheck = useCallback(() => {
    hana?.autoUpdateCheck?.();
  }, [hana]);

  const handleInstall = useCallback(async () => {
    await hana?.autoUpdateInstall?.();
  }, [hana]);

  const handleBetaToggle = useCallback(async (on: boolean) => {
    const channel = on ? 'beta' : 'stable';
    hana?.autoUpdateSetChannel?.(channel);
    await autoSaveConfig({ update_channel: channel }, { silent: true });
    await loadSettingsConfig();
    hana?.autoUpdateCheck?.();
  }, [hana]);

  const handleAutoCheckToggle = useCallback(async (on: boolean) => {
    await autoSaveConfig({ auto_check_updates: on }, { silent: true });
    await loadSettingsConfig();
  }, []);

  const handleAutoLaunchToggle = useCallback(async (on: boolean) => {
    if (!hana?.setAutoLaunchEnabled) return;
    const previous = autoLaunch;
    setAutoLaunchSaving(true);
    try {
      const next = await hana.setAutoLaunchEnabled(on);
      setAutoLaunch(next || previous);
    } catch {
      setAutoLaunch(previous);
    } finally {
      setAutoLaunchSaving(false);
    }
  }, [autoLaunch, hana]);

  const openGithub = (e: MouseEvent) => {
    e.preventDefault();
    hana?.openExternal?.(GITHUB_URL);
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="about">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.about.pageDesc')}</p>

        <SettingsSection variant="flush">
          <div className={styles.heroCard}>
            <img className={styles.icon} src={appIconUrl} alt="Jarvis" />
            <div className={styles.titleRow}>
              <span className={styles.appName}>Jarvis</span>
              {version ? <span className={styles.versionBadge}>v{version}</span> : null}
              {isBeta ? <span className={styles.channelBadge}>{t('settings.about.betaChannel')}</span> : null}
            </div>
            <p className={styles.tagline}>{t('settings.about.tagline')}</p>

            <div className={styles.updatePanel}>
              <AutoUpdateStatus
                state={autoUpdate}
                agentName={settingsConfig?.agent?.name || 'Jarvis'}
                onInstall={handleInstall}
              />
              <div className={styles.updateActions}>
                {showCheckButton && (
                  <button
                    type="button"
                    className={tabStyles['settings-btn-secondary']}
                    onClick={handleCheck}
                  >
                    <PhosphorIcon icon={ArrowsClockwise} size={14} />
                    {t('settings.about.updateCheckBtn')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.about.infoSection')}>
          <SettingsRow
            label={t('settings.about.license')}
            control={<span className={styles.staticValue}>Apache License 2.0</span>}
          />
          <SettingsRow
            label={t('settings.about.copyright')}
            control={<span className={styles.staticValue}>© 2026 liliMozi</span>}
          />
          <SettingsRow
            label="GitHub"
            control={
              <a className={styles.linkBtn} href={GITHUB_URL} onClick={openGithub}>
                <PhosphorIcon icon={GithubLogo} size={14} />
                liliMozi
                <PhosphorIcon icon={ArrowSquareOut} size={12} />
              </a>
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.about.preferencesSection')}>
          <SettingsSection.Note>{t('settings.about.preferencesSectionNote')}</SettingsSection.Note>
          {autoLaunch?.supported && (
            <SettingsRow
              label={t('settings.about.launchAtLogin')}
              hint={t('settings.about.launchAtLoginHint')}
              control={
                <Toggle
                  on={autoLaunch.openAtLogin}
                  onChange={handleAutoLaunchToggle}
                  label={t('settings.about.launchAtLogin')}
                  disabled={autoLaunchSaving}
                />
              }
            />
          )}
          <SettingsRow
            label={t('settings.about.autoCheckUpdates')}
            hint={t('settings.about.autoCheckUpdatesHint')}
            control={<Toggle on={autoCheck} onChange={handleAutoCheckToggle} />}
          />
          <SettingsRow
            label={t('settings.about.betaUpdates')}
            hint={t('settings.about.betaUpdatesHint')}
            control={<Toggle on={isBeta} onChange={handleBetaToggle} />}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.about.legalSection')}>
          <div className={styles.licensePanel}>
            <ExpandableRow label={t('settings.about.licenseToggle')}>
              <pre className={styles.licenseText}>{LICENSE_TEXT}</pre>
            </ExpandableRow>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

const LICENSE_TEXT = `Apache License, Version 2.0

Copyright 2026 liliMozi

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`;
