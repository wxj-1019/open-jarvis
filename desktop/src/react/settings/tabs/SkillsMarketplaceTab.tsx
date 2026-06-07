import React, { useCallback, useEffect, useState } from 'react';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { SettingsSection } from '../components/SettingsSection';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { CaretLeft, ArrowsClockwise } from '@phosphor-icons/react';
import tabStyles from '../Settings.module.css';
import styles from '../Settings.module.css';

interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  installed: boolean;
  installable: boolean;
}

interface MarketplaceResponse {
  skills: MarketplaceSkill[];
  source?: { kind?: string; path?: string };
  warnings?: string[];
}

/* ── Skill 卡片（左侧列表）── */

function MarketplaceSkillCard({
  skill,
  onSelect,
  isSelected,
}: {
  skill: MarketplaceSkill;
  onSelect: (skill: MarketplaceSkill) => void;
  isSelected: boolean;
}) {
  return (
    <div
      className={`${tabStyles['skills-list-item']}${isSelected ? ` ${tabStyles['skills-list-item-active'] || ''}` : ''}`}
      onClick={() => onSelect(skill)}
    >
      <div className={tabStyles['skills-list-info']}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span className={tabStyles['skills-list-name']}>{skill.name}</span>
          {skill.installed && (
            <span className={styles['skills-source-badge']} style={{ marginRight: 0 }}>
              {t('settings.skills.marketInstalled')}
            </span>
          )}
        </div>
        {skill.description && (
          <span className={tabStyles['skills-list-desc']}>{skill.description}</span>
        )}
        <span className={tabStyles['skills-list-desc']}>
          {skill.source || 'unknown'}
        </span>
      </div>
    </div>
  );
}

/* ── 主组件 ── */

export function SkillsMarketplaceTab() {
  const showToast = useSettingsStore(s => s.showToast);
  const set = useSettingsStore(s => s.set);
  const [marketplace, setMarketplace] = useState<MarketplaceResponse | null>(null);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<MarketplaceSkill | null>(null);
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);

  const currentAgentId = useSettingsStore(s => s.currentAgentId);

  /* ── 加载市场数据 ── */

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentAgentId) params.set('agentId', currentAgentId);
      const res = await hanaFetch(`/api/skills/marketplace?${params.toString()}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const next = {
        skills: Array.isArray(data.skills) ? data.skills : [],
        source: data.source || {},
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      };
      setMarketplace(next);
      if (next.skills.length > 0 && !selectedSkill) {
        setSelectedSkill(next.skills[0]);
      }
    } catch (err: unknown) {
      showToast(
        t('settings.skills.marketLoadError') + ': ' + (err instanceof Error ? err.message : String(err)),
        'error',
      );
    } finally {
      setMarketplaceLoading(false);
    }
  }, [currentAgentId, selectedSkill, showToast]);

  useEffect(() => {
    loadMarketplace();
  }, [loadMarketplace]);

  /* ── 安装 skill ── */

  const installSkill = async (skill: MarketplaceSkill) => {
    setInstallingSkillId(skill.id);
    try {
      const body: Record<string, string> = {};
      if (currentAgentId) body.agentId = currentAgentId;
      const res = await hanaFetch(`/api/skills/marketplace/${encodeURIComponent(skill.id)}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(t('settings.skills.installSuccess', { name: data.name || skill.name }), 'success');
      await loadMarketplace();
    } catch (err: unknown) {
      showToast(
        t('settings.skills.installError') + ': ' + (err instanceof Error ? err.message : String(err)),
        'error',
      );
    } finally {
      setInstallingSkillId(null);
    }
  };

  /* ── 渲染 ── */

  const statusText = marketplace?.source?.path
    ? t('settings.skills.marketplaceCount', { count: String(marketplace.skills.length) })
    : t('settings.skills.marketplaceNoSource');

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="skills-marketplace">
      <div className={styles.root}>

        {/* 顶栏 */}
        <div className={styles['plugin-marketplace-toolbar']}>
          <button
            type="button"
            className={tabStyles['settings-return-btn']}
            onClick={() => set({ activeTab: 'skills' })}
            aria-label={t('settings.skills.marketBack')}
            title={t('settings.skills.marketBack')}
          >
            <PhosphorIcon icon={CaretLeft} size={22} />
          </button>
          <span className={styles['skills-list-desc']}>{t('settings.skills.marketplaceHint')}</span>
          <div className={styles['plugin-marketplace-toolbar-actions']}>
            {marketplace && (
              <span className={styles['skills-source-badge']} style={{ marginRight: 0 }}>
                {statusText}
              </span>
            )}
            <button
              type="button"
              className={tabStyles['settings-icon-btn']}
              title={t('settings.skills.openMarketplace')}
              onClick={loadMarketplace}
              disabled={marketplaceLoading}
            >
              <PhosphorIcon icon={ArrowsClockwise} size={14} className={marketplaceLoading ? tabStyles['spin'] : ''} />
            </button>
          </div>
        </div>

        <SettingsSection variant="flush">
          {!marketplace ? (
            <p className={`${tabStyles['settings-muted-note']} ${styles['skills-empty']}`}>
              {t('settings.skills.marketLoading')}
            </p>
          ) : (
            <>
              {marketplace.warnings && marketplace.warnings.length > 0 && (
                <p className={`${tabStyles['settings-muted-note']} ${styles['skills-empty']}`} style={{ color: 'var(--danger, #c55)' }}>
                  {marketplace.warnings[0]}
                </p>
              )}
              {marketplace.skills.length === 0 ? (
                <p className={`${tabStyles['settings-muted-note']} ${styles['skills-empty']}`}>
                  {t('settings.skills.marketplaceEmpty')}
                </p>
              ) : (
                <div className={styles['plugin-marketplace-grid']}>
                  {/* 左侧列表 */}
                  <div className={styles['skills-list-block']}>
                    {marketplace.skills.map(skill => (
                      <MarketplaceSkillCard
                        key={skill.id}
                        skill={skill}
                        onSelect={setSelectedSkill}
                        isSelected={selectedSkill?.id === skill.id}
                      />
                    ))}
                  </div>

                  {/* 右侧详情 */}
                  <div className={styles['skills-list-block']}>
                    <div className={styles['skills-list-item']} style={{ alignItems: 'flex-start', cursor: 'default' }}>
                      <div className={styles['skills-list-info']} style={{ gap: 'var(--space-sm)', width: '100%' }}>
                        {selectedSkill ? (
                          <>
                            <div className={styles['plugin-marketplace-detail-header']}>
                              <div style={{ minWidth: 0 }}>
                                <div className={styles['skills-list-name']}>{selectedSkill.name}</div>
                                <div className={styles['skills-list-desc']}>
                                  {selectedSkill.source || 'builtin'}
                                </div>
                                {selectedSkill.installed && (
                                  <div className={styles['skills-list-desc']}>
                                    {t('settings.skills.marketInstalled')}
                                  </div>
                                )}
                              </div>
                              <button
                                className={tabStyles['settings-save-btn-sm']}
                                disabled={!selectedSkill.installable || installingSkillId === selectedSkill.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  installSkill(selectedSkill);
                                }}
                              >
                                {installingSkillId === selectedSkill.id
                                  ? t('settings.skills.installing')
                                  : selectedSkill.installed
                                    ? t('settings.skills.marketInstalled')
                                    : t('settings.skills.marketInstall')}
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {selectedSkill.description && (
                                <div className={styles['sv-description']}>
                                  <div className={styles['sv-description-label']}>Description</div>
                                  <div className={styles['sv-description-text']}>{selectedSkill.description}</div>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className={styles['skills-list-desc']}>{t('settings.skills.marketSelectSkill')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </SettingsSection>

      </div>
    </div>
  );
}
