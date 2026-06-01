import type { MouseEventHandler } from 'react';
import { SidebarSimple, Plus, FileText } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { ChannelTabBar } from '../channels/ChannelTabBar';
import { PageModeTabs } from '../PageModeTabs';
import { WidgetButtons } from '../plugin/WidgetButtons';
import { WindowControls } from '../WindowControls';

interface AppTitlebarProps {
  sidebarOpen: boolean;
  jianOpen: boolean;
  onToggleSidebar: () => void;
  onToggleJian: () => void;
  onNewSession?: () => void;
  previewOpen?: boolean;
  onTogglePreview?: () => void;
  centerTitle?: string | null;
  showNewSessionButton?: boolean;
  showPreviewToggle?: boolean;
  showChannelTabs?: boolean;
  showWidgetButtons?: boolean;
  currentTab?: string;
  onLeftMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onRightMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onToggleMouseLeave?: MouseEventHandler<HTMLButtonElement>;
}

export function AppTitlebar({
  sidebarOpen,
  jianOpen,
  onToggleSidebar,
  onToggleJian,
  onNewSession,
  previewOpen = false,
  onTogglePreview,
  centerTitle = null,
  showNewSessionButton = false,
  showPreviewToggle = false,
  showChannelTabs = true,
  showWidgetButtons = true,
  currentTab,
  onLeftMouseEnter,
  onRightMouseEnter,
  onToggleMouseLeave,
}: AppTitlebarProps) {
  const t = window.t ?? ((p: string) => p);

  return (
    <div className="titlebar">
      <div className="tb-left-group">
        <button
          className={`tb-toggle tb-toggle-left${sidebarOpen ? ' active' : ''}`}
          id="tbToggleLeft"
          title={t('sidebar.toggle')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleSidebar}
          onMouseEnter={onLeftMouseEnter}
          onMouseLeave={onToggleMouseLeave}
        >
          <PhosphorIcon icon={SidebarSimple} size={16} />
        </button>
        {showNewSessionButton && onNewSession && (
          <button
            className="tb-toggle tb-new-session"
            type="button"
            title={t('sidebar.newChat')}
            aria-label={t('sidebar.newChat')}
            data-mobile-titlebar-action="new-session"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onNewSession}
          >
            <PhosphorIcon icon={Plus} size={17} />
          </button>
        )}
      </div>
      <div className="tb-center-group">
        {centerTitle && (
          <div className="tb-center-title" aria-label={t('titlebar.currentChatTitle')} title={centerTitle}>
            <span>{centerTitle}</span>
          </div>
        )}
        {showChannelTabs && <ChannelTabBar />}
        {currentTab === 'chat' && <PageModeTabs />}
      </div>
      <div className="tb-right-group">
        {showWidgetButtons && <WidgetButtons />}
        {showPreviewToggle && onTogglePreview && (
          <button
            className={`tb-toggle tb-toggle-preview${previewOpen ? ' active' : ''}`}
            id="tbTogglePreview"
            title={t('preview.toggle')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onTogglePreview}
          >
            <PhosphorIcon icon={FileText} size={16} />
          </button>
        )}
        <button
          className={`tb-toggle tb-toggle-right${jianOpen ? ' active' : ''}`}
          id="tbToggleRight"
          title={t('sidebar.jian')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleJian}
          onMouseEnter={onRightMouseEnter}
          onMouseLeave={onToggleMouseLeave}
        >
          <PhosphorIcon icon={SidebarSimple} size={16} />
        </button>
      </div>
      <WindowControls />
    </div>
  );
}
