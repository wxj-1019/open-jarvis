// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { applyUiScale, getUiZoomShortcutLabel } from '../ui-scale';

describe('getUiZoomShortcutLabel', () => {
  it('uses Command symbol on macOS', () => {
    expect(getUiZoomShortcutLabel('darwin')).toBe('⌘');
  });

  it('uses Ctrl elsewhere', () => {
    expect(getUiZoomShortcutLabel('win32')).toBe('Ctrl');
    expect(getUiZoomShortcutLabel(null)).toBe('Ctrl');
  });
});

describe('applyUiScale', () => {
  afterEach(() => {
    document.documentElement.style.fontSize = '';
    document.documentElement.style.removeProperty('--ui-scale');
    document.body.style.zoom = '';
  });

  it('drives --ui-scale and root font-size instead of body.zoom', () => {
    applyUiScale(0.9);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('0.9');
    expect(document.documentElement.style.fontSize).toContain('calc(');
    expect(document.body.style.zoom).toBe('');
  });
});
