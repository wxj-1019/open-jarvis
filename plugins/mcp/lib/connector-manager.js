import { McpStdioClient } from "./mcp-stdio-client.js";
import {
  McpStreamableHttpClient,
  McpLegacySseClient,
  McpAutoHttpClient,
} from "./mcp-http-client.js";

export class ConnectorManager {
  constructor(ctx, { Client = null, clientFactory = null, fetchImpl = globalThis.fetch } = {}) {
    this.ctx = ctx;
    this.Client = Client;
    this.fetchImpl = fetchImpl;
    this.clientFactory = clientFactory || ((connector, opts) => (
      this.Client ? new this.Client(connector, opts) : this._createDefaultClient(connector, opts)
    ));
    this.clients = new Map();
    this.toolDisposers = [];
    this.promptDisposers = new Map();
    this.oauthSessions = new Map();
    this._refreshingTokens = new Map();
    this._cachedResourcesText = "";
    this._serverInfoCache = new Map();
    this._handleNotification = () => {};
    this._handleServerRequest = () => {};
  }

  _createDefaultClient(connector, opts) {
    if (connector.transport === "stdio") return new McpStdioClient(connector, opts);
    if (connector.transport === "streamable-http") return new McpStreamableHttpClient(connector, opts);
    if (connector.transport === "sse") return new McpLegacySseClient(connector, opts);
    return new McpAutoHttpClient(connector, opts);
  }

  async startConnector(id, config) {
    if (!config) {
      config = this.getConfig?.()?.connectors?.find((c) => c.id === id);
    }
    if (!config) throw new Error(`Connector "${id}" not found`);

    const existing = this.clients.get(id);
    if (existing?.running) return config;

    const client = this.clientFactory(config, {
      log: this.ctx.log,
      fetchImpl: this.fetchImpl,
      onNotification: (method, params) => this._handleNotification(id, method, params),
      onRequest: (method, params) => this._handleServerRequest(id, method, params),
    });

    this.clients.set(id, client);
    try {
      await client.start();

      try {
        await client.ping();
      } catch (err) {
        this.ctx.log.debug?.(`[mcp:${id}] ping after start failed (non-fatal): ${err.message}`);
      }

      this._serverInfoCache = this._serverInfoCache || new Map();
      if (client.serverInfo) {
        this._serverInfoCache.set(id, {
          serverInfo: client.serverInfo,
          serverCapabilities: client.serverCapabilities,
        });
      }

      return config;
    } catch (err) {
      this.clients.delete(id);
      await client.stop().catch(() => {});
      throw err;
    }
  }

  async stopConnector(id) {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    this._serverInfoCache?.delete(id);
    await client.stop();
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

  getClient(connectorId) {
    return this.clients.get(connectorId);
  }

  getServerInfoCache(connectorId) {
    return this._serverInfoCache?.get(connectorId);
  }
}
