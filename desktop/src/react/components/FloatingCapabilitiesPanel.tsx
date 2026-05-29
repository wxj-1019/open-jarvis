import { useState, useCallback, useEffect, useRef } from 'react';
import { usePanel } from '../hooks/use-panel';
import { hanaFetch } from '../hooks/use-hana-fetch';
import { useStore } from '../stores';
import { t } from '../settings/helpers';
import type { CwdSkillInfo } from '../stores/desk-slice';
import type { McpState } from '../settings/tabs/mcp/types';
import { Icon } from '../ui/Icon';
import { Zap, Plug, ChevronDown, ChevronRight, X, ExternalLink, Circle } from 'lucide-react';
import styles from './FloatingCapabilitiesPanel.module.css';

const EMPTY_MCP_STATE: McpState = { enabled: false, connectors: [], agentConfig: { connectors: {} } };

export function FloatingCapabilitiesPanel() {
  const [skills, setSkills] = useState<CwdSkillInfo[]>([]);
  const [mcpState, setMcpState] = useState<McpState>(EMPTY_MCP_STATE);
  const [sections, setSections] = useState<Record<string, boolean>>({ skills: true, mcp: true });
  const loadingRef = useRef(false);
  const currentAgentId = useStore(s => s.currentAgentId);
  const deskBasePath = useStore(s => s.deskBasePath);

  const loadData = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const p1 = deskBasePath
      ? hanaFetch(`/api/desk/skills?dir=${encodeURIComponent(deskBasePath)}`).then(r => r.json()).then(d => d.skills ?? []).catch(() => [])
      : Promise.resolve([]);
    const p2 = currentAgentId
      ? hanaFetch(`/api/plugins/mcp/state?agentId=${encodeURIComponent(currentAgentId)}`).then(r => r.json()).catch(() => EMPTY_MCP_STATE)
      : Promise.resolve(EMPTY_MCP_STATE);
    Promise.all([p1, p2]).then(([s, m]) => { setSkills(s); setMcpState(m); }).finally(() => { loadingRef.current = false; });
  }, [currentAgentId, deskBasePath]);

  const { visible, close } = usePanel('capabilities', loadData, [loadData]);

  if (!visible) return null;

  const toggleSection = (key: string) => setSections(prev => ({ ...prev, [key]: !prev[key] }));
  const activeConnectors = mcpState.connectors?.filter(c => {
    const cfg = mcpState.agentConfig?.connectors?.[c.id];
    return mcpState.enabled && cfg?.enabled === true;
  }) ?? [];

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Icon icon={Zap} size={18} className={styles.headerIcon} />
            <h3 className={styles.headerTitle}>{t('capabilities.title', '能力面板')}</h3>
          </div>
          <button className={styles.closeBtn} onClick={close} title={t('common.close', '关闭')}>
            <Icon icon={X} size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Skills section */}
          <div className={styles.section}>
            <button className={styles.sectionHeader} onClick={() => toggleSection('skills')}>
              <Icon icon={sections.skills ? ChevronDown : ChevronRight} size={14} className={styles.chevron} />
              <Icon icon={Zap} size={14} className={styles.sectionIcon} />
              <span className={styles.sectionTitle}>{t('capabilities.skills', '技能')}</span>
              <span className={styles.badge}>{skills.length}</span>
            </button>
            
            {sections.skills && (
              <div className={styles.sectionList}>
                {skills.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Icon icon={Zap} size={24} className={styles.emptyIcon} />
                    <p>{t('capabilities.noSkills', '暂无技能')}</p>
                  </div>
                ) : (
                  skills.map(skill => (
                    <button
                      key={skill.name}
                      className={styles.skillRow}
                      title={skill.description}
                      onClick={() => window.platform?.openSkillViewer?.({ 
                        name: skill.name, 
                        baseDir: skill.baseDir, 
                        filePath: skill.filePath, 
                        installed: false 
                      })}
                    >
                      <div className={styles.skillIcon}>
                        <Icon icon={Zap} size={14} />
                      </div>
                      <div className={styles.skillInfo}>
                        <span className={styles.skillName}>{skill.name}</span>
                        {skill.description && (
                          <span className={styles.skillDesc}>
                            {skill.description.slice(0, 80)}
                            {skill.description.length > 80 ? '\u2026' : ''}
                          </span>
                        )}
                      </div>
                      <div className={styles.skillFooter}>
                        <code className={styles.trigger}>/{skill.name}</code>
                        <Icon icon={ExternalLink} size={12} className={styles.viewIcon} />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* MCP section */}
          <div className={styles.section}>
            <button className={styles.sectionHeader} onClick={() => toggleSection('mcp')}>
              <Icon icon={sections.mcp ? ChevronDown : ChevronRight} size={14} className={styles.chevron} />
              <Icon icon={Plug} size={14} className={styles.sectionIcon} />
              <span className={styles.sectionTitle}>{t('capabilities.connectors', '连接器')}</span>
              <span className={styles.badge}>{activeConnectors.length}</span>
            </button>
            
            {sections.mcp && (
              <div className={styles.sectionList}>
                {activeConnectors.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Icon icon={Plug} size={24} className={styles.emptyIcon} />
                    <p>{t('capabilities.noConnectors', '暂无活跃连接器')}</p>
                  </div>
                ) : (
                  activeConnectors.map(conn => (
                    <div key={conn.id} className={styles.connectorRow}>
                      <div className={styles.connectorStatus}>
                        <Icon 
                          icon={Circle} 
                          size={8} 
                          className={`${styles.statusDot} ${conn.status === 'running' ? styles.statusRunning : styles.statusStopped}`} 
                        />
                      </div>
                      <div className={styles.connectorInfo}>
                        <span className={styles.connectorName}>{conn.name}</span>
                        <span className={styles.connectorTools}>
                          {conn.tools?.length ?? conn.toolCount ?? 0} {t('capabilities.tools', '工具')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
