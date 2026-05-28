import React from 'react';
import { BookOpen } from '@phosphor-icons/react';
import { t } from '../helpers';
import { Toggle } from '../widgets/Toggle';
import { PlatformSection } from './bridge/PlatformSection';
import { WechatSection } from './bridge/WechatSection';
import { useBridgeState } from './bridge/useBridgeState';
import { BridgeAgentRow } from './bridge/BridgeAgentRow';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import tabStyles from '../Settings.module.css';
import styles from './BridgeTab.module.css';

export function BridgeTab() {
  const b = useBridgeState();
  const tgInfo = b.status?.telegram;
  const fsInfo = b.status?.feishu;
  const qqInfo = b.status?.qq;
  const wxInfo = b.status?.wechat;
  const readOnly = b.status ? b.status.readOnly === true : undefined;
  const receiptEnabled = b.status ? b.status.receiptEnabled !== false : undefined;
  const globalSettingsPending = !b.status || b.globalSettingsSaving;

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="bridge">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.bridge.pageDesc')}</p>

        <SettingsSection title={t('settings.bridge.globalSettings')}>
          <SettingsSection.Note>{t('settings.bridge.globalSettingsNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.bridge.receiptEnabled')}
            hint={t('settings.bridge.receiptEnabledDesc')}
            control={
              <Toggle
                on={receiptEnabled}
                onChange={(on) => b.saveGlobalSettings({ receiptEnabled: on })}
                disabled={globalSettingsPending}
              />
            }
          />
          <SettingsRow
            label={t('settings.bridge.readOnly')}
            hint={t('settings.bridge.readOnlyDesc')}
            control={
              <Toggle
                on={readOnly}
                onChange={(on) => b.saveGlobalSettings({ readOnly: on })}
                disabled={globalSettingsPending}
              />
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.bridge.agentSettings')} variant="flush">
          <SettingsSection.Note>{t('settings.bridge.agentSettingsNote')}</SettingsSection.Note>
          <BridgeAgentRow
            value={b.selectedAgentId}
            onChange={b.setSelectedAgentId}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.agent.publicIshiki')}>
          <div className={styles.textBlock}>
            <p className={styles.fieldHint}>{t('settings.agent.publicIshikiHint')}</p>
            <textarea
              className={tabStyles['settings-textarea']}
              rows={6}
              spellCheck={false}
              value={b.publicIshiki}
              onChange={(e) => b.setPublicIshiki(e.target.value)}
              onBlur={b.savePublicIshiki}
            />
          </div>
        </SettingsSection>

        <div className={styles.helpRow}>
          <button
            type="button"
            className={tabStyles['settings-btn-secondary']}
            onClick={() => window.dispatchEvent(new Event('hana-show-bridge-tutorial'))}
          >
            <PhosphorIcon icon={BookOpen} size={14} />
            {t('settings.bridge.howTo')}
          </button>
        </div>

        <div className={styles.platformsBlock}>
          <h3 className={styles.platformsHeading}>{t('settings.bridge.platformsSection')}</h3>
          <p className={styles.platformsNote}>{t('settings.bridge.platformsSectionNote')}</p>

          <PlatformSection
            platform="telegram"
            title={t('settings.bridge.telegram')}
            status={tgInfo}
            credentialFields={[
              { key: 'token', label: t('settings.bridge.telegramToken'), type: 'secret', value: b.tgToken, onChange: b.setTgToken },
            ]}
            onToggle={async (on) => {
              if (on && !b.tgToken.trim()) { b.showToast(t('settings.bridge.noToken'), 'error'); return; }
              await b.saveBridgeConfig('telegram', b.tgToken.trim() ? { token: b.tgToken.trim() } : null, on);
            }}
            onTest={() => {
              if (!b.tgToken.trim()) { b.showToast(t('settings.bridge.noToken'), 'error'); return; }
              b.testPlatform('telegram', { token: b.tgToken.trim() });
            }}
            onCredentialBlur={async () => {
              if (b.tgToken.trim()) await b.saveBridgeConfig('telegram', { token: b.tgToken.trim() }, undefined);
            }}
            testing={b.testingPlatform === 'telegram'}
            hint={t('settings.bridge.telegramHint')}
            ownerUsers={b.status?.knownUsers?.telegram || []}
            currentOwner={b.status?.owner?.telegram}
            onOwnerChange={(userId) => b.setOwner('telegram', userId)}
          />

          <PlatformSection
            platform="feishu"
            title={t('settings.bridge.feishu')}
            status={fsInfo}
            credentialFields={[
              { key: 'appId', label: t('settings.bridge.feishuAppId'), type: 'text', value: b.fsAppId, onChange: b.setFsAppId },
              { key: 'appSecret', label: t('settings.bridge.feishuAppSecret'), type: 'secret', value: b.fsAppSecret, onChange: b.setFsAppSecret },
            ]}
            onToggle={async (on) => {
              if (on && (!b.fsAppId.trim() || !b.fsAppSecret.trim())) { b.showToast(t('settings.bridge.noCredentials'), 'error'); return; }
              await b.saveBridgeConfig('feishu', { appId: b.fsAppId.trim(), appSecret: b.fsAppSecret.trim() }, on);
            }}
            onTest={() => {
              if (!b.fsAppId.trim() || !b.fsAppSecret.trim()) { b.showToast(t('settings.bridge.noCredentials'), 'error'); return; }
              b.testPlatform('feishu', { appId: b.fsAppId.trim(), appSecret: b.fsAppSecret.trim() });
            }}
            onCredentialBlur={async () => {
              if (b.fsAppId.trim() && b.fsAppSecret.trim())
                await b.saveBridgeConfig('feishu', { appId: b.fsAppId.trim(), appSecret: b.fsAppSecret.trim() }, undefined);
            }}
            testing={b.testingPlatform === 'feishu'}
            hint={t('settings.bridge.feishuHint')}
            ownerUsers={b.status?.knownUsers?.feishu || []}
            currentOwner={b.status?.owner?.feishu}
            onOwnerChange={(userId) => b.setOwner('feishu', userId)}
          />

          <PlatformSection
            platform="qq"
            title="QQ"
            status={qqInfo}
            credentialFields={[
              { key: 'appID', label: t('settings.bridge.qqAppId'), type: 'text', value: b.qqAppId, onChange: b.setQqAppId },
              { key: 'appSecret', label: t('settings.bridge.qqAppSecret'), type: 'secret', value: b.qqAppSecret, onChange: b.setQqAppSecret },
            ]}
            onToggle={async (on) => {
              if (on && (!b.qqAppId.trim() || !b.qqAppSecret.trim())) { b.showToast(t('settings.bridge.noCredentials'), 'error'); return; }
              await b.saveBridgeConfig('qq', { appID: b.qqAppId.trim(), appSecret: b.qqAppSecret.trim() }, on);
            }}
            onTest={() => {
              if (!b.qqAppId.trim() || !b.qqAppSecret.trim()) { b.showToast(t('settings.bridge.noCredentials'), 'error'); return; }
              b.testPlatform('qq', { appID: b.qqAppId.trim(), appSecret: b.qqAppSecret.trim() });
            }}
            onCredentialBlur={async () => {
              if (b.qqAppId.trim() && b.qqAppSecret.trim())
                await b.saveBridgeConfig('qq', { appID: b.qqAppId.trim(), appSecret: b.qqAppSecret.trim() }, undefined);
            }}
            testing={b.testingPlatform === 'qq'}
            hint={t('settings.bridge.qqHint')}
            ownerUsers={b.status?.knownUsers?.qq || []}
            currentOwner={b.status?.owner?.qq}
            onOwnerChange={(userId) => b.setOwner('qq', userId)}
          />

          <WechatSection
            status={wxInfo}
            showToast={b.showToast}
            onSaveConfig={(creds, enabled) => b.saveBridgeConfig('wechat', creds, enabled)}
            onReload={b.loadStatus}
            agentId={b.selectedAgentId}
          />
        </div>
      </div>
    </div>
  );
}
