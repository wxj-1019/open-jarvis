/**
 * ToolGroupBlock — 工具调用组，含展开/折叠
 */

import { memo, useState, useCallback, useEffect } from 'react';
import styles from './Chat.module.css';
import { extractToolDetail } from '../../utils/message-parser';
import type { ToolDetail } from '../../utils/message-parser';
import type { ToolCall } from '../../stores/chat-types';
import { getEmojiStylePreset, getSavedEmojiStyle } from '../../../shared/emoji-styles';
import { ToolCallCard, type ToolCallCardData } from './ToolCallCard';

type ToolPhase = 'running' | 'done' | 'failed';

interface Props {
  tools: ToolCall[];
  collapsed: boolean;
  agentName?: string;
}

function getToolLabel(name: string, phase: ToolPhase, agentName: string): string {
  const emojiStyle = getSavedEmojiStyle();
  const preset = getEmojiStylePreset(emojiStyle);
  const toolPreset = preset.tools[name];
  
  if (toolPreset && toolPreset[phase]) {
    return toolPreset[phase].replace(/\{name\}/g, agentName);
  }
  
  const t = window.t ?? ((key: string) => key);
  const vars = { name: agentName };
  const val = t(`tool.${name}.${phase}`, vars);
  if (val && val !== `tool.${name}.${phase}`) return val;
  return t(`tool._fallback.${phase}`, vars) || name;
}

export const ToolGroupBlock = memo(function ToolGroupBlock({ tools: rawTools, collapsed: initialCollapsed, agentName = 'Hanako' }: Props) {
  const tools = rawTools.filter(t => t.name !== 'subagent');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [, forceUpdate] = useState(0);
  
  useEffect(() => {
    setCollapsed(initialCollapsed);
  }, [initialCollapsed]);
  
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.type === 'emoji-style-changed') {
        forceUpdate(v => v + 1);
      }
    };
    window.addEventListener('hana-settings', handler);
    return () => window.removeEventListener('hana-settings', handler);
  }, []);
  
  const toggle = useCallback(() => setCollapsed(v => !v), []);

  if (tools.length === 0) return null;

  const allDone = tools.every(t => t.done);
  const failCount = tools.filter(t => t.done && !t.success).length;
  const isSingle = tools.length === 1;

  // 摘要标题
  const _t = window.t ?? ((p: string) => p);
  let summaryText = '';
  if (allDone) {
    if (failCount > 0) {
      summaryText = _t('toolGroup.countWithFail', { total: tools.length, fail: failCount });
    } else {
      summaryText = _t('toolGroup.count', { n: tools.length });
    }
  } else {
    const running = tools.filter(t => !t.done).length;
    summaryText = _t('toolGroup.running', { n: running });
  }

  return (
    <div className={`${styles.toolGroup}${isSingle ? ` ${styles.toolGroupSingle}` : ''}`}>
      {!isSingle && (
        <div
          className={`${styles.toolGroupSummary}${allDone ? ` ${styles.toolGroupSummaryClickable}` : ''}`}
          onClick={allDone ? toggle : undefined}
        >
          <span className={styles.toolGroupTitle}>{summaryText}</span>
          {allDone && <span className={styles.toolGroupArrow}>{collapsed ? '›' : '‹'}</span>}
          {!allDone && (
            <span className={styles.toolDots} />
          )}
        </div>
      )}
      <div className={`${styles.toolGroupContent}${collapsed && !isSingle ? ` ${styles.toolGroupContentCollapsed}` : ''}`}>
        {tools.map((tool, i) => {
          const hasCard = tool.details?.card;
          if (hasCard && tool.details) {
            return <ToolCallCard key={`${tool.name}-${i}`} data={tool.details.card as ToolCallCardData} />;
          }
          return <ToolIndicator key={`${tool.name}-${i}`} tool={tool} agentName={agentName} />;
        })}
      </div>
    </div>
  );
});

// ── ToolIndicator ──

function handleDetailClick(e: React.MouseEvent, detail: ToolDetail) {
  e.preventDefault();
  e.stopPropagation();
  if (!detail.href) return;
  if (detail.hrefType === 'file') {
    window.platform?.showInFinder?.(detail.href);
  } else {
    window.platform?.openExternal?.(detail.href);
  }
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function waitSecondsFromTool(tool: ToolCall, now: number): number | null {
  const args = tool.args || {};
  const details = tool.details || {};
  const detailSeconds = finiteNumber(details.seconds);
  const argSeconds = finiteNumber(args.seconds);
  const seconds = detailSeconds ?? argSeconds;

  if (tool.done) return seconds;

  const startedAt = finiteNumber(args.startedAt);
  const durationMs = finiteNumber(args.durationMs);
  if (startedAt !== null && durationMs !== null) {
    return Math.max(0, Math.ceil((startedAt + durationMs - now) / 1000));
  }
  return seconds;
}

function waitToolDetail(tool: ToolCall, now: number): ToolDetail {
  const seconds = waitSecondsFromTool(tool, now);
  return { text: seconds === null ? '?s' : `${seconds}s` };
}

const ToolIndicator = memo(function ToolIndicator({ tool, agentName }: { tool: ToolCall; agentName: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tool.name !== 'wait' || tool.done) return;
    if (finiteNumber(tool.args?.startedAt) === null || finiteNumber(tool.args?.durationMs) === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [tool.name, tool.done, tool.args?.startedAt, tool.args?.durationMs]);

  const detail = tool.name === 'wait'
    ? waitToolDetail(tool, now)
    : extractToolDetail(tool.name, tool.args);
  const phase: ToolPhase = tool.done ? (tool.success ? 'done' : 'failed') : 'running';
  const label = getToolLabel(tool.name, phase, agentName);
  const detailTitle = detail.title || detail.href;

  // 如果 args 里有 tag 类型信息（如 agent 名）
  const tag = tool.args?.agentId as string | undefined;

  return (
    <>
      <div className={styles.toolIndicator} data-tool={tool.name} data-done={String(tool.done)}>
        <span className={styles.toolDesc}>{label}</span>
        {detail.text && (
          detail.href ? (
            <span
              className={`${styles.toolDetail} ${styles.toolDetailLink}`}
              title={detailTitle}
              onClick={(e) => handleDetailClick(e, detail)}
            >
              {detail.text}
            </span>
          ) : (
            <span className={styles.toolDetail} title={detailTitle}>{detail.text}</span>
          )
        )}
        {tag && <span className={styles.toolTag}>{tag}</span>}
        {tool.done ? (
          <span className={`${styles.toolStatus} ${tool.success ? styles.toolStatusDone : styles.toolStatusFailed}`}>
            {tool.success ? '✓' : '✗'}
          </span>
        ) : (
          <span className={styles.toolDots} />
        )}
      </div>
    </>
  );
});
