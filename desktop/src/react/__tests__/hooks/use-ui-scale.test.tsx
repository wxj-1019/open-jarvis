// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiScale } from '../../hooks/use-ui-scale';
import { useSettingsStore } from '../../settings/store';

vi.mock('../../settings/helpers', () => ({
  autoSaveConfig: vi.fn().mockResolvedValue(true),
}));

describe('useUiScale', () => {
  beforeEach(() => {
    document.body.style.zoom = '';
    document.documentElement.style.fontSize = '';
    document.documentElement.style.removeProperty('--ui-scale');
    const appRoot = document.getElementById('react-root');
    if (appRoot) appRoot.style.zoom = '';
    useSettingsStore.setState({ settingsConfig: { ui_scale: 1 } } as never);
    window.platform = { settingsChanged: vi.fn() } as unknown as typeof window.platform;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('applies effective scale on mount', () => {
    useSettingsStore.setState({ settingsConfig: { ui_scale: 1.1 } } as never);
    renderHook(() => useUiScale());
    expect(document.documentElement.style.fontSize).toContain('calc(');
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.1');
    expect(document.body.style.zoom).toBe('');
  });

  it('zooms with ctrl+wheel and persists', async () => {
    const { autoSaveConfig } = await import('../../settings/helpers');
    renderHook(() => useUiScale());

    await act(async () => {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true }));
    });

    expect(document.documentElement.style.fontSize).toContain('calc(');
    expect(autoSaveConfig).toHaveBeenCalledWith({ ui_scale: 1.05 }, { silent: true });
  });

  it('ignores ctrl+wheel inside data-ui-scale-wheel="ignore"', async () => {
    const { autoSaveConfig } = await import('../../settings/helpers');
    const ignored = document.createElement('div');
    ignored.setAttribute('data-ui-scale-wheel', 'ignore');
    document.body.appendChild(ignored);
    renderHook(() => useUiScale());

    await act(async () => {
      ignored.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true }));
    });

    expect(autoSaveConfig).not.toHaveBeenCalled();
    ignored.remove();
  });
});
