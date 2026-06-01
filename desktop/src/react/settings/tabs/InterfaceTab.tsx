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
import tabStyles from '../Settings.module.css';
import styles from './InterfaceTab.module.css';
import registry from '../../../shared/theme-registry';
import { EMOJI_STYLE_PRESETS, EMOJI_STYLE_IDS, getSavedEmojiStyle, saveEmojiStyle } from '../../../shared/emoji-styles';
import { ThemeGallery } from './ThemeGallery';

const platform = window.platform;
const i18n = window.i18n;

const THEME_NAME_KEYS: Record<string, string> = Object.fromEntries([
  ...Object.entries(registry.THEMES).map(([id, themeDef]: [string, { i18nName: string }]) => [id, themeDef.i18nName]),
  [registry.AUTO_OPTION.id, registry.AUTO_OPTION.i18nName],
]);

const THEME_MODE_KEYS: Record<string, string> = Object.fromEntries([
  ...Object.entries(registry.THEMES).map(([id, themeDef]: [string, { i18nMode: string }]) => [id, themeDef.i18nMode]),
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

const EDITOR_BODY_ROWS: Array<{
  key: MarkdownTypographyKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}> = [
  { key: 'bodyFontSize', label: 'settings.editor.markdownBodyFontSize', hint: 'settings.editor.markdownBodyFontSizeHint', min: 12, max: 24 },
];

const EDITOR_HEADING_ROWS: Array<{
  key: MarkdownTypographyKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}> = [
  { key: 'heading1FontSize', label: 'settings.editor.markdownHeading1FontSize', hint: 'settings.editor.markdownHeading1FontSizeHint', min: 16, max: 40 },
  { key: 'heading2FontSize', label: 'settings.editor.markdownHeading2FontSize', hint: 'settings.editor.markdownHeading2FontSizeHint', min: 15, max: 34 },
  { key: 'heading3FontSize', label: 'settings.editor.markdownHeading3FontSize', hint: 'settings.editor.markdownHeading3FontSizeHint', min: 14, max: 30 },
  { key: 'heading4FontSize', label: 'settings.editor.markdownHeading4FontSize', hint: 'settings.editor.markdownHeading4FontSizeHint', min: 13, max: 28 },
  { key: 'heading5FontSize', label: 'settings.editor.markdownHeading5FontSize', hint: 'settings.editor.markdownHeading5FontSizeHint', min: 12, max: 26 },
  { key: 'heading6FontSize', label: 'settings.editor.markdownHeading6FontSize', hint: 'settings.editor.markdownHeading6FontSizeHint', min: 12, max: 24 },
];

function EditorTypographyRows({
  rows,
  typography,
  onSave,
}: {
  rows: typeof EDITOR_BODY_ROWS;
  typography: ReturnType<typeof normalizeEditorTypography>;
  onSave: (patch: Partial<EditorMarkdownTypography>) => void;
}) {
  return (
    <div className={styles.editorGrid}>
      {rows.map(row => (
        <SettingsRow
          key={row.key}
          label={t(row.label)}
          hint={t(row.hint)}
          control={
            <NumberInput
              value={typography.markdown[row.key]}
              onChange={(value) => onSave({ [row.key]: value })}
              unit="px"
              min={row.min}
              max={row.max}
              commitOnBlur
            />
          }
        />
      ))}
    </div>
  );
}

export function InterfaceTab() {
  const settingsConfig = useSettingsStore(s => s.settingsConfig);
  const platformName = useSettingsStore(s => s.platformName);
  const [appearancePrefs, setAppearancePrefs] = useState<AppearancePrefs>(() => readAppearancePrefs());
  const refreshAppearancePrefs = useCallback(() => {
    setAppearancePrefs(readAppearancePrefs());
  }, []);
  const applyThemeSafely = useCallback((theme: string) => {
    const applyFallback = () => {
      const { stored, concrete } = registry.resolveSavedTheme(
        theme,
        window.matchMedia('(prefers-color-scheme: dark)').matches,
      );
      window.localStorage.setItem(registry.STORAGE_KEY, stored);
      document.documentElement.setAttribute('data-theme', concrete);
      const themeSheet = document.getElementById('themeSheet') as HTMLLinkElement | null;
      const entry = registry.THEMES[concrete];
      if (themeSheet && entry?.cssPath) themeSheet.href = entry.cssPath;
    };

    try {
      if (typeof window.setTheme === 'function') {
        window.setTheme(theme);
        return;
      }
    } catch (err) {
      console.warn('[settings] window.setTheme failed, using fallback:', err);
    }

    try {
      if (typeof window.applyTheme === 'function') {
        window.applyTheme(theme);
        const { stored } = registry.resolveSavedTheme(
          theme,
          window.matchMedia('(prefers-color-scheme: dark)').matches,
        );
        // 确保选中态来源(localStorage)与本次点击一致
        window.localStorage.setItem(registry.STORAGE_KEY, stored);
        return;
      }
    } catch (err) {
      console.warn('[settings] window.applyTheme fallback failed:', err);
    }

    try {
      applyFallback();
      return;
    } catch (err) {
      console.warn('[settings] theme fallback apply failed:', err);
    }
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
        .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
      return { value: tz, label: `${tz.replace(/_/g, ' ')}  (${offset})` };
    } catch { return { value: tz, label: tz.replace(/_/g, ' ') }; }
  });

  const privacyLevels = ['minimal', 'standard', 'full'] as const;

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="interface">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.interface.pageDesc')}</p>

        <SettingsSection title={t('settings.appearance.theme')} variant="flush">
          <SettingsSection.Note>{t('settings.interface.themeSectionNote')}</SettingsSection.Note>
          <ThemeGallery
            currentTheme={currentTheme}
            onThemeChange={(theme) => {
              applyThemeSafely(theme);
              platform?.settingsChanged?.('theme-changed', { theme });
              syncAppearancePrefs({ theme });
              refreshAppearancePrefs();
            }}
            t={t}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.appearance.title')}>
          <SettingsSection.Note>{t('settings.interface.appearanceSectionNote')}</SettingsSection.Note>
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

          <div className={styles.emojiBlock}>
            <SettingsSection.SubBlock title={t('emojiStyle.title')}>
              <SettingsSection.Note>{t('emojiStyle.description')}</SettingsSection.Note>
              <div className={styles.emojiGrid} role="radiogroup" aria-label={t('emojiStyle.title')}>
              {EMOJI_STYLE_IDS.map(styleId => {
                const preset = EMOJI_STYLE_PRESETS[styleId];
                const isActive = emojiStyle === styleId;
                return (
                  <button
                    key={styleId}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`${styles.emojiCard}${isActive ? ` ${styles.emojiCardActive}` : ''}`}
                    onClick={() => saveEmojiStyleHandler(styleId)}
                  >
                    <div className={styles.emojiPreview}>{preset.preview}</div>
                    <div className={styles.emojiName}>{t(preset.name)}</div>
                    <div className={styles.emojiDesc}>{t(preset.description)}</div>
                  </button>
                );
              })}
              </div>
            </SettingsSection.SubBlock>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.interface.system')}>
          <SettingsSection.Note>{t('settings.interface.systemSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.interface.uiScale')}
            hint={t('settings.interface.uiScaleHint', {
              preference: uiScalePercent,
              effective: effectiveUiScalePercent,
              shortcut: getUiZoomShortcutLabel(platformName),
            })}
            control={
              <div className={styles.scaleRow} data-ui-scale-wheel="ignore">
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
                  className={tabStyles['settings-btn-secondary']}
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
          <SettingsSection.Note>{t('settings.interface.contextPrivacySectionNote')}</SettingsSection.Note>
          <div className={styles.privacyShell}>
            <div className={styles.privacyGrid} role="radiogroup" aria-label={t('settings.interface.contextPrivacy')}>
              {privacyLevels.map(level => {
                const isActive = contextPrivacy === level;
                const labelKey = `settings.interface.contextPrivacy${level.charAt(0).toUpperCase() + level.slice(1)}` as const;
                const descKey = `${labelKey}Desc` as const;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`${styles.privacyOption}${isActive ? ` ${styles.privacyOptionActive}` : ''}`}
                    onClick={() => saveContextPrivacy(level)}
                  >
                    <span className={styles.privacyName}>{t(labelKey)}</span>
                    <span className={styles.privacyDesc}>{t(descKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.editor.title')}>
          <SettingsSection.Note>{t('settings.editor.sectionNote')}</SettingsSection.Note>

          <div className={styles.editorGroups}>
            <SettingsSection.SubBlock title={t('settings.editor.groupBody')}>
              <EditorTypographyRows
                rows={EDITOR_BODY_ROWS}
                typography={editorTypography}
                onSave={saveEditorTypography}
              />
            </SettingsSection.SubBlock>

            <SettingsSection.SubBlock title={t('settings.editor.groupHeadings')}>
              <EditorTypographyRows
                rows={EDITOR_HEADING_ROWS}
                typography={editorTypography}
                onSave={saveEditorTypography}
              />
            </SettingsSection.SubBlock>

            <SettingsSection.SubBlock title={t('settings.editor.groupLayout')}>
              <div className={styles.layoutGrid}>
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
              </div>
            </SettingsSection.SubBlock>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.locale.title')}>
          <SettingsSection.Note>{t('settings.locale.sectionNote')}</SettingsSection.Note>
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
    </div>
  );
}
