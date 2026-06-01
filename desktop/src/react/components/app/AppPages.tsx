import type { ReactNode } from 'react';
import { useStore } from '../../stores';
import { ActivityPanel } from '../ActivityPanel';
import { AutomationPanel } from '../AutomationPanel';
import { BridgePanel } from '../BridgePanel';
import { FloatingCapabilitiesPanel } from '../FloatingCapabilitiesPanel';
import { PreviewPanel } from '../PreviewPanel';
import { PluginPageView } from '../plugin/PluginPageView';
import { ChannelMessages, ChannelMembers, ChannelInput, ChannelReadonly, ChannelAgentActivityPanel, ChannelAgentSettingsPanel } from '../ChannelsPanel';
import { ChannelHeader } from '../channels/ChannelHeader';
import { MainContent } from '../../MainContent';
import { ChatPage } from './ChatPage';
import { VoiceChatPage } from './VoiceChatPage';
import { WorkspaceCompanionRail } from './WorkspaceCompanionRail';
import './PageTransitions.css';

const tr = (key: string, vars?: Record<string, string | number>) => window.t?.(key, vars) ?? key;

function ChannelInputArea() {
  const currentChannel = useStore(s => s.currentChannel);
  const isDM = useStore(s => s.channelIsDM);

  if (!currentChannel) return null;

  if (isDM) {
    return (
      <div className="channel-readonly-notice">
        <ChannelReadonly />
      </div>
    );
  }

  return (
    <div className="channel-input-area">
      <ChannelInput />
    </div>
  );
}

function ChannelInspectorShell({ children }: { children: ReactNode }) {
  return (
    <aside className="channel-inspector-rail" id="channelInspector" data-channel-inspector="">
      <div className="resize-handle resize-handle-left" id="channelInspectorResizeHandle"></div>
      {children}
    </aside>
  );
}

function ChannelInspectorPanel() {
  const channelInfoName = useStore(s => s.channelInfoName);
  const isDM = useStore(s => s.channelIsDM);
  const currentChannel = useStore(s => s.currentChannel);

  if (!currentChannel) return null;

  if (isDM) {
    return (
      <ChannelInspectorShell>
        <div className="channel-info-stack">
          <div className="jian-card">
            <div className="channel-info-section">
              <div className="channel-info-label">{tr('channel.dmLabel')}</div>
              <div className="channel-members-list">
                <ChannelMembers />
              </div>
            </div>
          </div>
          <ChannelAgentSettingsPanel />
          <ChannelAgentActivityPanel />
        </div>
      </ChannelInspectorShell>
    );
  }

  return (
    <ChannelInspectorShell>
      <div className="channel-info-stack">
        <div className="jian-card">
          <div className="channel-info-section">
            <div className="channel-info-label">{tr('channel.info')}</div>
            <div className="channel-info-name">{channelInfoName}</div>
          </div>
          <div className="channel-info-section">
            <div className="channel-info-label">{tr('channel.members')}</div>
            <div className="channel-members-list">
              <ChannelMembers />
            </div>
          </div>
        </div>
        <ChannelAgentSettingsPanel />
        <ChannelAgentActivityPanel />
      </div>
    </ChannelInspectorShell>
  );
}

function ChannelPage() {
  const currentChannel = useStore(s => s.currentChannel);

  return (
    <div className="channel-page">
      <div className="channel-view active">
        {currentChannel ? (
          <>
            <ChannelHeader />
            <div className="channel-messages">
              <ChannelMessages />
            </div>
            <ChannelInputArea />
          </>
        ) : (
          <div className="channel-select-empty">
            {tr('channel.selectHint')}
          </div>
        )}
      </div>
      <ChannelInspectorPanel />
    </div>
  );
}

function PluginPage({ pluginId }: { pluginId: string }) {
  return (
    <div className="plugin-page-shell">
      <PluginPageView pluginId={pluginId} />
    </div>
  );
}

const PLUGIN_PREFIX = 'plugin:' as const;

export function AppPages() {
  const currentTab = useStore(s => s.currentTab);
  const currentPage = useStore(s => s.currentPage);
  const isPluginTab = typeof currentTab === 'string' && currentTab.startsWith(PLUGIN_PREFIX);

  return (
    <>
      <MainContent>
        {currentTab === 'chat' && (
          <>
            {currentPage === 'chat' && (
              <div className="chat-page-transition" key="chat">
                <ChatPage />
              </div>
            )}
            {currentPage === 'voice' && (
              <div className="voice-page-transition" key="voice">
                <VoiceChatPage />
              </div>
            )}
          </>
        )}
        {currentTab === 'channels' && (
          <div className="channel-page-transition" key="channels">
            <ChannelPage />
          </div>
        )}
        {isPluginTab && (
          <div className="plugin-page-transition" key={`plugin-${currentTab}`}>
            <PluginPage pluginId={currentTab.slice(PLUGIN_PREFIX.length)} />
          </div>
        )}
        <ActivityPanel />
        <AutomationPanel />
        <BridgePanel />
        <FloatingCapabilitiesPanel />
      </MainContent>

      {currentTab === 'chat' && currentPage === 'chat' && <PreviewPanel />}
      <WorkspaceCompanionRail />
    </>
  );
}
