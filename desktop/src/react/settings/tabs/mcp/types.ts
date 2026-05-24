export type McpTransport = 'stdio' | 'remote' | 'streamable-http' | 'sse';
export type McpAuthType = 'none' | 'bearer' | 'oauth';
export type McpConnectorStatus = 'running' | 'stopped';

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
}

export interface McpOAuthState {
  connected?: boolean;
  scope?: string;
  expiresAt?: number;
}

export interface McpConnector {
  id: string;
  name: string;
  description?: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  registryUrl?: string;
  timeout?: number;
  autoStart?: boolean;
  status: McpConnectorStatus;
  tools: McpTool[];
  resources?: McpResource[];
  prompts?: McpPrompt[];
  serverCapabilities?: Record<string, any>;
  serverInfo?: { name?: string; version?: string };
  toolCount?: number;
  resourceCount?: number;
  promptCount?: number;
  authType?: McpAuthType;
  authStatus?: string;
  authorizationToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauth?: McpOAuthState;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
  };
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpAgentConnectorConfig {
  enabled?: boolean;
  tools?: Record<string, boolean>;
}

export interface McpState {
  enabled: boolean;
  connectors: McpConnector[];
  servers?: McpConnector[];
  agentConfig: {
    connectors?: Record<string, McpAgentConnectorConfig>;
    servers?: Record<string, McpAgentConnectorConfig>;
  };
}

export interface McpConnectorInput {
  name?: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  description?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  registryUrl?: string;
  timeout?: number;
  autoStart?: boolean;
  authType?: McpAuthType;
  authorizationToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
}

export interface McpPreset {
  id: string;
  name: string;
  description: string;
  category: "calendar" | "email" | "productivity" | "database" | "filesystem" | "other";
  icon: string;
  transport: McpTransport;
  command: string;
  args: string[];
  envSchema: Record<string, EnvFieldSchema>;
  authType: McpAuthType;
  autoStart?: boolean;
}

export interface EnvFieldSchema {
  label: string;
  required: boolean;
  type: "string" | "number" | "boolean";
  secret?: boolean;
  placeholder?: string;
}
