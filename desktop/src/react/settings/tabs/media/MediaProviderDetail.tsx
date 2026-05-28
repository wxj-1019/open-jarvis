import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../../store';
import { hanaFetch } from '../../api';
import { invalidateConfigCache } from '../../../hooks/use-config';
import { t } from '../../helpers';
import { useAnchoredDropdown } from '../../hooks/useAnchoredDropdown';
import { X, CaretDown } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../../ui/PhosphorIcon';
import { SelectWidget } from '@/ui';
import tabStyles from '../../Settings.module.css';
import detailStyles from './MediaProviderDetail.module.css';

interface Props {
  providerId: string;
  provider: {
    displayName?: string;
    hasCredentials: boolean;
    models: { id: string; name: string }[];
    availableModels: { id: string; name: string }[];
  };
  config: { defaultImageModel?: { id: string; provider: string }; providerDefaults?: Record<string, any> };
  onSaveConfig: (updates: any) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function MediaProviderDetail({ providerId, provider, config, onSaveConfig, onRefresh }: Props) {
  const showToast = useSettingsStore(s => s.showToast);
  const defaults = config.providerDefaults?.[providerId] || {};
  const isDefault = (modelId: string) =>
    config.defaultImageModel?.id === modelId && config.defaultImageModel?.provider === providerId;

  const updateDefault = (key: string, value: any) => {
    const current = config.providerDefaults || {};
    const provDefaults = { ...current[providerId], [key]: value };
    onSaveConfig({ providerDefaults: { ...current, [providerId]: provDefaults } });
  };

  // ── Model add/remove (same PUT /api/config path as Provider page) ──

  const addModel = async (modelId: string) => {
    try {
      const res = await hanaFetch('/api/providers/summary');
      const summary = await res.json();
      const currentModels = summary.providers?.[providerId]?.models || [];
      await hanaFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { [providerId]: { models: [...currentModels, { id: modelId, type: 'image' }] } } }),
      });
      invalidateConfigCache();
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    }
  };

  const removeModel = async (modelId: string) => {
    try {
      const res = await hanaFetch('/api/providers/summary');
      const summary = await res.json();
      const currentModels = summary.providers?.[providerId]?.models || [];
      const filtered = currentModels.filter((m: any) => (typeof m === 'object' ? m.id : m) !== modelId);
      await hanaFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { [providerId]: { models: filtered } } }),
      });
      invalidateConfigCache();
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    }
  };

  // ── Dropdown state (same pattern as ProviderModelList) ──

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeDropdown = useCallback(() => setDropdownOpen(false), []);

  const addedIds = new Set(provider.models.map(m => m.id));
  const allModels = [...provider.models, ...provider.availableModels];
  const query = search.toLowerCase();
  const filtered = query ? allModels.filter(m => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)) : allModels;

  const panelStyle = useAnchoredDropdown({
    open: dropdownOpen,
    triggerRef,
    panelRef,
    onClose: closeDropdown,
    widthOffset: 80,
  });

  return (
    <div className={tabStyles['pv-detail-inner']}>
      <div className={tabStyles['pv-detail-header']}>
        <h2 className={tabStyles['pv-detail-title']}>{provider.displayName || providerId}</h2>
      </div>

      <div className={detailStyles.credentialBadge}>
        <span className={`${detailStyles.credentialDot} ${provider.hasCredentials ? detailStyles.credentialOn : detailStyles.credentialOff}`} />
        {provider.hasCredentials ? t('settings.media.credentialOk') : t('settings.media.credentialMissing')}
      </div>

      <div className={tabStyles['pv-models']}>
        {/* Added model list */}
        {provider.models.length > 0 && (
          <div className={tabStyles['pv-fav-section']}>
            <div className={tabStyles['pv-fav-title']}>
              {t('settings.media.models')}
              <span className={tabStyles['pv-models-count']}>{provider.models.length}</span>
            </div>
            <div className={tabStyles['pv-fav-list']}>
              {provider.models.map(m => (
                <div key={m.id} className={tabStyles['pv-fav-item']}>
                  <span className={tabStyles['pv-fav-item-name']} title={m.id}>{m.name || m.id}</span>
                  <span className={tabStyles['pv-fav-item-id']}>{m.id}</span>
                  {isDefault(m.id) && (
                    <span className={detailStyles.defaultBadge}>
                      {t('settings.media.default')}
                    </span>
                  )}
                  <div className={tabStyles['pv-fav-item-actions']}>
                    <button type="button" className={tabStyles['pv-fav-item-remove']} onClick={() => removeModel(m.id)} title={t('settings.api.removeModel')}>
                      <PhosphorIcon icon={X} size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add model dropdown */}
        <div className={tabStyles['pv-models-action-row']}>
          <button type="button" ref={triggerRef} className={tabStyles['pv-model-dropdown-trigger']} onClick={() => setDropdownOpen(!dropdownOpen)}>
            <span>{t('settings.media.addModel')}</span>
            <PhosphorIcon icon={CaretDown} size={12} />
          </button>
        </div>

        {dropdownOpen && createPortal(
          <div
            className={tabStyles['pv-model-dropdown-panel']}
            ref={panelRef}
            style={panelStyle}
            data-media-model-dropdown="true"
          >
            <input
              className={tabStyles['pv-model-dropdown-search']}
              type="text"
              placeholder={t('settings.api.searchModel')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className={tabStyles['pv-model-dropdown-list']}>
              {filtered.map(m => {
                const isAdded = addedIds.has(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    className={`${tabStyles['pv-model-dropdown-option']}${isAdded ? ` ${tabStyles['added']}` : ''}`}
                    onClick={() => { if (!isAdded) addModel(m.id); }}
                  >
                    <span className={tabStyles['pv-model-dropdown-option-name']}>{m.name || m.id}</span>
                    {isAdded && <span className={tabStyles['pv-model-dropdown-option-check']}>{'\u2713'}</span>}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className={tabStyles['pv-model-dropdown-empty']}>{t('settings.providers.noModels')}</div>
              )}
            </div>
          </div>,
          document.body,
        )}
      </div>

      {/* Provider-specific defaults */}
      {provider.models.length > 0 && (
        <div className={detailStyles.defaultsBlock}>
          <div className={detailStyles.defaultsTitle}>{t('settings.media.providerDefaults')}</div>
          <div className={detailStyles.defaultsGrid}>
            <label className={detailStyles.defaultField}>
              <span className={detailStyles.defaultLabel}>{t('settings.media.size')}</span>
              <SelectWidget
                value={defaults.size || ''}
                onChange={(v) => updateDefault('size', v || undefined)}
                options={[
                  { value: '2K', label: '2K' },
                  { value: '4K', label: '4K' },
                ]}
              />
            </label>
            <label className={detailStyles.defaultField}>
              <span className={detailStyles.defaultLabel}>{t('settings.media.aspectRatio')}</span>
              <SelectWidget
                value={defaults.aspect_ratio || ''}
                onChange={(v) => updateDefault('aspect_ratio', v || undefined)}
                options={[
                  { value: '', label: t('settings.media.defaultOption') },
                  { value: '1:1', label: '1:1' },
                  { value: '4:3', label: '4:3' },
                  { value: '3:4', label: '3:4' },
                  { value: '16:9', label: '16:9' },
                  { value: '9:16', label: '9:16' },
                  { value: '3:2', label: '3:2' },
                  { value: '2:3', label: '2:3' },
                  { value: '21:9', label: '21:9' },
                ]}
              />
            </label>
            <label className={detailStyles.defaultField}>
              <span className={detailStyles.defaultLabel}>{t('settings.media.format')}</span>
              <SelectWidget
                value={defaults.format || ''}
                onChange={(v) => updateDefault('format', v || undefined)}
                options={[
                  { value: '', label: t('settings.media.defaultOption') },
                  { value: 'png', label: 'PNG' },
                  { value: 'jpeg', label: 'JPEG' },
                  { value: 'webp', label: 'WebP' },
                ]}
              />
            </label>
            <label className={detailStyles.defaultField}>
              <span className={detailStyles.defaultLabel}>{t('settings.media.quality')}</span>
              <SelectWidget
                value={defaults.quality || ''}
                onChange={(v) => updateDefault('quality', v || undefined)}
                options={[
                  { value: '', label: t('settings.media.defaultOption') },
                  { value: 'low', label: t('settings.media.qualityLow') },
                  { value: 'medium', label: t('settings.media.qualityMedium') },
                  { value: 'high', label: t('settings.media.qualityHigh') },
                ]}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
