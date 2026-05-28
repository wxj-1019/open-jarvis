import { useMemo, useState } from 'react';
import { Check, DeviceMobile, Desktop, Image as ImageIcon, Scissors } from '@phosphor-icons/react';
import { t } from '../helpers';
import tabStyles from '../Settings.module.css';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { NumberInput } from '../components/NumberInput';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import {
  SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT,
  SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT_STORAGE_KEY,
  readScreenshotSegmentVisibleCharLimit,
} from '../../utils/screenshot-segments';
import styles from './SharingTab.module.css';

import lightMobile from '../../../assets/screenshot-previews/light-mobile.png';
import lightDesktop from '../../../assets/screenshot-previews/light-desktop.png';
import darkMobile from '../../../assets/screenshot-previews/dark-mobile.png';
import darkDesktop from '../../../assets/screenshot-previews/dark-desktop.png';
import sakuraMobile from '../../../assets/screenshot-previews/sakura-mobile.png';
import sakuraDesktop from '../../../assets/screenshot-previews/sakura-desktop.png';

const PREVIEW_IMAGES: Record<string, string> = {
  'light-mobile': lightMobile,
  'light-desktop': lightDesktop,
  'dark-mobile': darkMobile,
  'dark-desktop': darkDesktop,
  'sakura-mobile': sakuraMobile,
  'sakura-desktop': sakuraDesktop,
};

const COLOR_THEMES = [
  { key: 'light' as const, bg: '#F8F5ED', color: '#3B3D3F', accent: '#537D96' },
  { key: 'dark' as const, bg: '#2D4356', color: '#C8D1D8', accent: '#A76F6F' },
  { key: 'sakura' as const, bg: '#8ABDCE', color: '#FFFFFF', accent: 'rgba(255,255,255,0.7)' },
];

const WIDTH_OPTIONS = [
  { width: 'mobile' as const, titleKey: 'mobileTitle', descKey: 'mobileDesc', icon: DeviceMobile },
  { width: 'desktop' as const, titleKey: 'desktopTitle', descKey: 'desktopDesc', icon: Desktop },
];

type ScreenshotColor = (typeof COLOR_THEMES)[number]['key'];
type ScreenshotWidth = (typeof WIDTH_OPTIONS)[number]['width'];

function readStoredColor(): ScreenshotColor {
  const value = localStorage.getItem('hana-screenshot-color');
  return value === 'dark' || value === 'sakura' ? value : 'light';
}

function readStoredWidth(): ScreenshotWidth {
  return localStorage.getItem('hana-screenshot-width') === 'desktop' ? 'desktop' : 'mobile';
}

export function SharingTab() {
  const [screenshotColor, setScreenshotColor] = useState<ScreenshotColor>(readStoredColor);
  const [screenshotWidth, setScreenshotWidth] = useState<ScreenshotWidth>(readStoredWidth);
  const [segmentLimit, setSegmentLimit] = useState(() => readScreenshotSegmentVisibleCharLimit());

  const previewSrc = PREVIEW_IMAGES[`${screenshotColor}-${screenshotWidth}`];
  const isDefaultSegment = segmentLimit === SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT;

  const previewTags = useMemo(() => ([
    t(`settings.screenshot.${screenshotColor}`),
    t(`settings.screenshot.${screenshotWidth === 'mobile' ? 'mobile' : 'desktop'}`),
  ]), [screenshotColor, screenshotWidth]);

  const persistColor = (key: ScreenshotColor) => {
    setScreenshotColor(key);
    localStorage.setItem('hana-screenshot-color', key);
  };

  const persistWidth = (width: ScreenshotWidth) => {
    setScreenshotWidth(width);
    localStorage.setItem('hana-screenshot-width', width);
  };

  const handleSegmentLimitChange = (value: number) => {
    const next = Math.max(1_000, Math.min(100_000, Math.round(value)));
    setSegmentLimit(next);
    if (next === SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT) {
      localStorage.removeItem(SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT_STORAGE_KEY);
    } else {
      localStorage.setItem(SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT_STORAGE_KEY, String(next));
    }
  };

  const resetSegmentLimit = () => {
    setSegmentLimit(SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT);
    localStorage.removeItem(SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT_STORAGE_KEY);
  };

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="sharing">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.screenshot.desc')}</p>

        <SettingsSection
          title={t('settings.screenshot.previewTitle')}
          className={styles.previewSection}
          variant="flush"
        >
          <div className={styles.previewFrame}>
            <div
              className={`${styles.previewImageWrap}${screenshotWidth === 'desktop' ? ` ${styles.previewImageWrapDesktop}` : ''}`}
            >
              {previewSrc ? (
                <img
                  className={styles.previewImage}
                  src={previewSrc}
                  alt={t('settings.screenshot.previewTitle')}
                  draggable={false}
                />
              ) : null}
            </div>
            <div className={styles.previewCaption}>
              <PhosphorIcon icon={ImageIcon} size={14} />
              {previewTags.map((tag) => (
                <span key={tag} className={styles.previewTag}>{tag}</span>
              ))}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.screenshot.color')}>
          <SettingsSection.Note>{t('settings.screenshot.colorHint')}</SettingsSection.Note>
          <div className={styles.colorGrid}>
            {COLOR_THEMES.map(({ key, bg, color, accent }) => {
              const active = screenshotColor === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.colorCard}${active ? ` ${styles.colorCardActive}` : ''}`}
                  style={{ background: bg }}
                  aria-pressed={active}
                  onClick={() => persistColor(key)}
                >
                  {active && (
                    <span className={styles.colorCheck} aria-hidden>
                      <PhosphorIcon icon={Check} size={12} weight="bold" />
                    </span>
                  )}
                  <span className={styles.colorName} style={{ color }}>{t(`settings.screenshot.${key}`)}</span>
                  <span className={styles.colorSub} style={{ color: accent }}>
                    {t(`settings.screenshot.${key}Sub`)}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.screenshot.width')}>
          <SettingsSection.Note>{t('settings.screenshot.widthHint')}</SettingsSection.Note>
          <div className={styles.widthGrid}>
            {WIDTH_OPTIONS.map(({ width, titleKey, descKey, icon }) => {
              const active = screenshotWidth === width;
              const src = PREVIEW_IMAGES[`${screenshotColor}-${width}`];
              return (
                <button
                  key={width}
                  type="button"
                  className={`${styles.widthCard}${active ? ` ${styles.widthCardActive}` : ''}`}
                  aria-pressed={active}
                  onClick={() => persistWidth(width)}
                >
                  {active && (
                    <span className={styles.widthCheck} aria-hidden>
                      <PhosphorIcon icon={Check} size={12} weight="bold" />
                    </span>
                  )}
                  <div className={styles.widthPreview}>
                    {src ? <img src={src} alt={t(`settings.screenshot.${titleKey}`)} draggable={false} /> : null}
                  </div>
                  <div className={styles.widthBody}>
                    <span className={styles.widthIcon}>
                      <PhosphorIcon icon={icon} size={18} />
                    </span>
                    <div className={styles.widthText}>
                      <div className={styles.widthTitle}>{t(`settings.screenshot.${titleKey}`)}</div>
                      <div className={styles.widthDesc}>{t(`settings.screenshot.${descKey}`)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.screenshot.segmentTitle')}>
          <SettingsRow
            label={t('settings.screenshot.segmentLimitLabel')}
            hint={t('settings.screenshot.segmentLimitHint')}
            control={
              <NumberInput
                value={segmentLimit}
                onChange={handleSegmentLimitChange}
                min={1000}
                max={100000}
                step={1000}
                fieldWidth="wide"
                unit={t('settings.screenshot.segmentLimitUnit')}
              />
            }
          />
          <SettingsSection.Footer>
            <div className={styles.segmentFooter}>
              <span className={styles.segmentDefaultHint}>
                <PhosphorIcon icon={Scissors} size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                {t('settings.screenshot.segmentDefault', {
                  count: SCREENSHOT_SEGMENT_VISIBLE_CHAR_LIMIT.toLocaleString(),
                })}
              </span>
              <button
                type="button"
                className={tabStyles['settings-btn-secondary']}
                onClick={resetSegmentLimit}
                disabled={isDefaultSegment}
              >
                {t('settings.screenshot.resetSegment')}
              </button>
            </div>
          </SettingsSection.Footer>
        </SettingsSection>
      </div>
    </div>
  );
}
