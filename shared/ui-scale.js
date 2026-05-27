/** UI 缩放：用户偏好 × 窗口自适应，供桌面端与 preferences 共用。 */

export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.5;
export const DEFAULT_UI_SCALE = 1;
export const UI_SCALE_STEP = 0.05;

/** 设计基准视口；窗口更小时按比例缩小，更大时不放大超过 1×。 */
export const UI_SCALE_BASE_VIEWPORT = Object.freeze({ width: 1200, height: 720 });

function readNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return NaN;
}

export function normalizeUiScale(value, fallback = DEFAULT_UI_SCALE) {
  const parsed = readNumber(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(parsed.toFixed(2))));
}

/**
 * 窗口较小时的自适应系数（仅缩小，不放大）。
 * @param {{ width: number, height: number }} viewport
 */
export function computeViewportUiScaleFactor(viewport) {
  const width = Math.max(1, readNumber(viewport?.width) || 1);
  const height = Math.max(1, readNumber(viewport?.height) || 1);
  const wRatio = width / UI_SCALE_BASE_VIEWPORT.width;
  const hRatio = height / UI_SCALE_BASE_VIEWPORT.height;
  return Math.min(1, Math.max(0.8, Math.min(wRatio, hRatio)));
}

/** 用户缩放 × 视口自适应后的最终比例。 */
export function resolveEffectiveUiScale(userScale, viewport) {
  const user = normalizeUiScale(userScale);
  const factor = computeViewportUiScaleFactor(viewport);
  return normalizeUiScale(user * factor, user);
}

export function stepUiScale(current, deltaSteps) {
  const next = normalizeUiScale(current) + deltaSteps * UI_SCALE_STEP;
  return normalizeUiScale(next);
}
