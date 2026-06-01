/**
 * App.tsx — React 根组件（纯布局编排）
 *
 * 初始化逻辑在 app-init.ts，拖拽/主内容区在 MainContent.tsx。
 * 此文件只负责 titlebar + sidebar + 主区域 + overlays 的组装。
 */

import { useEffect, lazy, Suspense, useRef } from 'react';
import { useStore } from './stores';
import type { ActivePanel } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RegionalErrorBoundary } from './components/RegionalErrorBoundary';

const SkillViewerOverlay = lazy(() => import('./components/SkillViewerOverlay').then(m => ({ default: m.SkillViewerOverlay })));
import { ChannelsPanel } from './components/ChannelsPanel';
import { ChannelCreateOverlay } from './components/channels/ChannelCreateOverlay';
import { SidebarLayout, toggleSidebar } from './components/SidebarLayout';
import { FloatPreviewCard, useFloatCard } from './components/FloatPreviewCard';
import { useSidebarResize } from './hooks/use-sidebar-resize';
import { useUiScale } from './hooks/use-ui-scale';
import { createNewSession } from './stores/session-actions';
import { toggleJianSidebar } from './stores/desk-actions';
import { ToastContainer } from './components/ToastContainer';
import { InputContextMenu } from './components/InputContextMenu';
import { StatusBar } from './components/StatusBar';
import { LeavesOverlay } from './components/LeavesOverlay';
import { MediaViewer } from './components/shared/MediaViewer/MediaViewer';
import { SelectionFloatingInput } from './components/floating-input/SelectionFloatingInput';
import { SettingsModalShell } from './components/SettingsModalShell';
import { initTheme, initDragPrevention } from './bootstrap';
import { initApp } from './app-init';
import { openSettingsModal } from './stores/settings-modal-actions';
import { AppTitlebar } from './components/app/AppTitlebar';
import { ChatSidebar } from './components/app/ChatSidebar';
import { AppPages } from './components/app/AppPages';

const t = (key: string, vars?: Record<string, string | number>): string => window.t?.(key, vars) ?? key;

// ── 主题 + drag 阻止（import 时立即执行） ──
initTheme();
initDragPrevention();

// ── 面板切换 ──

function togglePanel(panel: ActivePanel) {
  const s = useStore.getState();
  s.setActivePanel(s.activePanel === panel ? null : panel);
}

function ConnectionStatus() {
  const connected = useStore(s => s.connected);
  const statusKey = useStore(s => s.statusKey);
  const statusVars = useStore(s => s.statusVars);
  return (
    <div className={`connection-status${connected ? ' connected' : ''}`}>
      <span className="status-dot"></span>
      <span className="status-text">{statusKey ? t(statusKey, statusVars) : ''}</span>
    </div>
  );
}

// ── App 根组件 ──

/* ── 帧率检测：持续低帧率时自动降级动画 ── */
function usePerformanceMonitor() {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const lowFpsFrames = useRef(0);

  useEffect(() => {
    let rafId: number;
    const CHECK_INTERVAL = 3000;   // 每 3 秒评估一次
    const FPS_THRESHOLD = 30;      // 低于 30fps 视为卡顿
    const CONSECUTIVE_THRESHOLD = 2; // 连续 2 次低帧率触发降级

    function checkFrameRate() {
      const now = performance.now();
      const elapsed = now - lastTime.current;
      const fps = (frameCount.current / elapsed) * 1000;

      if (fps < FPS_THRESHOLD) {
        lowFpsFrames.current++;
        if (lowFpsFrames.current >= CONSECUTIVE_THRESHOLD) {
          document.body.classList.add('hana-auto-performance');
        }
      } else {
        lowFpsFrames.current = 0;
        document.body.classList.remove('hana-auto-performance');
      }

      frameCount.current = 0;
      lastTime.current = now;
    }

    function tick() {
      frameCount.current++;
      rafId = requestAnimationFrame(tick);
    }

    const intervalId = window.setInterval(checkFrameRate, CHECK_INTERVAL);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
      document.body.classList.remove('hana-auto-performance');
    };
  }, []);
}

function App() {
  useSidebarResize();
  useUiScale();
  usePerformanceMonitor();
  // 订阅 locale 变化，驱动整棵树重渲染
  useStore(s => s.locale);
  const sidebarOpen = useStore(s => s.sidebarOpen);
  const jianOpen = useStore(s => s.jianOpen);
  const currentTab = useStore(s => s.currentTab);
  const isPluginTab = typeof currentTab === 'string' && currentTab.startsWith('plugin:');
  const { floatCard, show: showFloat, scheduleHide: scheduleFloatHide, cancelHide: cancelFloatHide, hide: hideFloat } = useFloatCard();

  useEffect(() => {
    initApp().catch((err: unknown) => {
      console.error('[init] 初始化异常:', err);
      window.platform?.appReady?.();
    });
  }, []);

  return (
    <ErrorBoundary>
      {/* Headless behavior components */}
      <SidebarLayout />
      <ChannelsPanel />

      {/* ── Titlebar ── */}
      <AppTitlebar
        sidebarOpen={sidebarOpen}
        jianOpen={jianOpen}
        onToggleSidebar={() => { hideFloat(); toggleSidebar(); }}
        onToggleJian={() => { hideFloat(); toggleJianSidebar(); }}
        onLeftMouseEnter={(e) => showFloat('left', e.currentTarget)}
        onRightMouseEnter={(e) => showFloat('right', e.currentTarget)}
        onToggleMouseLeave={scheduleFloatHide}
        currentTab={currentTab}
      />

      {/* ── App body ── */}
      <div className="app">
        <ChatSidebar
          open={sidebarOpen && !isPluginTab}
          onNewSession={() => { void createNewSession(); }}
          onCollapse={() => toggleSidebar()}
          onOpenSettings={() => openSettingsModal()}
          onTogglePanel={togglePanel}
        />

        <RegionalErrorBoundary region="app-pages" resetKeys={[currentTab]}>
          <AppPages />
        </RegionalErrorBoundary>
      </div>

      {/* Connection status */}
      <ConnectionStatus />

      {/* Channel create overlay */}
      <ChannelCreateOverlay />

      {/* Skill viewer overlay */}
      <Suspense fallback={null}><SkillViewerOverlay /></Suspense>

      {/* Float preview card */}
      {floatCard && (
        <FloatPreviewCard
          state={floatCard}
          onMouseEnter={cancelFloatHide}
          onMouseLeave={scheduleFloatHide}
          onAction={hideFloat}
        />
      )}

      {/* Connection status bar */}
      <StatusBar />

      {/* Leaves shadow overlay */}
      <LeavesOverlay />

      {/* Media viewer overlay */}
      <MediaViewer />

      {/* Selection floating input */}
      <SelectionFloatingInput />

      {/* In-window settings overlay */}
      <SettingsModalShell />

      {/* Input context menu (cut/copy/paste) */}
      <InputContextMenu />

      {/* Toast notifications */}
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
