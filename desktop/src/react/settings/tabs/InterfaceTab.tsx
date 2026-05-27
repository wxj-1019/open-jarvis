import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../store';
import { t, VALID_THEMES, autoSaveConfig } from '../helpers';
import { SelectWidget } from '@/ui';
import { Toggle } from '../widgets/Toggle';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { NumberInput } from '../components/NumberInput';
import { hanaFetch } from '../api';
import {
  applyEditorTypography,
  mergeEditorTypography,
  normalizeEditorTypography,
  type EditorMarkdownTypography,
} from '../../editor/typography';
import {
  isPaperTextureBlockedTheme,
  isPaperTextureEnabled,
} from '../../../shared/appearance-preferences';
import { persistAppearancePreferences } from '../../services/appearance-sync';
import {
  applyUiScale,
  DEFAULT_UI_SCALE,
  getUiZoomShortcutLabel,
  normalizeUiScale,
  resolveEffectiveUiScale,
} from '../../ui-scale';
import componentStyles from '../components/settings-components.module.css';
import styles from '../Settings.module.css';
import registry from '../../../shared/theme-registry';
import { EMOJI_STYLE_PRESETS, EMOJI_STYLE_IDS, getEmojiStylePreset, getSavedEmojiStyle, saveEmojiStyle } from '../../../shared/emoji-styles';

const platform = window.platform;
const i18n = window.i18n;

const THEME_NAME_KEYS: Record<string, string> = Object.fromEntries([
  ...Object.entries(registry.THEMES).map(([id, t]: [string, any]) => [id, t.i18nName]),
  [registry.AUTO_OPTION.id, registry.AUTO_OPTION.i18nName],
]);

const THEME_MODE_KEYS: Record<string, string> = Object.fromEntries([
  ...Object.entries(registry.THEMES).map(([id, t]: [string, any]) => [id, t.i18nMode]),
  [registry.AUTO_OPTION.id, registry.AUTO_OPTION.i18nMode],
]);

type MarkdownTypographyKey = keyof EditorMarkdownTypography;

interface AppearancePrefs {
  currentTheme: string;
  serifEnabled: boolean;
  paperTextureEnabled: boolean;
  paperTextureBlocked: boolean;
  leavesOverlayEnabled: boolean;
}

function readAppearancePrefs(): AppearancePrefs {
  const concreteTheme = document.documentElement.getAttribute('data-theme');
  return {
    currentTheme: registry.migrateSavedTheme(localStorage.getItem(registry.STORAGE_KEY)),
    serifEnabled: localStorage.getItem('hana-font-serif') !== '0',
    paperTextureEnabled: isPaperTextureEnabled(localStorage),
    paperTextureBlocked: isPaperTextureBlockedTheme(concreteTheme),
    leavesOverlayEnabled: localStorage.getItem('hana-leaves-overlay') === '1',
  };
}

const EDITOR_FONT_SIZE_ROWS: Array<{
  key: MarkdownTypographyKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}> = [
  { key: 'bodyFontSize', label: 'settings.editor.markdownBodyFontSize', hint: 'settings.editor.markdownBodyFontSizeHint', min: 12, max: 24 },
  { key: 'heading1FontSize', label: 'settings.editor.markdownHeading1FontSize', hint: 'settings.editor.markdownHeading1FontSizeHint', min: 16, max: 40 },
  { key: 'heading2FontSize', label: 'settings.editor.markdownHeading2FontSize', hint: 'settings.editor.markdownHeading2FontSizeHint', min: 15, max: 34 },
  { key: 'heading3FontSize', label: 'settings.editor.markdownHeading3FontSize', hint: 'settings.editor.markdownHeading3FontSizeHint', min: 14, max: 30 },
  { key: 'heading4FontSize', label: 'settings.editor.markdownHeading4FontSize', hint: 'settings.editor.markdownHeading4FontSizeHint', min: 13, max: 28 },
  { key: 'heading5FontSize', label: 'settings.editor.markdownHeading5FontSize', hint: 'settings.editor.markdownHeading5FontSizeHint', min: 12, max: 26 },
  { key: 'heading6FontSize', label: 'settings.editor.markdownHeading6FontSize', hint: 'settings.editor.markdownHeading6FontSizeHint', min: 12, max: 24 },
];

export function InterfaceTab() {
  const settingsConfig = useSettingsStore(s => s.settingsConfig);
  const platformName = useSettingsStore(s => s.platformName);
  const [appearancePrefs, setAppearancePrefs] = useState<AppearancePrefs>(() => readAppearancePrefs());
  const refreshAppearancePrefs = useCallback(() => {
    setAppearancePrefs(readAppearancePrefs());
  }, []);
  const syncAppearancePrefs = useCallback((patch: Record<string, unknown>) => {
    persistAppearancePreferences(patch).catch((err) => {
      console.warn('[settings] appearance sync failed:', err);
    });
  }, []);
  const {
    currentTheme,
    serifEnabled,
    paperTextureEnabled,
    paperTextureBlocked,
    leavesOverlayEnabled,
  } = appearancePrefs;
  
  const [emojiStyle, setEmojiStyle] = useState(() => getSavedEmojiStyle());
  
  const saveEmojiStyleHandler = useCallback((styleId: string) => {
    const success = saveEmojiStyle(styleId);
    if (success) {
      setEmojiStyle(styleId);
      window.dispatchEvent(new CustomEvent('hana-settings', {
        detail: { type: 'emoji-style-changed', styleId },
      }));
      platform?.settingsChanged?.('emoji-style-changed', { styleId });
      useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
    }
  }, []);
  const editorTypography = useMemo(
    () => normalizeEditorTypography(settingsConfig?.editor),
    [settingsConfig?.editor],
  );
  const [contextPrivacy, setContextPrivacy] = useState<string>('standard');

  // 加载当前隐私级别
  useEffect(() => {
    let cancelled = false;
    hanaFetch('/api/deep-context/privacy')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data?.level) setContextPrivacy(data.level); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const saveContextPrivacy = async (level: string) => {
    const previous = contextPrivacy;
    setContextPrivacy(level);
    try {
      const res = await hanaFetch('/api/deep-context/privacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      if (res.ok) {
        useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
      } else {
        setContextPrivacy(previous);
      }
    } catch {
      setContextPrivacy(previous);
    }
  };

  const hardwareAccelerationEnabled = settingsConfig?.hardware_acceleration !== false;
  const uiScale = normalizeUiScale(settingsConfig?.ui_scale);
  const uiScalePercent = Math.round(uiScale * 100);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveUiScalePercent = Math.round(resolveEffectiveUiScale(uiScale, viewport) * 100);

  const saveUiScale = async (scale: number) => {
    const normalized = normalizeUiScale(scale);
    const previousConfig = useSettingsStore.getState().settingsConfig || {};
    useSettingsStore.setState({ settingsConfig: { ...previousConfig, ui_scale: normalized } });
    applyUiScale(resolveEffectiveUiScale(normalized, { width: window.innerWidth, height: window.innerHeight }));
    platform?.settingsChanged?.('ui-scale-changed', { ui_scale: normalized });

    const saved = await autoSaveConfig({ ui_scale: normalized }, { silent: true });
    if (saved) {
      useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
      return;
    }

    useSettingsStore.setState({ settingsConfig: previousConfig });
    applyUiScale(resolveEffectiveUiScale(normalizeUiScale(previousConfig.ui_scale), {
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    platform?.settingsChanged?.('ui-scale-changed', { ui_scale: normalizeUiScale(previousConfig.ui_scale) });
  };

  const saveEditorTypography = async (patch: Partial<EditorMarkdownTypography>) => {
    const previousConfig = useSettingsStore.getState().settingsConfig || {};
    const previousEditor = previousConfig.editor;
    const next = mergeEditorTypography(previousEditor, { markdown: patch });
    useSettingsStore.setState({ settingsConfig: { ...previousConfig, editor: next } });
    applyEditorTypography(next);
    platform?.settingsChanged?.('editor-typography-changed', { editor: next });

    const saved = await autoSaveConfig({ editor: next }, { silent: true });
    if (saved) {
      useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
      return;
    }

    const restored = normalizeEditorTypography(previousEditor);
    useSettingsStore.setState({ settingsConfig: previousConfig });
    applyEditorTypography(restored);
    platform?.settingsChanged?.('editor-typography-changed', { editor: restored });
  };

  const saveHardwareAcceleration = async (next: boolean) => {
    const previousConfig = useSettingsStore.getState().settingsConfig || {};
    useSettingsStore.setState({ settingsConfig: { ...previousConfig, hardware_acceleration: next } });

    const saved = await autoSaveConfig({ hardware_acceleration: next }, { silent: true });
    if (saved) {
      platform?.settingsChanged?.('hardware-acceleration-changed', { hardware_acceleration: next });
      useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
      return;
    }

    useSettingsStore.setState({ settingsConfig: previousConfig });
  };

  const locale = settingsConfig?.locale || 'zh-CN';
  const localeVal = ['zh-CN', 'zh-TW', 'ja', 'ko', 'en'].includes(locale) ? locale
    : locale.startsWith('zh') ? 'zh-CN'
    : locale.startsWith('ja') ? 'ja'
    : locale.startsWith('ko') ? 'ko'
    : 'en';

  // 时区
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const commonTz = [
    'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore',
    'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Kolkata',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Pacific/Auckland', 'Australia/Sydney',
  ];
  const tzSet = new Set(commonTz);
  if (browserTz && !tzSet.has(browserTz)) commonTz.unshift(browserTz);
  const currentTz = settingsConfig?.timezone || browserTz || 'Asia/Shanghai';
  if (!tzSet.has(currentTz) && currentTz !== browserTz) commonTz.unshift(currentTz);
  const tzOptions = commonTz.map(tz => {
    try {
      const offset = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date()).find((p: any) => p.type === 'timeZoneName')?.value || '';
      return { value: tz, label: `${tz.replace(/_/g, ' ')}  (${offset})` };
    } catch { return { value: tz, label: tz.replace(/_/g, ' ') }; }
  });

  return (
    <div className={`${styles['settings-tab-content']} ${styles['active']}`} data-tab="interface">
      <SettingsSection title={t('settings.appearance.theme')} variant="flush">
        <div className={styles['theme-options']}>
          {VALID_THEMES.map(theme => (
            <button
              key={theme}
              className={`${styles['theme-card']}${currentTheme === theme ? ' ' + styles['active'] : ''}`}
              data-theme={theme}
              onClick={() => {
                window.setTheme?.(theme);
                platform?.settingsChanged?.('theme-changed', { theme });
                syncAppearancePrefs({ theme });
                refreshAppearancePrefs();
              }}
            >
              <div className={styles['theme-card-name']}>{t(THEME_NAME_KEYS[theme])}</div>
              <div className={styles['theme-card-mode']}>{t(THEME_MODE_KEYS[theme])}</div>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.appearance.title')}>
        <SettingsRow
          label={t('settings.appearance.serifFont')}
          hint={t('settings.appearance.serifFontHint')}
          control={
            <Toggle
              on={serifEnabled}
              onChange={(next) => {
                window.setSerifFont?.(next);
                platform?.settingsChanged?.('font-changed', { serif: next });
                syncAppearancePrefs({ serif: next });
                refreshAppearancePrefs();
              }}
            />
          }
        />
        <SettingsRow
          label={t('settings.appearance.paperTexture')}
          hint={paperTextureBlocked
            ? t('settings.appearance.paperTextureDarkDisabledHint')
            : t('settings.appearance.paperTextureHint')}
          control={
            <Toggle
              on={paperTextureBlocked ? false : paperTextureEnabled}
              disabled={paperTextureBlocked}
              onChange={(next) => {
                window.setPaperTexture?.(next);
                platform?.settingsChanged?.('paper-texture-changed', { enabled: next });
                syncAppearancePrefs({ paperTexture: next });
                refreshAppearancePrefs();
              }}
            />
          }
        />
        <SettingsRow
          label={t('settings.appearance.leavesOverlay')}
          hint={t('settings.appearance.leavesOverlayHint')}
          control={
            <Toggle
              on={leavesOverlayEnabled}
              onChange={(next) => {
                localStorage.setItem('hana-leaves-overlay', next ? '1' : '0');
                window.dispatchEvent(new CustomEvent('hana-settings', {
                  detail: { type: 'leaves-overlay-changed', enabled: next },
                }));
                platform?.settingsChanged?.('leaves-overlay-changed', { enabled: next });
                syncAppearancePrefs({ leavesOverlay: next });
                refreshAppearancePrefs();
              }}
            />
          }
        />
        
        <div className={styles['emoji-style-divider']} />
        
        <div className={styles['emoji-style-section']}>
          <h3 className={styles['emoji-style-section-title']}>{t('emojiStyle.title')}</h3>
          <p className={styles['emoji-style-section-desc']}>{t('emojiStyle.description')}</p>
          <div className={styles['emoji-style-grid']}>
            {EMOJI_STYLE_IDS.map(styleId => {
              const preset = EMOJI_STYLE_PRESETS[styleId];
              const isActive = emojiStyle === styleId;
              return (
                <button
                  key={styleId}
                  role="radio"
                  aria-checked={isActive}
                  aria-label={t(preset.name)}
                  className={`${styles['emoji-style-card']}${isActive ? ` ${styles['active']}` : ''}`}
                  onClick={() => saveEmojiStyleHandler(styleId)}
                >
                  <div className={styles['emoji-style-preview']}>{preset.preview}</div>
                  <div className={styles['emoji-style-name']}>{t(preset.name)}</div>
                  <div className={styles['emoji-style-desc']}>{t(preset.description)}</div>
                </button>
              );
            })}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.interface.system')}>
        <SettingsRow
          label={t('settings.interface.uiScale')}
          hint={t('settings.interface.uiScaleHint', {
            preference: uiScalePercent,
            effective: effectiveUiScalePercent,
            shortcut: getUiZoomShortcutLabel(platformName),
          })}
          control={
            <div
              className={componentStyles.numberInputRow}
              data-ui-scale-wheel="ignore"
            >
              <NumberInput
                value={uiScalePercent}
                onChange={(value) => saveUiScale(value / 100)}
                unit="%"
                min={75}
                max={150}
                step={5}
                commitOnBlur
              />
              <button
                type="button"
                className={styles['settings-btn-secondary']}
                disabled={uiScale === DEFAULT_UI_SCALE}
                onClick={() => saveUiScale(DEFAULT_UI_SCALE)}
              >
                {t('settings.interface.uiScaleReset')}
              </button>
            </div>
          }
        />
        <SettingsRow
          label={t('settings.interface.hardwareAcceleration')}
          hint={t('settings.interface.hardwareAccelerationHint')}
          control={
            <Toggle
              on={hardwareAccelerationEnabled}
              onChange={saveHardwareAcceleration}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t('settings.interface.contextPrivacy')}>
        <SettingsRow
          label={t('settings.interface.contextPrivacy')}
          hint={t('settings.interface.contextPrivacyHint')}
          control={
            <div className={styles['privacy-level-group']}>
              {(['minimal', 'standard', 'full'] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  className={`${styles['privacy-level-btn']}${contextPrivacy === level ? ` ${styles['active']}` : ''}`}
                  onClick={() => saveContextPrivacy(level)}
                >
                  <span className={styles['privacy-level-name']}>
                    {t(`settings.interface.contextPrivacy${level.charAt(0).toUpperCase() + level.slice(1)}`)}
                  </span>
                  <span className={styles['privacy-level-desc']}>
                    {t(`settings.interface.contextPrivacy${level.charAt(0).toUpperCase() + level.slice(1)}Desc`)}
                  </span>
                </button>
              ))}
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection title={t('settings.editor.title')}>
        {EDITOR_FONT_SIZE_ROWS.map(row => (
          <SettingsRow
            key={row.key}
            label={t(row.label)}
            hint={t(row.hint)}
            control={
              <NumberInput
                value={editorTypography.markdown[row.key]}
                onChange={(value) => saveEditorTypography({ [row.key]: value })}
                unit="px"
                min={row.min}
                max={row.max}
                commitOnBlur
              />
            }
          />
        ))}
        <SettingsRow
          label={t('settings.editor.markdownLineHeight')}
          hint={t('settings.editor.markdownLineHeightHint')}
          control={
            <NumberInput
              value={editorTypography.markdown.lineHeight}
              onChange={(value) => saveEditorTypography({ lineHeight: value })}
              min={1.2}
              max={2.2}
              step={0.05}
              precision="float"
              commitOnBlur
            />
          }
        />
        <SettingsRow
          label={t('settings.editor.markdownContentPadding')}
          hint={t('settings.editor.markdownContentPaddingHint')}
          control={
            <NumberInput
              value={editorTypography.markdown.contentPadding}
              onChange={(value) => saveEditorTypography({ contentPadding: value })}
              unit="px"
              min={0}
              max={64}
              commitOnBlur
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t('settings.locale.title')}>
        <SettingsRow
          label={t('settings.locale.language')}
          hint={t('settings.locale.languageHint')}
          control={
            <SelectWidget
              options={[
                { value: 'zh-CN', label: '简体中文' },
                { value: 'zh-TW', label: '繁體中文' },
                { value: 'ja', label: '日本語' },
                { value: 'ko', label: '한국어' },
                { value: 'en', label: 'English' },
              ]}
              value={localeVal}
              onChange={async (val) => {
                await autoSaveConfig({ locale: val }, { silent: true });
                await i18n?.load(val);
                if (i18n) i18n.defaultName = useSettingsStore.getState().agentName;
                useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
                useSettingsStore.setState({});
              }}
            />
          }
        />
        <SettingsRow
          label={t('settings.locale.timezone')}
          hint={t('settings.locale.timezoneHint')}
          control={
            <SelectWidget
              options={tzOptions}
              value={currentTz}
              onChange={(val) => autoSaveConfig({ timezone: val })}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
