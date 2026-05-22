/**
 * WindowControls.tsx — Windows/Linux 自绘窗口控制按钮（最小化、最大化、关闭）
 *
 * 共享组件，同时用于主窗口（App.tsx）和设置窗口（SettingsApp.tsx）。
 * macOS 和 Web 环境下不渲染。
 */

import { useEffect, useState, useCallback } from 'react';
import { Minus, Square, Copy, X } from '@phosphor-icons/react';
import { PhosphorIcon } from '../ui/PhosphorIcon';

export function WindowControls() {
  const t = window.t ?? ((p: string) => p);
  const [isWin, setIsWin] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const p = window.platform;
    if (!p?.getPlatform) return;
    p.getPlatform().then((plat: string) => {
      if (plat !== 'darwin' && plat !== 'web') setIsWin(true);
    });
    if (p.onMaximizeChange) {
      p.onMaximizeChange((val: boolean) => setMaximized(val));
    }
    p.windowIsMaximized?.().then((val: boolean) => setMaximized(val));
  }, []);

  const minimize = useCallback(() => window.platform?.windowMinimize?.(), []);
  const maximize = useCallback(() => window.platform?.windowMaximize?.(), []);
  const close = useCallback(() => window.platform?.windowClose?.(), []);

  if (!isWin) return null;

  return (
    <div className="window-controls">
      <button className="wc-btn wc-minimize" title={t('window.minimize')} onClick={minimize}>
        <PhosphorIcon icon={Minus} size={12} />
      </button>
      <button className="wc-btn wc-maximize" title={t('window.maximize')} onClick={maximize}>
        <PhosphorIcon icon={maximized ? Copy : Square} size={12} />
      </button>
      <button className="wc-btn wc-close" title={t('window.close')} onClick={close}>
        <PhosphorIcon icon={X} size={12} />
      </button>
    </div>
  );
}
