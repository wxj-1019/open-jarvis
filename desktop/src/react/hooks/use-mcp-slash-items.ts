import { useEffect, useState, useRef } from 'react';
import { hanaFetch } from './use-hana-fetch';
import { useStore } from '../stores';
import { PlugsConnected } from '@phosphor-icons/react';
import type { SlashItem } from '../components/input/slash-commands';
import type { McpState, McpTool } from '../settings/tabs/mcp/types';

const EMPTY_TOOLS: SlashItem[] = [];

export function useMcpSlashItems({ enabled = true }: { enabled?: boolean } = {}): SlashItem[] {
  const [items, setItems] = useState<SlashItem[]>(EMPTY_TOOLS);
  const agentId = useStore(s => s.currentAgentId);
  const cachedAgentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) { setItems(EMPTY_TOOLS); return; }
    if (!agentId) { setItems(EMPTY_TOOLS); return; }
    if (cachedAgentRef.current === agentId) return;

    let cancelled = false;
    hanaFetch(`/api/plugins/mcp/state?agentId=${encodeURIComponent(agentId)}`)
      .then(r => r.json())
      .then((data: McpState) => {
        if (cancelled) return;
        const agentConfig = data.agentConfig?.connectors ?? {};
        const result: SlashItem[] = [];

        for (const conn of data.connectors ?? []) {
          const cfg = agentConfig[conn.id];
          if (!data.enabled || !cfg?.enabled) continue;
          const enabledToolNames = cfg.tools ?? {};
          const tools: McpTool[] = conn.tools ?? [];

          for (const tool of tools) {
            if (enabledToolNames[tool.name] === false) continue;
            result.push({
              name: `mcp:${conn.id}/${tool.name}`,
              label: `${conn.name} / ${tool.title || tool.name}`,
              description: tool.description || `MCP tool: ${tool.name}`,
              busyLabel: '',
              icon: PlugsConnected,
              type: 'mcp-tool',
              connectorId: conn.id,
              toolName: tool.name,
              connectorLabel: conn.name,
              execute: () => {},
            });
          }
        }
        setItems(result);
        cachedAgentRef.current = agentId;
      })
      .catch(() => { if (!cancelled) setItems(EMPTY_TOOLS); });
    return () => { cancelled = true; };
  }, [agentId, enabled]);

  return items;
}
