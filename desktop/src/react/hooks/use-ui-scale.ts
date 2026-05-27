import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../settings/store';
import { autoSaveConfig } from '../settings/helpers';
import {
  applyUiScale,
  DEFAULT_UI_SCALE,
  normalizeUiScale,
  resolveEffectiveUiScale,
  stepUiScale,
} from '../ui-scale';

function readViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function isZoomModifier(e: KeyboardEvent | WheelEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

/**
 * 应用 UI 缩放：用户偏好 × 小窗口自适应；支持 Ctrl/Cmd + 滚轮与 +/- 快捷键。
 */
export function useUiScale(): void {
  const userScale = useSettingsStore((s) => normalizeUiScale(s.settingsConfig?.ui_scale));
  const userScaleRef = useRef(userScale);
  userScaleRef.current = userScale;

  const applyForViewport = useCallback((scale: number) => {
    applyUiScale(resolveEffectiveUiScale(scale, readViewport()));
  }, []);

  useEffect(() => {
    applyForViewport(userScale);
  }, [userScale, applyForViewport]);

  useEffect(() => {
    const onResize = () => applyForViewport(userScaleRef.current);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyForViewport]);

  const persistUserScale = useCallback(async (next: number) => {
    const normalized = normalizeUiScale(next);
    const previousConfig = useSettingsStore.getState().settingsConfig || {};
    useSettingsStore.setState({ settingsConfig: { ...previousConfig, ui_scale: normalized } });
    applyForViewport(normalized);
    window.platform?.settingsChanged?.('ui-scale-changed', { ui_scale: normalized });

    const saved = await autoSaveConfig({ ui_scale: normalized }, { silent: true });
    if (!saved) {
      useSettingsStore.setState({ settingsConfig: previousConfig });
      applyForViewport(normalizeUiScale(previousConfig.ui_scale));
    }
  }, [applyForViewport]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!isZoomModifier(e) || e.altKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest('[data-ui-scale-wheel="ignore"]')) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      void persistUserScale(stepUiScale(userScaleRef.current, delta));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isZoomModifier(e) || e.altKey) return;
      const key = e.key;
      if (key === '=' || key === '+') {
        e.preventDefault();
        void persistUserScale(stepUiScale(userScaleRef.current, 1));
      } else if (key === '-' || key === '_') {
        e.preventDefault();
        void persistUserScale(stepUiScale(userScaleRef.current, -1));
      } else if (key === '0') {
        e.preventDefault();
        void persistUserScale(DEFAULT_UI_SCALE);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [persistUserScale]);
}
