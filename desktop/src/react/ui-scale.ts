import * as sharedUiScale from '../../../shared/ui-scale.js';

export const UI_SCALE_MIN = sharedUiScale.UI_SCALE_MIN;
export const UI_SCALE_MAX = sharedUiScale.UI_SCALE_MAX;
export const DEFAULT_UI_SCALE = sharedUiScale.DEFAULT_UI_SCALE;
export const UI_SCALE_STEP = sharedUiScale.UI_SCALE_STEP;

export function normalizeUiScale(value: unknown, fallback = DEFAULT_UI_SCALE): number {
  return sharedUiScale.normalizeUiScale(value, fallback);
}

export function resolveEffectiveUiScale(userScale: unknown, viewport: { width: number; height: number }): number {
  return sharedUiScale.resolveEffectiveUiScale(userScale, viewport);
}

export function stepUiScale(current: unknown, deltaSteps: number): number {
  return sharedUiScale.stepUiScale(current, deltaSteps);
}

/** 界面缩放快捷键在设置文案中的修饰键标签 */
export function getUiZoomShortcutLabel(platformName?: string | null): string {
  return platformName === 'darwin' ? '⌘' : 'Ctrl';
}

export function applyUiScale(
  scale: number,
  root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
): number {
  const normalized = normalizeUiScale(scale);
  if (!root?.style) return normalized;
  root.style.setProperty('--ui-scale', String(normalized));
  // rem 体系随根字号缩放；避免 body.zoom（fixed 浮层在 Electron 下常不跟随）
  root.style.fontSize = normalized === 1 ? '' : `calc(16px * ${normalized})`;
  if (typeof document !== 'undefined') {
    document.body.style.zoom = '';
    const appRoot = document.getElementById('react-root');
    if (appRoot) appRoot.style.zoom = '';
  }
  return normalized;
}
