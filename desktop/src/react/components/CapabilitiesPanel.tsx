import { useState, useCallback, useEffect, useRef } from 'react';
import { usePanel } from '../hooks/use-panel';
import { hanaFetch } from '../hooks/use-hana-fetch';
import { useStore } from '../stores';
import type { CwdSkillInfo } from '../stores/desk-slice';
import type { McpState } from '../settings/tabs/mcp/types';
import { PhosphorIcon } from '../ui/PhosphorIcon';
import { Lightning, Plugs, PlugsConnected, CaretDown, CaretRight } from '@phosphor-icons/react';
import styles from './CapabilitiesPanel.module.css';

const t = (key: string, vars?: Record<string, string | number>): string => window.t?.(key, vars) ?? key;

const EMPTY_MCP_STATE: McpState = { enabled: false, connectors: [], agentConfig: { connectors: {} } };

export function CapabilitiesPanel() {
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
    <div className={styles.capabilitiesPanel}>
      <div className={styles.panelHeader}>
        <span>{t('capabilities.title')}</span>
        <button className={styles.closeBtn} onClick={close} title={t('capabilities.close')}>&#x2715;</button>
      </div>
      <div className={styles.panelBody}>
        {/* Skills section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} onClick={() => toggleSection('skills')}>
            <PhosphorIcon icon={sections.skills ? CaretDown : CaretRight} size={12} />
            <PhosphorIcon icon={Lightning} size={14} />
            <span>{t('capabilities.skills')} &middot; {skills.length}</span>
          </div>
          {sections.skills && (
            <div className={styles.sectionList}>
              {skills.length === 0 && <div className={styles.emptyRow}>{t('capabilities.noSkills')}</div>}
              {skills.map(skill => (
                <div key={skill.name} className={styles.skillRow} title={skill.description}
                     onClick={() => window.platform?.openSkillViewer?.({ name: skill.name, baseDir: skill.baseDir, filePath: skill.filePath, installed: false })}>
                  <PhosphorIcon icon={Lightning} size={14} className={styles.skillRowIcon} />
                  <div className={styles.skillRowInfo}>
                    <span className={styles.skillRowName}>{skill.name}</span>
                    {skill.description && <span className={styles.skillRowDesc}>{skill.description.slice(0, 120)}{skill.description.length > 120 ? '\u2026' : ''}</span>}
                  </div>
                  <span className={styles.skillRowTrigger}>/{skill.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MCP section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} onClick={() => toggleSection('mcp')}>
            <PhosphorIcon icon={sections.mcp ? CaretDown : CaretRight} size={12} />
            <PhosphorIcon icon={PlugsConnected} size={14} />
            <span>{t('capabilities.connectors')} &middot; {activeConnectors.length}</span>
          </div>
          {sections.mcp && (
            <div className={styles.sectionList}>
              {activeConnectors.length === 0 && <div className={styles.emptyRow}>{t('capabilities.noConnectors')}</div>}
              {activeConnectors.map(conn => (
                <div key={conn.id} className={styles.connectorRow}>
                  <span className={`${styles.connectorDot} ${conn.status === 'running' ? styles.dotRunning : styles.dotStopped}`} />
                  <div className={styles.connectorRowInfo}>
                    <span className={styles.connectorRowName}>{conn.name}</span>
                    <span className={styles.connectorRowTools}>{conn.tools?.length ?? conn.toolCount ?? 0} {t('capabilities.tools')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
