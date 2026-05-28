import { useState, useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { invalidateConfigCache } from '../../hooks/use-config';
import { t } from '../helpers';
import { loadSettingsConfig } from '../actions';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import tabStyles from '../Settings.module.css';
import styles from './MeTab.module.css';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { UserCircle } from '@phosphor-icons/react';

export function MeTab() {
  const { settingsConfig, userAvatarUrl } = useSettingsStore(
    useShallow(s => ({ settingsConfig: s.settingsConfig, userAvatarUrl: s.userAvatarUrl }))
  );
  const showToast = useSettingsStore(s => s.showToast);
  const [userName, setUserName] = useState('');
  const [userProfile, setUserProfile] = useState('');
  const [saving, setSaving] = useState(false);

  const savedName = settingsConfig?.user?.name || '';
  const savedProfile = settingsConfig?._userProfile || '';

  useEffect(() => {
    if (settingsConfig) {
      setUserName(savedName);
      setUserProfile(savedProfile);
    }
  }, [settingsConfig, savedName, savedProfile]);

  const isDirty = useMemo(
    () => userName !== savedName || userProfile !== savedProfile,
    [userName, savedName, userProfile, savedProfile],
  );

  const save = useCallback(async () => {
    if (!isDirty || saving) return;
    const store = useSettingsStore.getState();
    setSaving(true);
    try {
      const partial: Record<string, unknown> = {};
      if (userName !== savedName) {
        partial.user = { name: userName };
      }
      const profileChanged = userProfile !== savedProfile;

      const requests: Promise<Response>[] = [];
      if (Object.keys(partial).length) {
        requests.push(hanaFetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partial),
        }));
      }
      if (profileChanged) {
        requests.push(hanaFetch('/api/user-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: userProfile }),
        }));
      }

      const results = await Promise.all(requests);
      for (const res of results) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }

      showToast(t('settings.saved'), 'success');
      if (partial.user && typeof partial.user === 'object' && partial.user !== null && 'name' in partial.user) {
        store.set({ userName: (partial.user as { name: string }).name });
      }
      if (Object.keys(partial).length) invalidateConfigCache();

      await loadSettingsConfig();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`${t('settings.saveFailed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [isDirty, saving, userName, savedName, userProfile, savedProfile, showToast]);

  const handleAvatarClick = () => {
    // eslint-disable-next-line no-restricted-syntax -- ephemeral file picker, not part of React tree
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.addEventListener('change', () => {
      if (input.files?.[0]) {
        window.dispatchEvent(new CustomEvent('hana-open-cropper', {
          detail: { role: 'user', file: input.files[0] },
        }));
      }
    });
    input.click();
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles.active}`} data-tab="me">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.me.pageDesc')}</p>

        <section className={styles.avatarHero} aria-label={t('settings.me.avatarSection')}>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={handleAvatarClick}
            aria-label={t('settings.me.changeAvatar')}
          >
            {userAvatarUrl ? (
              <img className={styles.avatarPreview} src={userAvatarUrl} alt="" draggable={false} />
            ) : (
              <div className={styles.avatarPlaceholder}>
                <PhosphorIcon icon={UserCircle} size={40} />
              </div>
            )}
            <span className={styles.avatarOverlay}>{t('settings.me.changeAvatar')}</span>
          </button>
          <p className={styles.avatarHint}>{t('settings.me.avatarHint')}</p>
        </section>

        <SettingsSection title={t('settings.me.profileSection')}>
          <SettingsSection.Note>{t('settings.me.profileSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.me.userName')}
            hint={t('settings.me.userNameHint')}
            layout="stacked"
            control={
              <input
                className={tabStyles['settings-input']}
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoComplete="nickname"
              />
            }
          />
          <SettingsRow
            label={t('settings.me.userProfile')}
            hint={t('settings.me.userProfileHint')}
            layout="stacked"
            control={
              <textarea
                className={`${tabStyles['settings-textarea']} ${styles.profileTextarea}`}
                rows={8}
                spellCheck={false}
                value={userProfile}
                onChange={(e) => setUserProfile(e.target.value)}
              />
            }
          />
          <SettingsSection.Footer>
            <div className={styles.footer}>
              <span className={`${styles.footerHint}${isDirty ? ` ${styles.footerHintDirty}` : ''}`}>
                {isDirty ? t('settings.me.unsaved') : t('settings.me.allSaved')}
              </span>
              <button
                type="button"
                className={tabStyles['settings-btn-primary']}
                onClick={save}
                disabled={!isDirty || saving}
              >
                {t('settings.save')}
              </button>
            </div>
          </SettingsSection.Footer>
        </SettingsSection>
      </div>
    </div>
  );
}
