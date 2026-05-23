export class NotificationHandler {
  constructor(connectorManager, toolRegistry) {
    this.manager = connectorManager;
    this.toolRegistry = toolRegistry;
  }

  async handleNotification(connectorId, method, params) {
    const logErr = (err) => this.manager.ctx.log.error(`[mcp:${connectorId}] notification ${method} failed: ${err.message}`);
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
        this.manager.ctx.log.debug?.(`[mcp:${connectorId}] unhandled notification: ${method}`);
    }
  }

  async handleServerRequest(connectorId, method, params) {
    switch (method) {
      case "sampling/createMessage":
        return this.toolRegistry._handleSamplingRequest(connectorId, params);
      case "roots/list":
        return this._handleRootsList(connectorId);
      case "elicitation/create":
        return this.toolRegistry._handleElicitationRequest(connectorId, params);
      default:
        throw new Error(`Unsupported server request: ${method}`);
    }
  }

  async _onToolsChanged(connectorId) {
    this.manager.ctx.log.info(`[mcp:${connectorId}] tools changed, refreshing...`);
    try {
      await this.toolRegistry.refreshTools(connectorId);
      if (this.manager.ctx.bus) {
        this.manager.ctx.bus.emit("mcp:tools-changed", { connectorId });
      }
    } catch (err) {
      this.manager.ctx.log.error(`[mcp:${connectorId}] failed to refresh tools: ${err.message}`);
    }
  }

  async _onResourcesChanged(connectorId) {
    this.manager.ctx.log.info(`[mcp:${connectorId}] resources changed`);
    const client = this.manager.clients.get(connectorId);
    if (client?.running) {
      try {
        const { resources } = await client.listResources();
        const config = this.manager.getConfig();
        const connector = config.connectors.find((s) => s.id === connectorId);
        if (connector) {
          connector.resources = resources || [];
          this.manager.saveConfig(config);
        }
      } catch (err) {
        this.manager.ctx.log.debug?.(`[mcp:${connectorId}] failed to refresh resources: ${err.message}`);
      }
    }
    await this.manager._refreshCachedResourcesText();
    if (this.manager.ctx.bus) {
      this.manager.ctx.bus.emit("mcp:resources-changed", { connectorId });
    }
  }

  _onResourceUpdated(connectorId, params) {
    this.manager.ctx.log.debug?.(`[mcp:${connectorId}] resource updated: ${params?.uri}`);
    if (this.manager.ctx.bus) {
      this.manager.ctx.bus.emit("mcp:resources-changed", { connectorId, uri: params?.uri });
    }
  }

  async _onPromptsChanged(connectorId) {
    this.manager.ctx.log.info(`[mcp:${connectorId}] prompts changed, refreshing...`);
    const client = this.manager.clients.get(connectorId);
    if (client?.running) {
      try {
        const { prompts } = await client.listPrompts();
        const config = this.manager.getConfig();
        const connector = config.connectors.find((s) => s.id === connectorId);
        if (connector) {
          connector.prompts = prompts || [];
          this.manager.saveConfig(config);
        }
        this.manager._registerPrompts(connectorId, prompts || []);
      } catch (err) {
        this.manager.ctx.log.error(`[mcp:${connectorId}] failed to refresh prompts: ${err.message}`);
      }
    }
    if (this.manager.ctx.bus) {
      this.manager.ctx.bus.emit("mcp:prompts-changed", { connectorId });
    }
  }

  _onProgress(connectorId, params) {
    if (this.manager.ctx.bus) {
      this.manager.ctx.bus.emit("mcp:progress", {
        connectorId,
        progressToken: params?.progressToken,
        progress: params?.progress,
        total: params?.total,
        message: params?.message,
      });
    }
  }

  _onCancelled(connectorId, params) {
    const client = this.manager.clients.get(connectorId);
    if (client && params?.requestId != null) {
      client.rejectPending(params.requestId, new Error(params.reason || "Cancelled by server"));
    }
  }

  _onLogMessage(connectorId, params) {
    const level = params?.level || "info";
    const logger = params?.logger || connectorId;
    const data = params?.data;
    const logFn = this.manager.ctx.log[level] || this.manager.ctx.log.info;
    logFn(`[mcp:${logger}] ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  _handleRootsList(_connectorId) {
    const roots = [];
    if (this.manager.ctx.getCurrentWorkspace) {
      const cwd = this.manager.ctx.getCurrentWorkspace();
      if (cwd) {
        const normalized = cwd.replace(/\\/g, "/");
        roots.push({ uri: `file://${normalized}${normalized.endsWith("/") ? "" : "/"}`, name: "Workspace" });
      }
    }
    return { roots };
  }
}
