/**
 * BrowserCard — 浏览器浮动卡片
 *
 * 当前 session 浏览器运行时，在聊天区顶部显示浮动卡片。
 * 由 App.tsx 在 .main-content 内直接渲染。
 */

import { useCallback } from 'react';
import { Globe, X } from '@phosphor-icons/react';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { useStore } from '../stores';
import { updateKeyed } from '../stores/create-keyed-slice';
import { hanaFetch } from '../hooks/use-hana-fetch';
import { useBrowserState } from '../stores/browser-slice';

export function BrowserCard() {
  const { running: browserRunning, url: browserUrl, thumbnail: browserThumbnail } = useBrowserState();

  const handleClick = useCallback(() => {
    window.platform?.openBrowserViewer?.();
  }, []);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const sessionPath = useStore.getState().currentSessionPath;
    if (sessionPath) {
      updateKeyed('browserBySession', sessionPath,
        { running: false, url: null, thumbnail: null },
      );
    }
    window.platform?.browserEmergencyStop?.();
    if (sessionPath) {
      hanaFetch('/api/browser/close-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionPath }),
      }).catch(err => console.warn('[browser] close session failed:', err));
    }
  }, []);

  if (!browserRunning) return null;

  let displayUrl = '';
  try {
    if (browserUrl) displayUrl = new URL(browserUrl).hostname;
  } catch {
    displayUrl = browserUrl || '';
  }

  return (
    <div className="browser-floating-card" id="browserFloatingCard" onClick={handleClick}>
      <div className="browser-floating-info">
        <div className="browser-floating-icon">
          <PhosphorIcon icon={Globe} size={16} />
        </div>
        <div className="browser-floating-text">
          <div className="browser-floating-label">{(window.t ?? ((p: string) => p))('browser.using')}</div>
          {displayUrl && (
            <div className="browser-floating-url">{displayUrl}</div>
          )}
        </div>
      </div>
      <div className="browser-floating-right">
        {browserThumbnail && (
          <img
            className="browser-floating-thumb"
            src={`data:image/jpeg;base64,${browserThumbnail}`}
            alt=""
            draggable={false}
          />
        )}
        <button className="browser-floating-close" title={(window.t ?? ((p: string) => p))('browser.close')} onClick={handleClose}>
          <PhosphorIcon icon={X} size={14} />
        </button>
      </div>
    </div>
  );
}
