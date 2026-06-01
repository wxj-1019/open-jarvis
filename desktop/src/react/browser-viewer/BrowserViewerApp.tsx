/**
 * BrowserViewerApp.tsx — 浏览器查看器工具栏
 *
 * 工具栏只负责按钮和标题显示。
 * WebContentsView 由 main.cjs 管理，attach 在工具栏下方区域。
 */

import { useState, useEffect } from 'react';
import { initTheme } from '../bootstrap';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { X, CaretLeft, CaretRight, ArrowsClockwise, Stop } from '@phosphor-icons/react';

const t = (key: string): string => window.t?.(key) ?? key;
declare function setTheme(name: string): void;

initTheme();

export function BrowserViewerApp() {
  const [title, setTitle] = useState('');
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  useEffect(() => {
    const hana = window.hana;

    // 监听主题切换
    hana?.onSettingsChanged?.((type: string, data: any) => {
      if (type === 'theme-changed' && data?.theme) setTheme(data.theme);
    });

    // 接收浏览器状态更新
    hana?.onBrowserUpdate?.((data: any) => {
      if (data.title) setTitle(data.title);
      if (data.canGoBack !== undefined) setCanBack(data.canGoBack);
      if (data.canGoForward !== undefined) setCanForward(data.canGoForward);
      if (data.running === false) {
        setTitle('');
        setCanBack(false);
        setCanForward(false);
      }
    });

    // i18n
    window.i18n?.load?.(navigator.language || 'zh');
  }, []);

  const hana = window.hana;

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          {/* Close */}
          <button
            className="tb-btn close-btn"
            title={t?.('browser.closeBtn') || ''}
            onClick={() => hana?.closeBrowserViewer?.()}
          >
            <PhosphorIcon icon={X} size={14} />
          </button>

          <div className="nav-sep" />

          {/* Back */}
          <button
            className={`tb-btn${canBack ? '' : ' disabled'}`}
            title={t?.('browser.back') || ''}
            onClick={() => hana?.browserGoBack?.()}
          >
            <PhosphorIcon icon={CaretLeft} size={14} />
          </button>

          {/* Forward */}
          <button
            className={`tb-btn${canForward ? '' : ' disabled'}`}
            title={t?.('browser.forward') || ''}
            onClick={() => hana?.browserGoForward?.()}
          >
            <PhosphorIcon icon={CaretRight} size={14} />
          </button>

          {/* Reload */}
          <button
            className="tb-btn"
            title={t?.('browser.reload') || ''}
            onClick={() => hana?.browserReload?.()}
          >
            <PhosphorIcon icon={ArrowsClockwise} size={14} />
          </button>
        </div>

        {/* Drag area + title */}
        <div className="toolbar-drag">
          <span className="page-title">{title}</span>
        </div>

        {/* Emergency stop */}
        <div className="toolbar-right">
          <button
            className="stop-btn"
            title={t?.('browser.emergencyStop') || ''}
            onClick={() => hana?.browserEmergencyStop?.()}
          >
            <PhosphorIcon icon={Stop} size={14} />
          </button>
        </div>
      </div>

      {/* Card shadow frame (WebContentsView sits on top) */}
      <div className="card-frame" />
    </>
  );
}
