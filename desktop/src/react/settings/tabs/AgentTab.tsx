import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { t, autoSaveConfig } from '../helpers';
import { SelectWidget } from '@/ui';
import { browseAgent, setPrimaryAgent, loadSettingsConfig, loadAgents } from '../actions';
import { AgentCardStack } from './agent/AgentCardStack';
import { YuanSelector } from './agent/YuanSelector';
import { MemorySection } from './agent/AgentMemory';
import { AgentToolsSection } from './agent/AgentToolsSection';
import { CharacterCardPreviewOverlay, type CharacterCardPlan } from '../overlays/CharacterCardPreviewOverlay';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { Toggle } from '../widgets/Toggle';
import tabStyles from '../Settings.module.css';
import styles from './AgentTab.module.css';
import {
  type ExpCategory, parseExperience,
  ExperienceBlock, putExperience,
} from './agent/AgentExperience';

export function AgentTab() {
  const {
    agents, currentAgentId, settingsAgentId, settingsConfig, currentPins,
    globalModelsConfig,
  } = useSettingsStore(
    useShallow(s => ({
      agents: s.agents,
      currentAgentId: s.currentAgentId,
      settingsAgentId: s.settingsAgentId,
      settingsConfig: s.settingsConfig,
      currentPins: s.currentPins,
      globalModelsConfig: s.globalModelsConfig,
    }))
  );
  const showToast = useSettingsStore(s => s.showToast);
  const set = useSettingsStore(s => s.set);
  const getSettingsAgentId = useSettingsStore(s => s.getSettingsAgentId);

  const hasUtilityModel = !!(globalModelsConfig?.models?.utility && globalModelsConfig?.models?.utility_large);
  const selectedSettingsAgentId = settingsAgentId || currentAgentId;

  const [agentName, setAgentName] = useState('');
  const [identity, setIdentity] = useState('');
  const [ishiki, setIshiki] = useState('');
  const [expCategories, setExpCategories] = useState<ExpCategory[]>([]);
  const [exportPlanningAgentId, setExportPlanningAgentId] = useState<string | null>(null);
  const [exportingCharacterCard, setExportingCharacterCard] = useState(false);
  const [exportPlan, setExportPlan] = useState<CharacterCardPlan | null>(null);
  const [exportMemory, setExportMemory] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedName = settingsConfig?.agent?.name || '';
  const savedIdentity = settingsConfig?._identity || '';
  const savedIshiki = settingsConfig?._ishiki || '';

  useEffect(() => {
    if (settingsConfig) {
      setAgentName(savedName);
      setIdentity(savedIdentity);
      setIshiki(savedIshiki);
      setExpCategories(parseExperience(settingsConfig._experience || ''));
    }
  }, [settingsConfig, savedName, savedIdentity, savedIshiki]);

  const isDirty = useMemo(
    () => agentName !== savedName || identity !== savedIdentity || ishiki !== savedIshiki,
    [agentName, savedName, identity, savedIdentity, ishiki, savedIshiki],
  );

  const currentYuan = settingsConfig?.agent?.yuan || 'hanako';

  const chatRaw = settingsConfig?.models?.chat;
  const currentModel = (() => {
    if (!chatRaw) return '';
    if (typeof chatRaw === 'object' && chatRaw?.id && chatRaw?.provider) {
      return `${chatRaw.provider}/${chatRaw.id}`;
    }
    if (typeof chatRaw === 'object' && chatRaw?.id) return chatRaw.id;
    if (typeof chatRaw === 'string') return chatRaw;
    return '';
  })();

  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider: string }>>([]);
  useEffect(() => {
    hanaFetch('/api/models').then(r => r.json()).then(data => {
      setAvailableModels(data.models || []);
    }).catch(() => {});
  }, [settingsConfig]);

  const modelOptions = useMemo(() => {
    const opts = availableModels.map(m => ({
      value: `${m.provider}/${m.id}`,
      label: m.name || m.id,
      group: m.provider,
    }));
    if (currentModel && !opts.some(o => o.value === currentModel)) {
      opts.unshift({ value: currentModel, label: t('settings.agent.modelUnavailable', { model: currentModel }), group: '' });
    }
    return opts;
  }, [availableModels, currentModel]);
  const currentModelUnavailable = !!currentModel && !availableModels.some(m => `${m.provider}/${m.id}` === currentModel);

  const memoryEnabled = settingsConfig?.memory?.enabled !== false;
  const experienceEnabled = settingsConfig?.experience?.enabled === true;
  const hasAvailableToolsField = !!settingsConfig && Object.prototype.hasOwnProperty.call(settingsConfig, 'availableTools');
  const availableTools = hasAvailableToolsField ? settingsConfig?.availableTools : undefined;

  const saveAgent = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      const agentId = getSettingsAgentId()!;
      const agentBase = `/api/agents/${agentId}`;
      const isActive = agentId === currentAgentId;

      const configPartial: Record<string, unknown> = {};
      if (agentName !== savedName) {
        configPartial.agent = { name: agentName };
      }

      const identityChanged = identity !== savedIdentity;
      const ishikiChanged = ishiki !== savedIshiki;

      const requests: Promise<Response>[] = [];
      if (Object.keys(configPartial).length) {
        requests.push(hanaFetch(`${agentBase}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configPartial),
        }));
      }
      if (identityChanged) {
        requests.push(hanaFetch(`${agentBase}/identity`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: identity }),
        }));
      }
      if (ishikiChanged) {
        requests.push(hanaFetch(`${agentBase}/ishiki`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: ishiki }),
        }));
      }

      const results = await Promise.all(requests);
      for (const res of results) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }

      showToast(t('settings.saved'), 'success');
      if (isActive && (configPartial as { agent?: { name: string } })?.agent?.name) {
        set({ agentName: (configPartial as { agent: { name: string } }).agent.name });
      }
      await loadSettingsConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(t('settings.saveFailed') + ': ' + msg, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    isDirty, saving, agentName, savedName, identity, savedIdentity, ishiki, savedIshiki,
    getSettingsAgentId, currentAgentId, set, showToast,
  ]);

  const openAgentExportPreview = async (agentId: string) => {
    if (exportPlanningAgentId || exportingCharacterCard) return;
    setExportPlanningAgentId(agentId);
    try {
      const res = await hanaFetch('/api/character-cards/export/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
        timeout: 90_000,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExportPlan(data.plan);
      setExportMemory(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(t('settings.saveFailed') + ': ' + msg, 'error');
    } finally {
      setExportPlanningAgentId(null);
    }
  };

  const confirmAgentExport = async () => {
    if (!exportPlan?.agentId || exportingCharacterCard) return;
    setExportingCharacterCard(true);
    try {
      const res = await hanaFetch('/api/character-cards/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: exportPlan.agentId,
          exportMemory: exportMemory && exportPlan.memory.available,
        }),
        timeout: 90_000,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExportPlan(null);
      setExportMemory(false);
      if (typeof data.filePath === 'string' && data.filePath) {
        window.platform?.showInFinder?.(data.filePath);
      }
      showToast(`已导出到 ${data.filePath}`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(t('settings.saveFailed') + ': ' + msg, 'error');
    } finally {
      setExportingCharacterCard(false);
    }
  };

  const handleAvatarClick = () => {
    // eslint-disable-next-line no-restricted-syntax -- ephemeral file picker, not part of React tree
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.addEventListener('change', () => {
      if (input.files?.[0]) {
        window.dispatchEvent(new CustomEvent('hana-open-cropper', {
          detail: { role: 'agent', file: input.files[0] },
        }));
      }
    });
    input.click();
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles.active}`} data-tab="agent">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.agent.pageDesc')}</p>
        <button
          type="button"
          className={tabStyles['settings-save-btn-sm']}
          onClick={() => useSettingsStore.getState().set({ activeTab: 'experts-marketplace' })}
          style={{ marginBottom: 12 }}
        >
          浏览专家市场
        </button>

        <section className={styles.heroPanel} aria-label={t('settings.agent.title')}>
          <div className={styles.heroVisual}>
            <AgentCardStack
              agents={agents}
              selectedId={selectedSettingsAgentId}
              currentAgentId={currentAgentId}
              onSelect={(id) => browseAgent(id)}
              onAvatarClick={handleAvatarClick}
              onSetPrimary={(id) => setPrimaryAgent(id)}
              onDelete={(id) => window.dispatchEvent(new CustomEvent('hana-show-agent-delete', {
                detail: { agentId: id },
              }))}
              onExport={openAgentExportPreview}
              onAdd={() => window.dispatchEvent(new Event('hana-show-agent-create'))}
              exportingAgentId={exportPlanningAgentId}
            />
          </div>

          <div className={styles.heroForm}>
            <div className={styles.heroRow}>
              <label className={styles.heroRowLabel} htmlFor="agent-settings-name">
                {t('settings.agent.agentNameHint')}
              </label>
              <input
                id="agent-settings-name"
                className={styles.heroInput}
                type="text"
                value={agentName}
                placeholder={t('settings.agent.namePlaceholder')}
                onChange={(e) => setAgentName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className={`${styles.heroRow} ${styles.heroRowModel}`}>
              <label className={styles.heroRowLabel} htmlFor="agent-settings-model">
                {t('settings.agent.chatModel')}
              </label>
              <div className={styles.heroRowControl}>
                <SelectWidget
                  className={styles.heroSelect}
                  options={modelOptions}
                  value={currentModel}
                  onChange={async (refKey) => {
                    const slashIdx = refKey.indexOf('/');
                    if (slashIdx <= 0 || slashIdx === refKey.length - 1) {
                      console.warn('[AgentTab] 模型 value 缺少 provider 前缀，已忽略', refKey);
                      return;
                    }
                    const provider = refKey.slice(0, slashIdx);
                    const id = refKey.slice(slashIdx + 1);
                    await autoSaveConfig({ models: { chat: { id, provider } } });
                  }}
                  placeholder={t('settings.api.selectModel')}
                />
              </div>
              <div className={styles.heroRowNotes}>
                <p className={styles.heroNote}>{t('settings.agent.chatModelHint')}</p>
                {currentModelUnavailable && (
                  <p className={`${styles.heroNote} ${styles.heroNoteWarn}`}>
                    {t('settings.agent.modelUnavailableHint')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <SettingsSection title={t('settings.about.title')}>
          <SettingsSection.Note>{t('settings.agent.yuanHint')}</SettingsSection.Note>
          <div className={styles.yuanWrap}>
            <YuanSelector
              currentYuan={currentYuan}
              onChange={async (key) => {
                const agentId = getSettingsAgentId()!;
                try {
                  await hanaFetch(`/api/agents/${agentId}/config`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ agent: { yuan: key } }),
                  });
                  if (agentId === currentAgentId) set({ agentYuan: key });
                  await loadSettingsConfig();
                  await loadAgents();
                } catch (err) {
                  console.error('[yuan] switch failed:', err);
                }
              }}
            />
          </div>
          <SettingsRow
            label={t('settings.agent.identity')}
            hint={t('settings.agent.identityHint')}
            layout="stacked"
            control={(
              <textarea
                className={`${tabStyles['settings-textarea']} ${styles.identityTextarea}`}
                rows={3}
                spellCheck={false}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
              />
            )}
          />
          <SettingsRow
            label={t('settings.agent.ishiki')}
            hint={t('settings.agent.ishikiHint')}
            layout="stacked"
            control={(
              <textarea
                className={`${tabStyles['settings-textarea']} ${styles.ishikiTextarea}`}
                rows={10}
                spellCheck={false}
                value={ishiki}
                onChange={(e) => setIshiki(e.target.value)}
              />
            )}
          />
          <SettingsSection.Footer>
            <div className={styles.footer}>
              <span className={`${styles.footerHint}${isDirty ? ` ${styles.footerHintDirty}` : ''}`}>
                {isDirty ? t('settings.me.unsaved') : t('settings.me.allSaved')}
              </span>
              <button
                type="button"
                className={tabStyles['settings-btn-primary']}
                onClick={saveAgent}
                disabled={!isDirty || saving}
              >
                {t('settings.save')}
              </button>
            </div>
          </SettingsSection.Footer>
        </SettingsSection>

        <MemorySection
          hasUtilityModel={hasUtilityModel}
          memoryEnabled={memoryEnabled}
          currentPins={currentPins}
        />

        <SettingsSection title={t('settings.experience.title')}>
          <SettingsRow
            label={t('settings.experience.toggleLabel')}
            hint={t('settings.experience.toggleHint')}
            control={<Toggle
              on={experienceEnabled}
              onChange={async (on) => {
                const saved = await autoSaveConfig({ experience: { enabled: on } }, { silent: true });
                if (saved) await loadSettingsConfig();
              }}
            />}
          />
          <div className={styles.experienceBody}>
            {!experienceEnabled ? (
              <div className={tabStyles['exp-empty']}>{t('settings.experience.paused')}</div>
            ) : expCategories.length === 0 ? (
              <div className={tabStyles['exp-empty']}>{t('settings.experience.empty')}</div>
            ) : (
              <div className={tabStyles['exp-list']}>
                {expCategories.map((cat) => (
                  <ExperienceBlock
                    key={cat.name}
                    category={cat}
                    onSave={(updated) => {
                      const next = expCategories.map(c => c.name === cat.name ? updated : c);
                      setExpCategories(next);
                      putExperience({ getSettingsAgentId, showToast }, next);
                    }}
                    onDelete={() => {
                      const next = expCategories.filter(c => c.name !== cat.name);
                      setExpCategories(next);
                      putExperience({ getSettingsAgentId, showToast }, next);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </SettingsSection>

        <AgentToolsSection
          availableTools={availableTools}
          disabled={settingsConfig?.tools?.disabled ?? ['update_settings', 'dm']}
        />
      </div>

      {exportPlanningAgentId && createPortal((
        <div className={tabStyles['character-card-preview-overlay']} role="dialog" aria-modal="true">
          <div className={tabStyles['character-card-loading-card']}>正在生成角色卡预览</div>
        </div>
      ), document.body)}
      {exportPlan && (
        <CharacterCardPreviewOverlay
          plan={exportPlan}
          mode="export"
          memoryChecked={exportMemory}
          processing={exportingCharacterCard}
          onMemoryChange={(checked) => {
            if (exportPlan.memory.available) setExportMemory(checked);
          }}
          onConfirm={confirmAgentExport}
          onCancel={() => {
            setExportPlan(null);
            setExportMemory(false);
          }}
        />
      )}
    </div>
  );
}
