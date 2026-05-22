import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../stores';
import { useI18n } from './use-i18n';

/**
 * Manages the welcome placeholder text that is randomly selected
 * from translation tips whenever the welcome screen is visible.
 *
 * Reads Zustand state (`welcomeVisible`, `agentYuan`) and i18n (`t`, `locale`) directly.
 */
export function useWelcomePlaceholder() {
  const { t, locale } = useI18n();
  const welcomeVisible = useStore(s => s.welcomeVisible);
  const agentYuan = useStore(s => s.agentYuan);

  const pickRandomWelcomeTip = useCallback((): string => {
    const tipsRaw: unknown = t('welcome.placeholderTips');
    const tips = Array.isArray(tipsRaw)
      ? tipsRaw.filter((tip): tip is string => typeof tip === 'string' && tip.length > 0)
      : [];
    if (tips.length === 0) return '';
    return tips[Math.floor(Math.random() * tips.length)];
  }, [t]);

  const [welcomeTip, setWelcomeTip] = useState<string>(() =>
    welcomeVisible ? pickRandomWelcomeTip() : '',
  );

  const prevWelcomeVisibleRef = useRef(welcomeVisible);
  const prevLocaleRef = useRef(locale);
  useEffect(() => {
    const wasVisible = prevWelcomeVisibleRef.current;
    const previousLocale = prevLocaleRef.current;
    prevWelcomeVisibleRef.current = welcomeVisible;
    prevLocaleRef.current = locale;

    if (!welcomeVisible) {
      if (welcomeTip) setWelcomeTip('');
      return;
    }

    // false->true (re-enter welcome), locale ready/switch, or mount when i18n not yet ready
    if (!wasVisible || previousLocale !== locale || !welcomeTip) {
      const tip = pickRandomWelcomeTip();
      if (tip) setWelcomeTip(tip);
    }
  }, [welcomeVisible, locale, welcomeTip, pickRandomWelcomeTip]);

  // Placeholder
  const placeholderRef = useRef('');
  const getEditorPlaceholder = useCallback(() => placeholderRef.current, []);
  const placeholder = (() => {
    if (welcomeVisible && welcomeTip) return welcomeTip;
    const yuanPh = t(`yuan.placeholder.${agentYuan}`);
    return (yuanPh && !yuanPh.startsWith('yuan.')) ? yuanPh : t('input.placeholder');
  })();
  placeholderRef.current = placeholder;

  return { placeholder, getEditorPlaceholder };
}
