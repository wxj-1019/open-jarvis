import { hanaFetch } from '../../api';
import type { McpConnectorInput, McpState } from './types';

export const EMPTY_MCP_STATE: McpState = {
  enabled: false,
  connectors: [],
  agentConfig: { connectors: {} },
};

async function jsonOrError<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function loadMcpState(agentId: string): Promise<McpState> {
  const res = await hanaFetch(`/api/plugins/mcp/state?agentId=${encodeURIComponent(agentId)}`);
  const data = await jsonOrError<McpState>(res);
  return {
    enabled: data.enabled === true,
    connectors: Array.isArray(data.connectors) ? data.connectors : (Array.isArray(data.servers) ? data.servers : []),
    servers: Array.isArray(data.servers) ? data.servers : undefined,
    agentConfig: data.agentConfig || { connectors: {} },
  };
}

export async function setMcpEnabled(enabled: boolean): Promise<void> {
  const res = await hanaFetch('/api/plugins/mcp/settings/enabled', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const data = await jsonOrError<McpState>(res);
  if (typeof data?.enabled !== 'boolean') {
    throw new Error('MCP enabled endpoint returned an invalid state');
  }
  if (data.enabled !== enabled) {
    throw new Error(`MCP enabled state did not persist: expected ${enabled}, got ${data.enabled}`);
  }
}

export async function addMcpConnector(input: McpConnectorInput): Promise<void> {
  const res = await hanaFetch('/api/plugins/mcp/connectors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await jsonOrError(res);
}

export async function updateMcpConnector(connectorId: string, input: McpConnectorInput): Promise<void> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await jsonOrError(res);
}

export async function removeMcpConnector(connectorId: string): Promise<void> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}`, {
    method: 'DELETE',
  });
  await jsonOrError(res);
}

export async function runMcpConnectorAction(
  connectorId: string,
  action: 'start' | 'stop' | 'refresh-tools',
): Promise<void> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}/${action}`, {
    method: 'POST',
  });
  await jsonOrError(res);
}

export async function setAgentMcpConnector(
  agentId: string,
  connectorId: string,
  enabled: boolean,
): Promise<void> {
  const res = await hanaFetch(`/api/plugins/mcp/agents/${encodeURIComponent(agentId)}/connectors/${encodeURIComponent(connectorId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  await jsonOrError(res);
}

export async function setAgentMcpTool(
  agentId: string,
  connectorId: string,
  toolName: string,
  enabled: boolean,
): Promise<void> {
  const res = await hanaFetch(`/api/plugins/mcp/agents/${encodeURIComponent(agentId)}/connectors/${encodeURIComponent(connectorId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tools: { [toolName]: enabled } }),
  });
  await jsonOrError(res);
}

export async function startMcpOAuth(connectorId: string): Promise<{ sessionId: string; url: string }> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}/oauth/start`, {
    method: 'POST',
  });
  return jsonOrError<{ sessionId: string; url: string }>(res);
}

export async function pollMcpOAuth(sessionId: string): Promise<{ status: string; error?: string }> {
  const res = await hanaFetch(`/api/plugins/mcp/oauth/poll/${encodeURIComponent(sessionId)}`);
  return jsonOrError<{ status: string; error?: string }>(res);
}

export async function logoutMcpOAuth(connectorId: string): Promise<void> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}/oauth/logout`, {
    method: 'POST',
  });
  await jsonOrError(res);
}

// ─── Registry API ───

export interface RegistryServer {
  id: string;
  name: string;
  description: string;
  transport: string;
  command: string;
  args: string[];
  envHints: string[];
  category: string;
  source?: string;
}

export async function searchRegistry(query: string): Promise<RegistryServer[]> {
  const res = await hanaFetch(`/api/plugins/mcp/registry/search?q=${encodeURIComponent(query)}`);
  const data = await jsonOrError<{ servers: RegistryServer[] }>(res);
  return data.servers || [];
}

export async function getRegistryCategories(): Promise<string[]> {
  const res = await hanaFetch('/api/plugins/mcp/registry/categories');
  const data = await jsonOrError<{ categories: string[] }>(res);
  return data.categories || [];
}

// ─── Resources & Prompts API ───

export async function loadConnectorResources(connectorId: string): Promise<any[]> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}/resources`);
  const data = await jsonOrError<{ resources: any[] }>(res);
  return data.resources || [];
}

export async function readConnectorResource(connectorId: string, uri: string): Promise<any> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}/resources/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri }),
  });
  return jsonOrError(res);
}

export async function loadConnectorPrompts(connectorId: string): Promise<any[]> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}/prompts`);
  const data = await jsonOrError<{ prompts: any[] }>(res);
  return data.prompts || [];
}

export async function pingConnector(connectorId: string): Promise<boolean> {
  const res = await hanaFetch(`/api/plugins/mcp/connectors/${encodeURIComponent(connectorId)}/ping`, {
    method: 'POST',
  });
  const data = await jsonOrError<{ ok: boolean }>(res);
  return data.ok === true;
}

// ─── Presets API ───

export interface McpPreset {
  id: string;
  name: string;
  transport: 'stdio' | 'remote' | 'streamable-http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  authType?: 'none' | 'bearer' | 'oauth';
  autoStart?: boolean;
}

export async function loadMcpPresets(): Promise<McpPreset[]> {
  const res = await hanaFetch('/api/plugins/mcp/presets');
  const data = await jsonOrError<{ presets: McpPreset[] }>(res);
  return data.presets || [];
}
