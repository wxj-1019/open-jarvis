import type { ActivePanel } from '../../types';
import { Plus, Gear, CaretLeft, Link, ChartLine, Clock, Globe } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { useStore } from '../../stores';
import { useAnyBrowserRunning } from '../../stores/browser-slice';
import { ArchivedChatsButton } from '../ArchivedChatsButton';
import { ChannelListSidebar } from '../channels/ChannelList';
import { RegionalErrorBoundary } from '../RegionalErrorBoundary';
import { SessionList } from '../SessionList';

interface ChatSidebarProps {
  open: boolean;
  includeChannels?: boolean;
  showSettingsButton?: boolean;
  showActivityBars?: boolean;
  onNewSession: () => void;
  onCollapse: () => void;
  onOpenSettings?: () => void;
  onTogglePanel?: (panel: ActivePanel) => void;
  region?: string;
}

function AutomationBadge() {
  const count = useStore(s => s.automationCount);
  return <span className="automation-count-badge">{count > 0 ? String(count) : ''}</span>;
}

function BridgeDot() {
  const connected = useStore(s => s.bridgeDotConnected);
  return <span className={`sidebar-bridge-dot${connected ? ' connected' : ''}`}></span>;
}

export function ChatSidebar({
  open,
  includeChannels = true,
  showSettingsButton = true,
  showActivityBars = true,
  onNewSession,
  onCollapse,
  onOpenSettings,
  onTogglePanel,
  region = 'sidebar',
}: ChatSidebarProps) {
  const currentAgentId = useStore(s => s.currentAgentId);
  const currentTab = useStore(s => s.currentTab);
  const browserRunning = useAnyBrowserRunning();
  const t = window.t ?? ((p: string) => p);

  return (
    <aside className={`sidebar${open ? '' : ' collapsed'}`} id="sidebar">
      <div className="sidebar-inner">
        <div className={`sidebar-chat-content${currentTab === 'chat' ? '' : ' hidden'}`}>
          <div className="sidebar-header">
            <span className="sidebar-title">{t('sidebar.title')}</span>
            <div className="sidebar-header-actions">
              <button className="sidebar-action-btn" id="newSessionBtn" title={t('sidebar.newChat')} onClick={onNewSession}>
                <PhosphorIcon icon={Plus} size={15} />
              </button>
              {showSettingsButton && (
                <button className="sidebar-action-btn" id="settingsBtn" title={t('settings.title')} onClick={onOpenSettings}>
                  <PhosphorIcon icon={Gear} size={14} />
                </button>
              )}
              <button className="sidebar-action-btn" id="sidebarCollapseBtn" title={t('sidebar.collapse')} onClick={onCollapse}>
                <PhosphorIcon icon={CaretLeft} size={14} />
              </button>
            </div>
          </div>

          {showActivityBars && (
            <>
              <button className="sidebar-activity-bar sidebar-bridge-card" id="bridgeBar" onClick={() => onTogglePanel?.('bridge')}>
                <PhosphorIcon icon={Link} size={14} />
                <span>{t('sidebar.bridgeShort')}</span>
                <BridgeDot />
              </button>
              <button className="sidebar-activity-bar" id="activityBar" onClick={() => onTogglePanel?.('activity')}>
                <PhosphorIcon icon={ChartLine} size={14} />
                <span>{t('sidebar.activity')}</span>
              </button>
              <button className="sidebar-activity-bar" id="automationBar" onClick={() => onTogglePanel?.('automation')}>
                <PhosphorIcon icon={Clock} size={14} />
                <span>{t('automation.title')}</span>
                <AutomationBadge />
              </button>
              <button className={`sidebar-activity-bar browser-bg-bar${browserRunning ? '' : ' hidden'}`} id="browserBgBar" title={t('browser.backgroundHint')} onClick={() => window.platform?.openBrowserViewer?.()}>
                <PhosphorIcon icon={Globe} size={14} className="browser-bg-globe" />
                <span>{t('browser.background')}</span>
              </button>
            </>
          )}

          <div className="session-list" id="sessionList">
            <RegionalErrorBoundary region={region} resetKeys={[currentAgentId]}>
              <SessionList />
            </RegionalErrorBoundary>
          </div>
          <div className="sidebar-footer">
            <ArchivedChatsButton />
          </div>
        </div>

        {includeChannels && (
          <div className={`sidebar-channel-content${currentTab === 'channels' ? '' : ' hidden'}`}>
            <ChannelListSidebar />
          </div>
        )}
      </div>
      <div className="resize-handle resize-handle-right" id="sidebarResizeHandle"></div>
    </aside>
  );
}
