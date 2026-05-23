import fs from "node:fs";
import path from "node:path";
import { ConnectorManager } from "./connector-manager.js";
import { ToolRegistry } from "./tool-registry.js";
import { OAuthManager } from "./oauth-manager.js";
import { NotificationHandler } from "./notification-handler.js";
import {
  normalizeMcpConfig,
  normalizeAgentMcpConfig,
  publicConnector,
  validateConnector,
  uniqueConnectorId,
  connectorClientFingerprint,
  unmaskConnectorPatch,
  sanitizeId,
  toMcpToolId,
  createMcpToolDefinition,
  isMcpToolEnabledForAgentConfig,
  normalizeTool,
} from "./mcp-runtime-helpers.js";

export {
  createMcpToolDefinition,
  isMcpToolEnabledForAgentConfig,
  normalizeMcpConfig,
  normalizeAgentMcpConfig,
  toMcpToolId,
  sanitizeId,
  normalizeTool,
} from "./mcp-runtime-helpers.js";

export function configPathForDataDir(dataDir) {
  return path.join(dataDir, "config.json");
}

export class McpRuntime {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;

    this._connectorManager = new ConnectorManager(ctx, opts);
    this._toolRegistry = new ToolRegistry(this);
    this._oauthManager = new OAuthManager(this);
    this._notificationHandler = new NotificationHandler(
      this,
      this._toolRegistry
    );

    this._connectorManager._handleNotification = (id, method, params) =>
      this._notificationHandler.handleNotification(id, method, params);
    this._connectorManager._handleServerRequest = (id, method, params) =>
      this._notificationHandler.handleServerRequest(id, method, params);

    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
  }

  get clients() { return this._connectorManager.clients; }
  get toolDisposers() { return this._connectorManager.toolDisposers; }
  get promptDisposers() { return this._connectorManager.promptDisposers; }
  get oauthSessions() { return this._connectorManager.oauthSessions; }
  get _refreshingTokens() { return this._connectorManager._refreshingTokens; }
  get _cachedResourcesText() { return this._connectorManager._cachedResourcesText; }
  set _cachedResourcesText(val) { this._connectorManager._cachedResourcesText = val; }
  get _serverInfoCache() { return this._connectorManager._serverInfoCache; }

  async load() {
    fs.mkdirSync(this.ctx.dataDir, { recursive: true });
    this.registerCachedTools();

    if (this.ctx.bus?.registerCapability) {
      this.ctx.bus.registerCapability({ type: "mcp:progress" });
      this.ctx.bus.registerCapability({ type: "mcp:tools-changed" });
      this.ctx.bus.registerCapability({ type: "mcp:resources-changed" });
      this.ctx.bus.registerCapability({ type: "mcp:prompts-changed" });
      this.ctx.bus.registerCapability({ type: "mcp:elicit" });
    }

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
    return this._connectorManager.dispose();
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
    const connector = normalizeMcpConfig({ connectors: [{ ...input, id }] }).connectors[0];
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
    const next = normalizeMcpConfig({ connectors: [{ ...existing, ...unmaskedPatch, id: existing.id, tools: patch?.tools || existing.tools }] }).connectors[0];
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

    await this._connectorManager.startConnector(id, connector);
    await this._toolRegistry.refreshTools(id);
    return this.getConfig().connectors.find((s) => s.id === id);
  }

  async startServer(id) {
    return this.startConnector(id);
  }

  async stopConnector(id) {
    return this._connectorManager.stopConnector(id);
  }

  async stopServer(id) {
    return this.stopConnector(id);
  }

  async refreshTools(id) {
    return this._toolRegistry.refreshTools(id);
  }

  registerCachedTools() {
    return this._toolRegistry.registerCachedTools();
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
    return this._oauthManager.startOAuth(connectorId, redirectUri);
  }

  async completeOAuth({ state, code, error }) {
    return this._oauthManager.completeOAuth({ state, code, error });
  }

  getOAuthStatus(sessionId) {
    return this._oauthManager.getOAuthStatus(sessionId);
  }

  async saveConnectorOAuth(connectorId, token) {
    return this._oauthManager.saveConnectorOAuth(connectorId, token);
  }

  async logoutOAuth(connectorId) {
    return this._oauthManager.logoutOAuth(connectorId);
  }

  _registerPrompts(connectorId, prompts) {
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
            return {
              isError: true,
              content: [{ type: "text", text: `MCP prompt "${prompt.name}" failed: ${err.message}` }],
              details: { errorCode: "mcp_unavailable" },
            };
          }
        },
      });
      disposers.push(disposer);
    }
    this.promptDisposers.set(connectorId, () => disposers.forEach((d) => d()));
  }

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

  async completeConnector(connectorId, ref, argument) {
    const client = this.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    return client.complete(ref, argument);
  }

  async _refreshOAuthToken(connectorId) {
    return this._oauthManager._refreshOAuthToken(connectorId);
  }

  async callTool(connectorId, toolName, args) {
    return this._toolRegistry.callTool(connectorId, toolName, args);
  }
}
