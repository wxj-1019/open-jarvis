import React, { useCallback, useRef, useState } from 'react';
import { VALID_THEMES } from '../helpers';
import registry from '../../../shared/theme-registry';
import styles from './ThemeGallery.module.css';

const platform = window.platform;

interface ThemeGalleryProps {
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  t: (key: string) => string;
}

interface ThemePreviewProps {
  themeId: string;
  themeName: string;
  themeMode: string;
  isActive: boolean;
  onClick: () => void;
}

function ThemePreviewCard({ themeId, themeName, themeMode, isActive, onClick }: ThemePreviewProps) {
  const isDark = themeId.includes('midnight');
  
  return (
    <button
      type="button"
      className={`${styles.galleryCard}${isActive ? ` ${styles.active}` : ''}`}
      data-theme={themeId}
      aria-pressed={isActive}
      onClick={onClick}
    >
      <div className={styles.previewContainer}>
        <div className={styles.previewMockup} data-theme={themeId}>
          <div className={styles.previewHeader}>
            <div className={styles.previewDot} />
            <div className={styles.previewDot} />
            <div className={styles.previewDot} />
          </div>
          <div className={styles.previewContent}>
            <div className={styles.previewBubble} data-side="left">
              <div className={styles.previewBubbleLine} />
              <div className={styles.previewBubbleLineShort} />
            </div>
            <div className={styles.previewBubble} data-side="right">
              <div className={styles.previewBubbleLine} />
              <div className={styles.previewBubbleLineShort} />
            </div>
            <div className={styles.previewInput}>
              <div className={styles.previewInputLine} />
            </div>
          </div>
        </div>
      </div>
      <div className={styles.cardFooter}>
        <div className={styles.themeName}>{themeName}</div>
        <div className={styles.themeMode}>{themeMode}</div>
        {isActive && <div className={styles.activeIndicator} />}
      </div>
    </button>
  );
}

export function ThemeGallery({ currentTheme, onThemeChange, t }: ThemeGalleryProps) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleThemeChange = useCallback((theme: string) => {
    if (isTransitioning || theme === currentTheme) return;
    
    setIsTransitioning(true);
    onThemeChange(theme);
    
    setTimeout(() => {
      setIsTransitioning(false);
    }, 600);
  }, [currentTheme, isTransitioning, onThemeChange]);

  const THEME_NAME_KEYS: Record<string, string> = Object.fromEntries([
    ...Object.entries(registry.THEMES).map(([id, themeDef]) => [id, themeDef.i18nName]),
    [registry.AUTO_OPTION.id, registry.AUTO_OPTION.i18nName],
  ]);

  const THEME_MODE_KEYS: Record<string, string> = Object.fromEntries([
    ...Object.entries(registry.THEMES).map(([id, themeDef]) => [id, themeDef.i18nMode]),
    [registry.AUTO_OPTION.id, registry.AUTO_OPTION.i18nMode],
  ]);

  return (
    <div className={styles.galleryWrapper}>
      <div 
        ref={galleryRef}
        className={`${styles.galleryGrid}${isTransitioning ? ` ${styles.transitioning}` : ''}`}
      >
        {VALID_THEMES.map(theme => (
          <ThemePreviewCard
            key={theme}
            themeId={theme}
            themeName={t(THEME_NAME_KEYS[theme])}
            themeMode={t(THEME_MODE_KEYS[theme])}
            isActive={currentTheme === theme}
            onClick={() => handleThemeChange(theme)}
          />
        ))}
      </div>
    </div>
  );
}
