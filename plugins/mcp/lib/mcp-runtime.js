import fs from "node:fs";
import path from "node:path";
import { McpStdioClient } from "./mcp-stdio-client.js";
import {
  McpAutoHttpClient,
  McpLegacySseClient,
  McpStreamableHttpClient,
} from "./mcp-http-client.js";
import {
  createMcpOAuthAuthorization,
  exchangeMcpOAuthCode,
  refreshMcpOAuthToken,
} from "./mcp-oauth.js";

const DEFAULT_CONFIG = {
  enabled: false,
  connectors: [],
  servers: [],
};

const TRANSPORTS = new Set(["stdio", "remote", "streamable-http", "sse"]);
const AUTH_TYPES = new Set(["none", "bearer", "oauth"]);
const MASKED_SECRET = "********";

function normalizeTool(tool) {
  if (!tool || typeof tool.name !== "string" || !tool.name) return null;
  return {
    name: tool.name,
    title: typeof tool.title === "string" ? tool.title : (tool.annotations?.title || tool.name),
    description: typeof tool.description === "string" ? tool.description : "",
    inputSchema: tool.inputSchema && typeof tool.inputSchema === "object"
      ? tool.inputSchema
      : { type: "object", properties: {} },
    annotations: tool.annotations && typeof tool.annotations === "object" ? tool.annotations : undefined,
  };
}

function normalizeConnector(connector, fallbackId = "") {
  if (!connector || typeof connector !== "object") return null;
  const id = sanitizeId(connector.id || fallbackId);
  if (!id) return null;
  const env = normalizeStringRecord(connector.env);
  const headers = normalizeStringRecord(connector.headers);
  const tools = Array.isArray(connector.tools)
    ? connector.tools.map(normalizeTool).filter(Boolean)
    : [];
  const transport = normalizeTransport(connector);
  const authorizationToken = stringOrEmpty(connector.authorizationToken || connector.authorization_token);
  const oauth = normalizeOAuthState(connector.oauth);
  const authType = normalizeAuthType(connector.authType, { authorizationToken, oauth, connector });

  return {
    id,
    name: stringOrEmpty(connector.name) || id,
    description: stringOrEmpty(connector.description),
    transport,
    url: stringOrEmpty(connector.url || connector.baseUrl),
    command: stringOrEmpty(connector.command),
    args: Array.isArray(connector.args) ? connector.args.filter((arg) => typeof arg === "string") : [],
    cwd: stringOrEmpty(connector.cwd),
    env,
    headers,
    registryUrl: stringOrEmpty(connector.registryUrl),
    timeout: normalizeTimeoutSeconds(connector.timeout),
    authType,
    authorizationToken,
    oauthClientId: stringOrEmpty(connector.oauthClientId || connector.clientId),
    oauthClientSecret: stringOrEmpty(connector.oauthClientSecret || connector.clientSecret),
    oauth,
    autoStart: connector.autoStart === true || connector.isActive === true,
    tools,
  };
}

export function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function toMcpToolId(serverId, toolName) {
  return sanitizeId(`${serverId}_${toolName}`);
}

export function normalizeMcpConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const rawConnectors = Array.isArray(input.connectors)
    ? input.connectors
    : (Array.isArray(input.servers) ? input.servers : []);
  const connectors = rawConnectors
    .map((connector, index) => normalizeConnector(connector, `connector_${index + 1}`))
    .filter(Boolean);
  return {
    ...DEFAULT_CONFIG,
    enabled: input.enabled === true,
    connectors,
    servers: connectors,
  };
}

export function normalizeAgentMcpConfig(agentConfig) {
  const mcp = agentConfig?.mcp && typeof agentConfig.mcp === "object" ? agentConfig.mcp : {};
  const connectors = mcp.connectors && typeof mcp.connectors === "object"
    ? mcp.connectors
    : (mcp.servers && typeof mcp.servers === "object" ? mcp.servers : {});
  return {
    ...mcp,
    connectors,
    servers: connectors,
  };
}

export function isMcpToolEnabledForAgentConfig(agentConfig, { globalEnabled, serverId, connectorId, toolName } = {}) {
  if (globalEnabled !== true) return false;
  const id = connectorId || serverId;
  const mcp = normalizeAgentMcpConfig(agentConfig);
  const connector = mcp.connectors?.[id] || mcp.servers?.[id];
  if (connector?.enabled !== true) return false;
  return connector?.tools?.[toolName] === true;
}

export function mcpToolError(text, details = {}) {
  return {
    isError: true,
    content: [{ type: "text", text }],
    details: {
      errorCode: "mcp_unavailable",
      ...details,
    },
  };
}

export function normalizeMcpToolResult(value) {
  if (value && Array.isArray(value.content)) return value;
  if (typeof value === "string") return { content: [{ type: "text", text: value }] };
  return {
    content: [{ type: "text", text: JSON.stringify(value ?? null) }],
  };
}

export function createMcpToolDefinition({
  serverId,
  connectorId = serverId,
  toolName,
  description,
  inputSchema,
  getGlobalEnabled,
  getAgentConfig,
  callTool,
}) {
  const name = toMcpToolId(connectorId, toolName);
  return {
    name,
    description: description || `MCP connector tool ${connectorId}/${toolName}`,
    parameters: inputSchema || { type: "object", properties: {} },
    metadata: { kind: "mcp", connectorId, serverId: connectorId, toolName },
    isEnabledForAgentConfig: (agentConfig) => isMcpToolEnabledForAgentConfig(agentConfig, {
      globalEnabled: getGlobalEnabled(),
      connectorId,
      serverId: connectorId,
      toolName,
    }),
    execute: async (_toolCallId, params, runtimeCtx = {}) => {
      if (getGlobalEnabled() !== true) {
        return mcpToolError("MCP is disabled globally. Enable Connectors in Settings before calling this tool.", {
          connectorId,
          serverId: connectorId,
          toolName,
        });
      }
      const agentConfig = await getAgentConfig(runtimeCtx.agentId);
      if (!isMcpToolEnabledForAgentConfig(agentConfig, {
        globalEnabled: true,
        connectorId,
        serverId: connectorId,
        toolName,
      })) {
        return mcpToolError(`MCP connector tool "${connectorId}/${toolName}" is not enabled for this agent.`, {
          connectorId,
          serverId: connectorId,
          toolName,
          agentId: runtimeCtx.agentId || null,
        });
      }
      try {
        return normalizeMcpToolResult(await callTool(connectorId, toolName, params || {}));
      } catch (err) {
        return mcpToolError(`MCP connector tool "${connectorId}/${toolName}" failed: ${err.message}`, {
          connectorId,
          serverId: connectorId,
          toolName,
        });
      }
    },
  };
}

export class McpRuntime {
  constructor(ctx, { Client = null, clientFactory = null, fetchImpl = globalThis.fetch } = {}) {
    this.ctx = ctx;
    this.Client = Client;
    this.fetchImpl = fetchImpl;
    this.clientFactory = clientFactory || ((connector, opts) => (
      this.Client ? new this.Client(connector, opts) : createDefaultClient(connector, opts)
    ));
    this.clients = new Map();
    this.toolDisposers = [];
    this.promptDisposers = new Map();
    this.oauthSessions = new Map();
    this._refreshingTokens = new Map();
    this._cachedResourcesText = "";
    this._serverInfoCache = new Map();
  }

  async load() {
    fs.mkdirSync(this.ctx.dataDir, { recursive: true });
    this.registerCachedTools();

    // Register EventBus capabilities for MCP events
    if (this.ctx.bus?.registerCapability) {
      this.ctx.bus.registerCapability("mcp:progress", { type: "event" });
      this.ctx.bus.registerCapability("mcp:tools-changed", { type: "event" });
      this.ctx.bus.registerCapability("mcp:resources-changed", { type: "event" });
      this.ctx.bus.registerCapability("mcp:prompts-changed", { type: "event" });
    }

    // Load workspace .jarvis/mcp.json
    await this._loadWorkspaceConfig();

    const config = this.getConfig();
    if (config.enabled) {
      for (const connector of config.connectors.filter((s) => s.autoStart)) {
        this.startConnector(connector.id).catch((err) => {
          this.ctx.log.warn(`auto-start failed for ${connector.id}: ${err.message}`);
        });
      }
    }
  }

  async _loadWorkspaceConfig() {
    const cwd = this.ctx.getCurrentWorkspace?.();
    if (!cwd) return;

    const configPath = path.join(cwd, ".jarvis", "mcp.json");
    try {
      const raw = await fs.promises.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      const connectors = parsed.connectors || parsed.mcpServers || {};
      const existingConfig = this.getConfig();
      const existingIds = new Set(existingConfig.connectors.map((c) => c.id));

      const entries = Array.isArray(connectors) ? connectors : Object.entries(connectors).map(([id, def]) => ({ id, ...def }));

      for (const entry of entries) {
        const id = sanitizeId(entry.id || entry.name || "workspace-connector");
        if (existingIds.has(id)) continue;

        // Expand environment variable references ${env:VAR_NAME}
        const env = { ...(entry.env || {}) };
        for (const [key, val] of Object.entries(env)) {
          if (typeof val === "string") {
            env[key] = val.replace(/\$\{env:([^}]+)\}/g, (_, varName) => process.env[varName] || "");
          }
        }

        const connectorInput = {
          id,
          name: entry.name || id,
          description: entry.description || `From workspace .jarvis/mcp.json`,
          transport: entry.transport || (entry.command ? "stdio" : "remote"),
          command: entry.command || "",
          args: Array.isArray(entry.args) ? entry.args : [],
          cwd: entry.cwd || cwd,
          url: entry.url || "",
          env,
          headers: entry.headers || {},
          autoStart: entry.autoStart !== false,
        };

        try {
          this.addConnector(connectorInput);
          this.ctx.log.info(`[mcp] loaded workspace connector "${id}" from .jarvis/mcp.json`);
        } catch (err) {
          this.ctx.log.warn(`[mcp] failed to load workspace connector "${id}": ${err.message}`);
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        this.ctx.log.warn(`[mcp] failed to read workspace mcp.json: ${err.message}`);
      }
    }
  }

  async dispose() {
    for (const dispose of this.toolDisposers.splice(0)) {
      try { dispose(); } catch { /* ignore disposal error */ }
    }
    for (const dispose of this.promptDisposers.values()) {
      try { dispose(); } catch { /* ignore disposal error */ }
    }
    this.promptDisposers.clear();
    for (const client of this.clients.values()) {
      await client.stop().catch(() => {});
    }
    this.clients.clear();
    this.oauthSessions.clear();
    this._refreshingTokens.clear();
  }

  getConfig() {
    return normalizeMcpConfig(this.ctx.config.get("mcp"));
  }

  saveConfig(config) {
    const normalized = normalizeMcpConfig(config);
    this.ctx.config.set("mcp", {
      enabled: normalized.enabled,
      connectors: normalized.connectors,
    });
    return normalized;
  }

  getState(agentConfig = null) {
    const config = this.getConfig();
    const connectors = config.connectors.map((connector) => {
      const client = this.clients.get(connector.id);
      const cached = this._serverInfoCache?.get(connector.id);
      return {
        ...publicConnector({
          connector,
          status: client?.running ? "running" : "stopped",
        }),
        serverCapabilities: client?.serverCapabilities || cached?.serverCapabilities || null,
        serverInfo: client?.serverInfo || cached?.serverInfo || null,
        toolCount: connector.tools?.length || 0,
        resourceCount: connector.resources?.length || 0,
        promptCount: connector.prompts?.length || 0,
      };
    });
    return {
      enabled: config.enabled,
      connectors,
      servers: connectors,
      agentConfig: normalizeAgentMcpConfig(agentConfig),
    };
  }

  async setEnabled(enabled) {
    const config = this.getConfig();
    config.enabled = enabled === true;
    const saved = this.saveConfig(config);
    if (!saved.enabled) {
      for (const connector of saved.connectors) {
        await this.stopConnector(connector.id);
      }
    }
    this.registerCachedTools();
    return saved;
  }

  addConnector(input) {
    const config = this.getConfig();
    const id = uniqueConnectorId(config.connectors, input?.id || input?.name || input?.url || input?.command || "connector");
    const connector = normalizeConnector({ ...input, id }, id);
    validateConnector(connector);
    config.connectors.push(connector);
    const saved = this.saveConfig(config);
    this.registerCachedTools();
    return saved.connectors.find((s) => s.id === id);
  }

  addServer(input) {
    return this.addConnector(input);
  }

  async updateConnector(id, patch) {
    const config = this.getConfig();
    const index = config.connectors.findIndex((s) => s.id === id);
    if (index === -1) throw new Error(`MCP connector "${id}" not found`);
    const existing = config.connectors[index];
    const unmaskedPatch = unmaskConnectorPatch(existing, patch || {});
    const next = normalizeConnector({ ...existing, ...unmaskedPatch, id: existing.id, tools: patch?.tools || existing.tools }, existing.id);
    validateConnector(next);
    const changedClient = connectorClientFingerprint(next) !== connectorClientFingerprint(existing);
    config.connectors[index] = next;
    const saved = this.saveConfig(config);
    if (changedClient) await this.stopConnector(id);
    this.registerCachedTools();
    return saved.connectors[index];
  }

  async updateServer(id, patch) {
    return this.updateConnector(id, patch);
  }

  async removeConnector(id) {
    await this.stopConnector(id);
    // 清理 prompt disposers，防止已删除连接器的 prompts 残留为已注册工具
    const promptDisposer = this.promptDisposers.get(id);
    if (promptDisposer) {
      try { promptDisposer(); } catch { /* ignore disposal error */ }
      this.promptDisposers.delete(id);
    }
    const config = this.getConfig();
    config.connectors = config.connectors.filter((s) => s.id !== id);
    const saved = this.saveConfig(config);
    this.registerCachedTools();
    return saved;
  }

  async removeServer(id) {
    return this.removeConnector(id);
  }

  async startConnector(id) {
    const config = this.getConfig();
    if (!config.enabled) throw new Error("MCP connectors are disabled globally");
    const connector = config.connectors.find((s) => s.id === id);
    if (!connector) throw new Error(`MCP connector "${id}" not found`);
    const existing = this.clients.get(id);
    if (existing?.running) return connector;

    const client = this.clientFactory(connector, {
      log: this.ctx.log,
      fetchImpl: this.fetchImpl,
      onNotification: (method, params) => this._handleNotification(id, method, params),
      onRequest: (method, params) => this._handleServerRequest(id, method, params),
    });
    this.clients.set(id, client);
    try {
      await client.start();

      // Ping to verify connection is alive
      try {
        await client.ping();
      } catch (err) {
        this.ctx.log.debug?.(`[mcp:${id}] ping after start failed (non-fatal): ${err.message}`);
      }

      // Store server info in memory cache (not persisted to config)
      this._serverInfoCache = this._serverInfoCache || new Map();
      if (client.serverInfo) {
        this._serverInfoCache.set(id, {
          serverInfo: client.serverInfo,
          serverCapabilities: client.serverCapabilities,
        });
      }

      await this.refreshTools(id);
      return this.getConfig().connectors.find((s) => s.id === id);
    } catch (err) {
      this.clients.delete(id);
      await client.stop().catch(() => {});
      throw err;
    }
  }

  async startServer(id) {
    return this.startConnector(id);
  }

  async stopConnector(id) {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    this._serverInfoCache?.delete(id);
    await client.stop();
  }

  async stopServer(id) {
    return this.stopConnector(id);
  }

  async refreshTools(id) {
    const client = this.clients.get(id);
    if (!client?.running) throw new Error(`MCP connector "${id}" is not running`);
    const tools = await client.listTools();
    const config = this.getConfig();
    const connector = config.connectors.find((s) => s.id === id);
    if (!connector) throw new Error(`MCP connector "${id}" not found`);
    connector.tools = tools.map(normalizeTool).filter(Boolean);
    this.saveConfig(config);
    this.registerCachedTools();

    // Also refresh prompts if server supports them
    if (client.serverCapabilities?.prompts) {
      try {
        const { prompts } = await client.listPrompts();
        connector.prompts = prompts || [];
        this.saveConfig(config);
        this._registerPrompts(id, prompts || []);
      } catch (err) {
        this.ctx.log.debug?.(`[mcp:${id}] failed to list prompts: ${err.message}`);
      }
    }

    // Also refresh resources if server supports them
    if (client.serverCapabilities?.resources) {
      try {
        const { resources } = await client.listResources();
        connector.resources = resources || [];
        this.saveConfig(config);
      } catch (err) {
        this.ctx.log.debug?.(`[mcp:${id}] failed to list resources: ${err.message}`);
      }
    }

    // Update cached resources text for Agent system prompt injection
    this._refreshCachedResourcesText().catch(() => {});

    return connector.tools;
  }

  registerCachedTools() {
    for (const dispose of this.toolDisposers.splice(0)) {
      try { dispose(); } catch { /* ignore disposal error */ }
    }
    const config = this.getConfig();
    for (const connector of config.connectors) {
      for (const tool of connector.tools || []) {
        // Build LLM-friendly description using server info and tool annotations
        const serverLabel = connector.serverInfo?.name || connector.name || connector.id;
        const friendlyTitle = tool.title || tool.name;
        const description = tool.description
          ? `[${serverLabel}] ${tool.description}`
          : `[${serverLabel}] ${friendlyTitle}`;

        const definition = createMcpToolDefinition({
          connectorId: connector.id,
          serverId: connector.id,
          toolName: tool.name,
          description,
          inputSchema: tool.inputSchema,
          getGlobalEnabled: () => this.getConfig().enabled,
          getAgentConfig: (agentId) => this.getAgentConfig(agentId),
          callTool: (connectorId, toolName, args) => this.callTool(connectorId, toolName, args),
        });
        this.toolDisposers.push(this.ctx.registerTool(definition));
      }
    }
  }

  async getAgentConfig(agentId) {
    if (!agentId || !this.ctx.bus?.request) return {};
    const result = await this.ctx.bus.request("agent:config", { agentId });
    if (result?.error) throw new Error(result.error);
    return result?.config || {};
  }

  async updateAgentMcpConnector(agentId, connectorId, patch) {
    if (!agentId) throw new Error("agentId is required");
    const current = await this.getAgentConfig(agentId);
    const existingMcp = current.mcp && typeof current.mcp === "object" ? current.mcp : {};
    const normalizedMcp = normalizeAgentMcpConfig(current);
    const connectors = normalizedMcp.connectors && typeof normalizedMcp.connectors === "object"
      ? { ...normalizedMcp.connectors }
      : {};
    const existingConnector = connectors[connectorId] && typeof connectors[connectorId] === "object"
      ? connectors[connectorId]
      : {};
    connectors[connectorId] = {
      ...existingConnector,
      ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(patch.tools && typeof patch.tools === "object" ? { tools: { ...(existingConnector.tools || {}), ...patch.tools } } : {}),
    };
    const partial = {
      mcp: {
        ...existingMcp,
        connectors,
        servers: null,
      },
    };
    const result = await this.ctx.bus.request("agent:update-config", { agentId, partial });
    if (result?.error) throw new Error(result.error);
    return result?.config || partial;
  }

  async updateAgentMcpServer(agentId, serverId, patch) {
    return this.updateAgentMcpConnector(agentId, serverId, patch);
  }

  async startOAuth(connectorId, redirectUri) {
    const connector = this.getConfig().connectors.find((item) => item.id === connectorId);
    if (!connector) throw new Error(`MCP connector "${connectorId}" not found`);
    const { url, session } = await createMcpOAuthAuthorization({
      connector,
      redirectUri,
      fetchImpl: this.fetchImpl,
    });
    this.oauthSessions.set(session.state, { status: "pending", ...session });
    return { sessionId: session.state, url };
  }

  async completeOAuth({ state, code, error }) {
    const session = this.oauthSessions.get(state);
    if (!session) throw new Error("OAuth session not found");
    if (error) {
      session.status = "error";
      session.error = error;
      return session;
    }
    try {
      const token = await exchangeMcpOAuthCode({
        tokenEndpoint: session.tokenEndpoint,
        code,
        redirectUri: session.redirectUri,
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        codeVerifier: session.codeVerifier,
        resource: session.resource,
        fetchImpl: this.fetchImpl,
      });
      await this.saveConnectorOAuth(session.connectorId, token);
      session.status = "done";
      session.result = { connectorId: session.connectorId };
      return session;
    } catch (err) {
      session.status = "error";
      session.error = err.message;
      throw err;
    }
  }

  getOAuthStatus(sessionId) {
    const session = this.oauthSessions.get(sessionId);
    if (!session) return { status: "missing" };
    if (session.status === "done") {
      // Clean up completed session after read
      const result = { status: "done", result: session.result || null };
      setTimeout(() => this.oauthSessions.delete(sessionId), 60_000);
      return result;
    }
    if (session.status === "error") {
      const result = { status: "error", error: session.error || "OAuth failed" };
      setTimeout(() => this.oauthSessions.delete(sessionId), 60_000);
      return result;
    }
    return { status: "pending" };
  }

  async saveConnectorOAuth(connectorId, token) {
    const config = this.getConfig();
    const connector = config.connectors.find((item) => item.id === connectorId);
    if (!connector) throw new Error(`MCP connector "${connectorId}" not found`);
    connector.authType = "oauth";
    connector.authorizationToken = "";
    connector.oauth = {
      ...token,
      expiresAt: token.expiresIn ? token.obtainedAt + token.expiresIn * 1000 : 0,
    };
    const saved = this.saveConfig(config);
    await this.stopConnector(connectorId);
    return saved.connectors.find((item) => item.id === connectorId);
  }

  async logoutOAuth(connectorId) {
    const config = this.getConfig();
    const connector = config.connectors.find((item) => item.id === connectorId);
    if (!connector) throw new Error(`MCP connector "${connectorId}" not found`);
    connector.oauth = {};
    connector.authorizationToken = "";
    const saved = this.saveConfig(config);
    await this.stopConnector(connectorId);
    return saved.connectors.find((item) => item.id === connectorId);
  }

  // ─── Notification handling (Phase 2) ───

  _handleNotification(connectorId, method, params) {
    const logErr = (err) => this.ctx.log.error(`[mcp:${connectorId}] notification ${method} failed: ${err.message}`);
    switch (method) {
      case "notifications/tools/list_changed":
        this._onToolsChanged(connectorId).catch(logErr);
        break;
      case "notifications/resources/list_changed":
        this._onResourcesChanged(connectorId).catch(logErr);
        break;
      case "notifications/resources/updated":
        this._onResourceUpdated(connectorId, params);
        break;
      case "notifications/prompts/list_changed":
        this._onPromptsChanged(connectorId).catch(logErr);
        break;
      case "notifications/progress":
        this._onProgress(connectorId, params);
        break;
      case "notifications/cancelled":
        this._onCancelled(connectorId, params);
        break;
      case "notifications/message":
        this._onLogMessage(connectorId, params);
        break;
      default:
        this.ctx.log.debug?.(`[mcp:${connectorId}] unhandled notification: ${method}`);
    }
  }

  async _onToolsChanged(connectorId) {
    this.ctx.log.info(`[mcp:${connectorId}] tools changed, refreshing...`);
    try {
      await this.refreshTools(connectorId);
      if (this.ctx.bus) {
        this.ctx.bus.emit("mcp:tools-changed", { connectorId });
      }
    } catch (err) {
      this.ctx.log.error(`[mcp:${connectorId}] failed to refresh tools: ${err.message}`);
    }
  }

  async _onResourcesChanged(connectorId) {
    this.ctx.log.info(`[mcp:${connectorId}] resources changed`);
    const client = this.clients.get(connectorId);
    if (client?.running) {
      try {
        const { resources } = await client.listResources();
        const config = this.getConfig();
        const connector = config.connectors.find((s) => s.id === connectorId);
        if (connector) {
          connector.resources = resources || [];
          this.saveConfig(config);
        }
      } catch (err) {
        this.ctx.log.debug?.(`[mcp:${connectorId}] failed to refresh resources: ${err.message}`);
      }
    }
    this._refreshCachedResourcesText().catch(() => {});
    if (this.ctx.bus) {
      this.ctx.bus.emit("mcp:resources-changed", { connectorId });
    }
  }

  _onResourceUpdated(connectorId, params) {
    this.ctx.log.debug?.(`[mcp:${connectorId}] resource updated: ${params?.uri}`);
    if (this.ctx.bus) {
      this.ctx.bus.emit("mcp:resources-changed", { connectorId, uri: params?.uri });
    }
  }

  async _onPromptsChanged(connectorId) {
    this.ctx.log.info(`[mcp:${connectorId}] prompts changed, refreshing...`);
    const client = this.clients.get(connectorId);
    if (client?.running) {
      try {
        const { prompts } = await client.listPrompts();
        const config = this.getConfig();
        const connector = config.connectors.find((s) => s.id === connectorId);
        if (connector) {
          connector.prompts = prompts || [];
          this.saveConfig(config);
        }
        this._registerPrompts(connectorId, prompts || []);
      } catch (err) {
        this.ctx.log.error(`[mcp:${connectorId}] failed to refresh prompts: ${err.message}`);
      }
    }
    if (this.ctx.bus) {
      this.ctx.bus.emit("mcp:prompts-changed", { connectorId });
    }
  }

  _onProgress(connectorId, params) {
    if (this.ctx.bus) {
      this.ctx.bus.emit("mcp:progress", {
        connectorId,
        progressToken: params?.progressToken,
        progress: params?.progress,
        total: params?.total,
        message: params?.message,
      });
    }
  }

  _onCancelled(connectorId, params) {
    const client = this.clients.get(connectorId);
    if (client && params?.requestId != null) {
      client.rejectPending(params.requestId, new Error(params.reason || "Cancelled by server"));
    }
  }

  _onLogMessage(connectorId, params) {
    const level = params?.level || "info";
    const logger = params?.logger || connectorId;
    const data = params?.data;
    const logFn = this.ctx.log[level] || this.ctx.log.info;
    logFn(`[mcp:${logger}] ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  // ─── Server request handling (Phase 4) ───

  async _handleServerRequest(connectorId, method, params) {
    switch (method) {
      case "sampling/createMessage":
        return this._handleSamplingRequest(connectorId, params);
      case "roots/list":
        return this._handleRootsList(connectorId);
      default:
        throw new Error(`Unsupported server request: ${method}`);
    }
  }

  async _handleSamplingRequest(connectorId, params) {
    if (this.ctx.bus?.request) {
      const result = await this.ctx.bus.request("llm:complete", {
        messages: params?.messages,
        systemPrompt: params?.systemPrompt,
        maxTokens: params?.maxTokens || 1024,
        temperature: params?.temperature,
      });
      return {
        model: result?.model || "unknown",
        role: "assistant",
        content: { type: "text", text: result?.text || "" },
        stopReason: result?.stopReason || "endTurn",
      };
    }
    throw new Error("Sampling not available: no LLM bridge");
  }

  _handleRootsList(_connectorId) {
    const roots = [];
    if (this.ctx.getCurrentWorkspace) {
      const cwd = this.ctx.getCurrentWorkspace();
      if (cwd) {
        const normalized = cwd.replace(/\\/g, "/");
        roots.push({ uri: `file://${normalized}${normalized.endsWith("/") ? "" : "/"}`, name: "Workspace" });
      }
    }
    return { roots };
  }

  // ─── Prompts registration (Phase 3) ───

  _registerPrompts(connectorId, prompts) {
    // Clean up old prompt registrations
    const oldDisposer = this.promptDisposers.get(connectorId);
    if (oldDisposer) {
      try { oldDisposer(); } catch { /* ignore disposal error */ }
    }

    if (!prompts || prompts.length === 0) {
      this.promptDisposers.delete(connectorId);
      return;
    }

    const disposers = [];
    for (const prompt of prompts) {
      const toolName = toMcpToolId(connectorId, `prompt_${prompt.name}`);
      const disposer = this.ctx.registerTool({
        name: toolName,
        description: `[MCP Prompt] ${prompt.description || prompt.name}`,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            (prompt.arguments || []).map((a) => [a.name, {
              type: "string",
              description: a.description || "",
            }])
          ),
          required: (prompt.arguments || []).filter((a) => a.required).map((a) => a.name),
        },
        metadata: { kind: "mcp-prompt", connectorId, promptName: prompt.name },
        execute: async (_toolCallId, args) => {
          try {
            const result = await this.getConnectorPrompt(connectorId, prompt.name, args || {});
            const text = (result?.messages || [])
              .map((m) => `[${m.role}] ${m.content?.text || JSON.stringify(m.content)}`)
              .join("\n\n");
            return { content: [{ type: "text", text: text || "(empty prompt result)" }] };
          } catch (err) {
            return mcpToolError(`MCP prompt "${prompt.name}" failed: ${err.message}`);
          }
        },
      });
      disposers.push(disposer);
    }
    this.promptDisposers.set(connectorId, () => disposers.forEach((d) => d()));
  }

  // ─── Resources access (Phase 3) ───

  async listConnectorResources(connectorId) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    const allResources = [];
    let cursor = undefined;
    do {
      const result = await client.listResources(cursor);
      allResources.push(...(result?.resources || []));
      cursor = result?.nextCursor;
    } while (cursor);
    return allResources;
  }

  async readConnectorResource(connectorId, uri) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    return client.readResource(uri);
  }

  async listConnectorResourceTemplates(connectorId) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    return client.listResourceTemplates();
  }

  async subscribeConnectorResource(connectorId, uri) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    return client.subscribeResource(uri);
  }

  async getAgentContextResources() {
    const contexts = [];
    for (const [id, client] of this.clients) {
      if (!client.running) continue;
      if (!client.serverCapabilities?.resources) continue;
      try {
        const resources = await this.listConnectorResources(id);
        for (const r of resources) {
          const audience = r.annotations?.audience;
          if (audience && !audience.includes("assistant")) continue;
          try {
            const content = await this.readConnectorResource(id, r.uri);
            const text = content?.contents?.[0]?.text;
            if (text) {
              contexts.push({
                source: id,
                name: r.name || r.uri,
                description: r.description,
                text,
                priority: r.annotations?.priority ?? 0.5,
              });
            }
          } catch (e) {
            this.ctx.log.debug?.(`[mcp:${id}] failed to read resource ${r.uri}: ${e.message}`);
          }
        }
      } catch (e) {
        this.ctx.log.debug?.(`[mcp:${id}] failed to list resources: ${e.message}`);
      }
    }
    contexts.sort((a, b) => b.priority - a.priority);
    return contexts;
  }

  async _refreshCachedResourcesText() {
    try {
      const resources = await this.getAgentContextResources();
      if (resources.length > 0) {
        this._cachedResourcesText = resources
          .map((r) => `[${r.source}:${r.name}]${r.description ? ` — ${r.description}` : ""}\n${r.text}`)
          .join("\n\n---\n\n");
      } else {
        this._cachedResourcesText = "";
      }
    } catch {
      this._cachedResourcesText = "";
    }
    return this._cachedResourcesText;
  }

  // ─── Prompts access (Phase 3) ───

  async listConnectorPrompts(connectorId) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    return client.listPrompts();
  }

  async getConnectorPrompt(connectorId, name, args) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    return client.getPrompt(name, args);
  }

  // ─── Completions (Phase 4) ───

  async completeConnector(connectorId, ref, argument) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    return client.complete(ref, argument);
  }

  // ─── OAuth token refresh (Phase 1) ───

  async _refreshOAuthToken(connectorId) {
    // Prevent concurrent refresh for the same connector
    if (this._refreshingTokens.has(connectorId)) {
      return this._refreshingTokens.get(connectorId);
    }

    const promise = (async () => {
      const config = this.getConfig();
      const connector = config.connectors.find((c) => c.id === connectorId);
      if (!connector?.oauth?.refreshToken) {
        throw new Error(`No refresh token available for connector "${connectorId}"`);
      }
      if (!connector.oauth.tokenEndpoint) {
        throw new Error(`No token endpoint for connector "${connectorId}"`);
      }

      const token = await refreshMcpOAuthToken({
        tokenEndpoint: connector.oauth.tokenEndpoint,
        refreshToken: connector.oauth.refreshToken,
        clientId: connector.oauthClientId,
        clientSecret: connector.oauthClientSecret,
        fetchImpl: this.fetchImpl,
      });

      // Save token and restart connector atomically
      await this.saveConnectorOAuth(connectorId, token);
      await this.startConnector(connectorId);
      this.ctx.log.info(`[mcp:${connectorId}] OAuth token refreshed and connector restarted`);
      return token;
    })();

    this._refreshingTokens.set(connectorId, promise);
    try {
      return await promise;
    } finally {
      this._refreshingTokens.delete(connectorId);
    }
  }

  async callTool(connectorId, toolName, args) {
    const config = this.getConfig();
    if (!config.enabled) throw new Error("MCP connectors are disabled globally");
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    try {
      return await client.callTool(toolName, args);
    } catch (err) {
      // Auto-retry on 401 if OAuth token can be refreshed
      if (err?.status === 401 || err?.message?.includes("401") || err?.message?.includes("authentication")) {
        const currentConfig = this.getConfig();
        const connector = currentConfig.connectors.find((c) => c.id === connectorId);
        if (connector?.authType === "oauth" && connector?.oauth?.refreshToken) {
          this.ctx.log.info(`[mcp:${connectorId}] token expired, attempting refresh...`);
          try {
            await this._refreshOAuthToken(connectorId);
            const newClient = this.clients.get(connectorId);
            if (newClient?.running) {
              return newClient.callTool(toolName, args);
            }
          } catch (refreshErr) {
            this.ctx.log.error(`[mcp:${connectorId}] OAuth refresh failed: ${refreshErr.message}`);
          }
        }
      }
      throw err;
    }
  }
}

function createDefaultClient(connector, opts) {
  if (connector.transport === "stdio") return new McpStdioClient(connector, opts);
  if (connector.transport === "streamable-http") return new McpStreamableHttpClient(connector, opts);
  if (connector.transport === "sse") return new McpLegacySseClient(connector, opts);
  return new McpAutoHttpClient(connector, opts);
}

function normalizeTransport(connector) {
  const raw = stringOrEmpty(connector.transport || connector.type);
  if (raw === "http") return "remote";
  if (raw === "streamableHttp" || raw === "streamable-http") return "streamable-http";
  if (TRANSPORTS.has(raw)) return raw;
  if (stringOrEmpty(connector.url || connector.baseUrl)) return "remote";
  return "stdio";
}

function normalizeAuthType(value, { authorizationToken, oauth, connector }) {
  const raw = stringOrEmpty(value);
  if (AUTH_TYPES.has(raw)) return raw;
  if (authorizationToken) return "bearer";
  if (oauth.accessToken || connector.oauthClientId || connector.clientId) return "oauth";
  return "none";
}

function normalizeOAuthState(value) {
  if (!value || typeof value !== "object") return {};
  return {
    accessToken: stringOrEmpty(value.accessToken),
    refreshToken: stringOrEmpty(value.refreshToken),
    tokenType: stringOrEmpty(value.tokenType) || (value.accessToken ? "Bearer" : ""),
    tokenEndpoint: stringOrEmpty(value.tokenEndpoint),
    scope: stringOrEmpty(value.scope),
    expiresIn: Number(value.expiresIn || 0) || 0,
    expiresAt: Number(value.expiresAt || 0) || 0,
    obtainedAt: Number(value.obtainedAt || 0) || 0,
  };
}

function validateConnector(connector) {
  if (!connector) throw new Error("connector is required");
  if (connector.transport === "stdio") {
    if (!connector.command) throw new Error("command is required");
    return;
  }
  if (!connector.url) throw new Error("url is required");
  const url = new URL(connector.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("url must use http or https");
  }
}

function uniqueConnectorId(connectors, raw) {
  const base = sanitizeId(raw) || "connector";
  const taken = new Set(connectors.map((s) => s.id));
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function connectorClientFingerprint(connector) {
  return JSON.stringify({
    transport: connector.transport,
    url: connector.url,
    command: connector.command,
    args: connector.args,
    cwd: connector.cwd,
    env: connector.env,
    headers: connector.headers,
    registryUrl: connector.registryUrl,
    timeout: connector.timeout,
    authType: connector.authType,
    authorizationToken: connector.authorizationToken,
    oauthAccessToken: connector.oauth?.accessToken || "",
  });
}

function publicConnector({ connector, status }) {
  return {
    ...connector,
    status,
    env: redactRecord(connector.env),
    headers: redactRecord(connector.headers),
    authorizationToken: connector.authorizationToken ? "********" : "",
    oauthClientSecret: connector.oauthClientSecret ? "********" : "",
    oauth: {
      connected: !!connector.oauth?.accessToken,
      scope: connector.oauth?.scope || "",
      expiresAt: connector.oauth?.expiresAt || 0,
    },
    authStatus: connectorAuthStatus(connector),
  };
}

function connectorAuthStatus(connector) {
  if (connector.authType === "none") return "none";
  if (connector.authType === "bearer") return connector.authorizationToken ? "token" : "missing";
  if (connector.authType === "oauth") return connector.oauth?.accessToken ? "connected" : "disconnected";
  return "none";
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key, val]) => typeof key === "string" && typeof val === "string"),
  );
}

function normalizeTimeoutSeconds(value) {
  if (value === "" || value == null) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function redactRecord(value) {
  const record = normalizeStringRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, val]) => [key, val ? MASKED_SECRET : ""]),
  );
}

function unmaskConnectorPatch(existing, patch) {
  const next = { ...patch };
  if (patch.authorizationToken === MASKED_SECRET) {
    next.authorizationToken = existing.authorizationToken || "";
  }
  if (patch.oauthClientSecret === MASKED_SECRET) {
    next.oauthClientSecret = existing.oauthClientSecret || "";
  }
  if (patch.env && typeof patch.env === "object" && !Array.isArray(patch.env)) {
    next.env = unmaskRecord(existing.env, patch.env);
  }
  if (patch.headers && typeof patch.headers === "object" && !Array.isArray(patch.headers)) {
    next.headers = unmaskRecord(existing.headers, patch.headers);
  }
  return next;
}

function unmaskRecord(existing, patch) {
  const existingRecord = normalizeStringRecord(existing);
  const patchRecord = normalizeStringRecord(patch);
  return Object.fromEntries(
    Object.entries(patchRecord).map(([key, val]) => [
      key,
      val === MASKED_SECRET && Object.hasOwn(existingRecord, key) ? existingRecord[key] : val,
    ]),
  );
}

export function configPathForDataDir(dataDir) {
  return path.join(dataDir, "config.json");
}
