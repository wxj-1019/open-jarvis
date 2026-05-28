/**
 * ChatLeftPanel — 对话区域左侧悬浮面板
 *
 * 默认收起为一条细线，hover 或点击时展开显示内容。
 * 展示当前会话的 MCP 和 Skill 状态。
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../../stores';
import { hanaFetch } from '../../hooks/use-hana-fetch';
import type { CwdSkillInfo } from '../../stores/desk-slice';
import type { McpState, McpConnector } from '../../settings/tabs/mcp/types';
import styles from './ChatLeftPanel.module.css';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { Lightning, Plugs, PlugsConnected, ArrowsClockwise, Gear } from '@phosphor-icons/react';
import { openSettingsModal as openSettingsModalAction } from '../../stores/settings-modal-actions';

const EMPTY_MCP_STATE: McpState = {
  enabled: false,
  connectors: [],
  agentConfig: { connectors: {} },
};

const HOVER_EXPAND_DELAY = 120;
const HOVER_COLLAPSE_DELAY = 250;

/* ── 加载 MCP 状态 ── */
async function loadMcpState(agentId: string): Promise<McpState> {
  try {
    const res = await hanaFetch(`/api/plugins/mcp/state?agentId=${encodeURIComponent(agentId)}`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    return {
      enabled: data.enabled === true,
      connectors: Array.isArray(data.connectors) ? data.connectors : (Array.isArray(data.servers) ? data.servers : []),
      servers: Array.isArray(data.servers) ? data.servers : undefined,
      agentConfig: data.agentConfig || { connectors: {} },
    };
  } catch {
    return EMPTY_MCP_STATE;
  }
}

/* ── 加载 CWD Skills ── */
async function loadCwdSkills(deskBasePath: string): Promise<CwdSkillInfo[]> {
  try {
    const res = await hanaFetch(`/api/desk/skills?dir=${encodeURIComponent(deskBasePath)}`);
    const data = await res.json();
    return data.skills || [];
  } catch {
    return [];
  }
}

/* ── Agent Summary ── */
function AgentSummary({ skillCount, connectorCount }: {
  skillCount: number; connectorCount: number;
}) {
  const agents = useStore(s => s.agents);
  const agentId = useStore(s => s.currentAgentId);
  const name = agents?.find(a => a.id === agentId)?.name ?? agentId ?? 'Agent';
  return (
    <div className={styles.agentSummary}>
      <div className={styles.agentSummaryName}>🤖 {name}</div>
      <div className={styles.agentSummaryMeta}>
        {skillCount + connectorCount} abilities{skillCount > 0 && ` · ${skillCount} Skills`}
      </div>
    </div>
  );
}

/* ── Quick Actions ── */
function QuickActions({ onCapabilities, onSettings }: {
  onCapabilities?: () => void; onSettings?: () => void;
}) {
  return (
    <div className={styles.quickActions}>
      {onCapabilities && <button className={styles.quickActionBtn} onClick={onCapabilities}>⚡ Capabilities</button>}
      {onSettings && <button className={styles.quickActionBtn} onClick={onSettings}>⚙ Settings</button>}
    </div>
  );
}

/* ── MCP 连接器状态图标 ── */
function ConnectorStatus({ connector }: { connector: McpConnector }) {
  const isRunning = connector.status === 'running';
  return (
    <span className={`${styles.connectorStatus} ${isRunning ? styles.running : styles.stopped}`}>
      <PhosphorIcon icon={isRunning ? PlugsConnected : Plugs} size={12} />
    </span>
  );
}

/* ── MCP 面板内容 ── */
function McpPanelContent({ state, onOpenSettings }: { state: McpState; onOpenSettings?: () => void }) {
  const t = window.t ?? ((p: string) => p);
  const agentConfig = state.agentConfig.connectors || {};

  // 过滤出当前 agent 启用的连接器
  const activeConnectors = state.connectors.filter(c => {
    const cfg = agentConfig[c.id];
    return state.enabled && cfg?.enabled === true;
  });

  if (!state.enabled || activeConnectors.length === 0) {
    return (
      <div className={styles.emptySection}>
        <PhosphorIcon icon={Plugs} size={14} />
        <span>{t('chatLeftPanel.mcpDisabled')}</span>
      </div>
    );
  }

  return (
    <div className={styles.sectionContent}>
      <div className={styles.sectionHeader}>
        <PhosphorIcon icon={PlugsConnected} size={12} />
        <span>{t('chatLeftPanel.mcpTitle')} · {activeConnectors.length}</span>
        {onOpenSettings && (
          <button
            className={styles.headerActionBtn}
            onClick={onOpenSettings}
            title={t('chatLeftPanel.openMcpSettings')}
          >
            <PhosphorIcon icon={Gear} size={11} />
          </button>
        )}
      </div>
      {activeConnectors.map(conn => (
        <div key={conn.id} className={styles.connectorItem}>
          <ConnectorStatus connector={conn} />
          <span className={styles.connectorName} title={conn.description}>{conn.name}</span>
          <span className={styles.connectorTools}>{conn.toolCount ?? conn.tools?.length ?? 0} tools</span>
        </div>
      ))}
    </div>
  );
}

/* ── Skill 面板内容 ── */
function SkillPanelContent({ skills, onOpenSkill }: { skills: CwdSkillInfo[]; onOpenSkill?: (skill: CwdSkillInfo) => void }) {
  const t = window.t ?? ((p: string) => p);

  if (skills.length === 0) {
    return (
      <div className={styles.emptySection}>
        <PhosphorIcon icon={Lightning} size={14} />
        <span>{t('chatLeftPanel.noSkills')}</span>
      </div>
    );
  }

  const grouped: Record<string, CwdSkillInfo[]> = {};
  for (const s of skills) {
    (grouped[s.source] ??= []).push(s);
  }

  return (
    <div className={styles.sectionContent}>
      <div className={styles.sectionHeader}>
        <PhosphorIcon icon={Lightning} size={12} />
        <span>{t('chatLeftPanel.skillsTitle')} · {skills.length}</span>
      </div>
      {Object.entries(grouped).map(([source, items]) => (
        <div key={source} className={styles.skillGroup}>
          <div className={styles.skillGroupLabel}>{source}</div>
          {items.map(skill => (
            <div
              key={skill.name}
              className={styles.skillItem}
              title={skill.description}
              onClick={() => onOpenSkill?.(skill)}
              style={onOpenSkill ? { cursor: 'pointer' } : undefined}
            >
              <span className={styles.skillIcon}>
                <PhosphorIcon icon={Lightning} size={14} />
              </span>
              <div className={styles.skillInfo}>
                <span className={styles.skillName}>{skill.name}</span>
                {skill.description && (
                  <span className={styles.skillDesc}>
                    {skill.description.slice(0, 60)}{skill.description.length > 60 ? '\u2026' : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── 主组件 ── */
export function ChatLeftPanel() {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [mcpState, setMcpState] = useState<McpState>(EMPTY_MCP_STATE);
  const [skills, setSkills] = useState<CwdSkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentAgentId = useStore(s => s.currentAgentId);
  const deskBasePath = useStore(s => s.deskBasePath);
  const welcomeVisible = useStore(s => s.welcomeVisible);
  const currentSessionPath = useStore(s => s.currentSessionPath);

  // 只有在有会话且不在欢迎页时才显示
  const shouldShow = !welcomeVisible && !!currentSessionPath;

  const loadData = useCallback(async (force = false) => {
    if (!force && loadedRef.current) return;
    setLoading(true);
    try {
      const [mcpData, skillData] = await Promise.all([
        currentAgentId ? loadMcpState(currentAgentId) : Promise.resolve(EMPTY_MCP_STATE),
        deskBasePath ? loadCwdSkills(deskBasePath) : Promise.resolve([]),
      ]);
      setMcpState(mcpData);
      setSkills(skillData);
      loadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [currentAgentId, deskBasePath]);

  // 当 agent 或 desk 路径变化时重置加载状态
  useEffect(() => {
    loadedRef.current = false;
    if (expanded) void loadData(true);
  }, [currentAgentId, deskBasePath, expanded, loadData]);

  // 组件卸载时清理 timer
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // 点击外部关闭面板
  useEffect(() => {
    if (!pinned) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPinned(false);
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pinned]);

  const handleMouseEnter = useCallback(() => {
    if (!shouldShow || pinned) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setExpanded(true);
      void loadData();
    }, HOVER_EXPAND_DELAY);
  }, [shouldShow, pinned, loadData]);

  const handleMouseLeave = useCallback(() => {
    if (pinned) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setExpanded(false);
    }, HOVER_COLLAPSE_DELAY);
  }, [pinned]);

  const togglePin = useCallback(() => {
    setPinned(prev => {
      const next = !prev;
      setExpanded(next);
      if (next) void loadData();
      return next;
    });
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    loadedRef.current = false;
    void loadData(true);
  }, [loadData]);

  const handleOpenMcpSettings = useCallback(() => {
    openSettingsModalAction('mcp');
  }, []);

  const handleOpenSkill = useCallback((skill: CwdSkillInfo) => {
    window.platform?.openSkillViewer?.({
      name: skill.name,
      baseDir: skill.baseDir,
      filePath: skill.filePath,
      installed: false,
    });
  }, []);

  if (!shouldShow) return null;

  const t = window.t ?? ((p: string) => p);

  return (
    <div
      ref={panelRef}
      className={`${styles.leftPanel} ${expanded ? styles.expanded : ''} ${pinned ? styles.pinned : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 收起状态：显示一条细线和图标指示 */}
      <div className={styles.collapseIndicator} onClick={togglePin}>
        <div className={styles.collapseLine} />
        <div className={styles.collapseIcons}>
          {mcpState.enabled && mcpState.connectors.some(c => {
            const cfg = mcpState.agentConfig.connectors?.[c.id];
            return cfg?.enabled === true;
          }) && (
            <PhosphorIcon icon={PlugsConnected} size={10} className={styles.collapseIconActive} />
          )}
          {skills.length > 0 && (
            <PhosphorIcon icon={Lightning} size={10} className={styles.collapseIconActive} />
          )}
        </div>
      </div>

      {/* 展开状态：显示内容 */}
      <div className={styles.panelContent}>
        <AgentSummary skillCount={skills.length} connectorCount={mcpState.connectors?.length || 0} />
        <div className={styles.panelHeader}>
          <span>{t('chatLeftPanel.title')}</span>
          <div className={styles.headerActions}>
            <button
              className={`${styles.headerActionBtn} ${pinned ? styles.active : ''}`}
              onClick={togglePin}
              title={pinned ? t('chatLeftPanel.unpin') : t('chatLeftPanel.pin')}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-6.6a2 2 0 0 0-.6-1.4l-4-4a2 2 0 0 0-1.4-.6H7a2 2 0 0 0-2 2v10.6z" />
              </svg>
            </button>
            <button
              className={`${styles.headerActionBtn} ${loading ? styles.spinning : ''}`}
              onClick={handleRefresh}
              title={loading ? t('chatLeftPanel.loading') : t('chatLeftPanel.refresh')}
              disabled={loading}
            >
              <PhosphorIcon icon={ArrowsClockwise} size={11} />
            </button>
          </div>
        </div>

        {/* MCP 区域 */}
        <div className={styles.panelSection}>
          <McpPanelContent state={mcpState} onOpenSettings={handleOpenMcpSettings} />
        </div>

        {/* 分隔线 */}
        {(mcpState.enabled || skills.length > 0) && (
          <div className={styles.sectionDivider} />
        )}

        {/* Skill 区域 */}
        <div className={styles.panelSection}>
          <SkillPanelContent skills={skills} onOpenSkill={handleOpenSkill} />
        </div>

        <QuickActions onSettings={() => openSettingsModalAction('mcp')} />
      </div>
    </div>
  );
}
