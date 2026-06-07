import React, { useCallback, useEffect, useState } from 'react';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { SettingsSection } from '../components/SettingsSection';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { CaretLeft, ArrowsClockwise } from '@phosphor-icons/react';
import tabStyles from '../Settings.module.css';
import styles from '../Settings.module.css';

interface MarketplaceExpert {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  tags: string[];
  description: string;
  descriptionEn: string;
  version: string;
  installed: boolean;
  installable: boolean;
}

interface MarketplaceResponse {
  experts: MarketplaceExpert[];
  source?: { kind?: string; path?: string };
  warnings?: string[];
}

/* ── Expert 卡片（左侧列表）── */

function MarketplaceExpertCard({
  expert,
  onSelect,
  isSelected,
}: {
  expert: MarketplaceExpert;
  onSelect: (expert: MarketplaceExpert) => void;
  isSelected: boolean;
}) {
  return (
    <div
      className={`${tabStyles['skills-list-item']}${isSelected ? ` ${tabStyles['skills-list-item-active'] || ''}` : ''}`}
      onClick={() => onSelect(expert)}
    >
      <div className={tabStyles['skills-list-info']}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span className={tabStyles['skills-list-name']}>{expert.name}</span>
          {expert.installed && (
            <span className={styles['skills-source-badge']} style={{ marginRight: 0 }}>
              {t('settings.experts.marketInstalled')}
            </span>
          )}
          <span className={styles['expert-category-badge']}>{expert.category}</span>
        </div>
        {expert.description && (
          <span className={tabStyles['skills-list-desc']}>{expert.description.slice(0, 60)}</span>
        )}
      </div>
    </div>
  );
}

/* ── 主组件 ── */

export function ExpertsMarketplaceTab() {
  const showToast = useSettingsStore(s => s.showToast);
  const set = useSettingsStore(s => s.set);
  const [marketplace, setMarketplace] = useState<MarketplaceResponse | null>(null);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState<MarketplaceExpert | null>(null);
  const [installingExpertId, setInstallingExpertId] = useState<string | null>(null);

  /* ── 加载市场数据 ── */

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    try {
      const res = await hanaFetch('/api/agents/marketplace');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const next = {
        experts: Array.isArray(data.experts) ? data.experts : [],
        source: data.source || {},
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      };
      setMarketplace(next);
      if (next.experts.length > 0 && !selectedExpert) {
        setSelectedExpert(next.experts[0]);
      }
    } catch (err: unknown) {
      showToast(
        t('settings.experts.marketLoadError') + ': ' + (err instanceof Error ? err.message : String(err)),
        'error',
      );
    } finally {
      setMarketplaceLoading(false);
    }
  }, [selectedExpert, showToast]);

  useEffect(() => {
    loadMarketplace();
  }, [loadMarketplace]);

  /* ── 安装 expert ── */

  const installExpert = async (expert: MarketplaceExpert) => {
    setInstallingExpertId(expert.id);
    try {
      const body: Record<string, string> = {};
      const res = await hanaFetch(`/api/agents/marketplace/${encodeURIComponent(expert.id)}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(t('settings.experts.installSuccess', { name: data.name || expert.name }), 'success');
      await loadMarketplace();
    } catch (err: unknown) {
      showToast(
        t('settings.experts.installError') + ': ' + (err instanceof Error ? err.message : String(err)),
        'error',
      );
    } finally {
      setInstallingExpertId(null);
    }
  };

  /* ── 渲染 ── */

  const statusText = marketplace?.source?.path
    ? t('settings.experts.marketplaceCount', { count: String(marketplace.experts.length) })
    : t('settings.experts.marketplaceNoSource');

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="experts-marketplace">
      <div className={styles.root}>

        {/* 顶栏 */}
        <div className={styles['plugin-marketplace-toolbar']}>
          <button
            type="button"
            className={tabStyles['settings-return-btn']}
            onClick={() => set({ activeTab: 'agent' })}
            aria-label={t('settings.experts.marketBack')}
            title={t('settings.experts.marketBack')}
          >
            <PhosphorIcon icon={CaretLeft} size={22} />
          </button>
          <span className={styles['skills-list-desc']}>{t('settings.experts.marketplaceHint')}</span>
          <div className={styles['plugin-marketplace-toolbar-actions']}>
            {marketplace && (
              <span className={styles['skills-source-badge']} style={{ marginRight: 0 }}>
                {statusText}
              </span>
            )}
            <button
              type="button"
              className={tabStyles['settings-icon-btn']}
              title={t('settings.experts.openMarketplace')}
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
              {t('settings.experts.marketLoading')}
            </p>
          ) : (
            <>
              {marketplace.warnings && marketplace.warnings.length > 0 && (
                <p className={`${tabStyles['settings-muted-note']} ${styles['skills-empty']}`} style={{ color: 'var(--danger, #c55)' }}>
                  {marketplace.warnings[0]}
                </p>
              )}
              {marketplace.experts.length === 0 ? (
                <p className={`${tabStyles['settings-muted-note']} ${styles['skills-empty']}`}>
                  {t('settings.experts.marketplaceEmpty')}
                </p>
              ) : (
                <div className={styles['plugin-marketplace-grid']}>
                  {/* 左侧列表 */}
                  <div className={styles['skills-list-block']}>
                    {marketplace.experts.map(expert => (
                      <MarketplaceExpertCard
                        key={expert.id}
                        expert={expert}
                        onSelect={setSelectedExpert}
                        isSelected={selectedExpert?.id === expert.id}
                      />
                    ))}
                  </div>

                  {/* 右侧详情 */}
                  <div className={styles['skills-list-block']}>
                    <div className={styles['skills-list-item']} style={{ alignItems: 'flex-start', cursor: 'default' }}>
                      <div className={styles['skills-list-info']} style={{ gap: 'var(--space-sm)', width: '100%' }}>
                        {selectedExpert ? (
                          <>
                            <div className={styles['plugin-marketplace-detail-header']}>
                              <div style={{ minWidth: 0 }}>
                                <div className={styles['skills-list-name']}>{selectedExpert.name}</div>
                                <div className={styles['skills-list-desc']}>
                                  {selectedExpert.category} · v{selectedExpert.version}
                                </div>
                                {selectedExpert.installed && (
                                  <div className={styles['skills-list-desc']}>
                                    {t('settings.experts.marketInstalled')}
                                  </div>
                                )}
                              </div>
                              <button
                                className={tabStyles['settings-save-btn-sm']}
                                disabled={!selectedExpert.installable || installingExpertId === selectedExpert.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  installExpert(selectedExpert);
                                }}
                              >
                                {installingExpertId === selectedExpert.id
                                  ? t('settings.experts.installing')
                                  : selectedExpert.installed
                                    ? t('settings.experts.marketInstalled')
                                    : t('settings.experts.marketInstall')}
                              </button>
                            </div>
                            {selectedExpert.description && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <div className={styles['sv-description']}>
                                  <div className={styles['sv-description-label']}>简介</div>
                                  <div className={styles['sv-description-text']}>{selectedExpert.description}</div>
                                </div>
                              </div>
                            )}
                            {Array.isArray(selectedExpert.tags) && selectedExpert.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                {selectedExpert.tags.map(tag => (
                                  <span key={tag} className={styles['expert-tag-badge']}>#{tag}</span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className={styles['skills-list-desc']}>{t('settings.experts.marketSelectExpert')}</span>
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
