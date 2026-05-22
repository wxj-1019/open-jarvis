import {
  createMcpToolDefinition,
  toMcpToolId,
  normalizeTool,
} from "./mcp-runtime-helpers.js";

export class ToolRegistry {
  constructor(connectorManager) {
    this.manager = connectorManager;
  }

  registerCachedTools() {
    for (const dispose of this.manager.toolDisposers.splice(0)) {
      try { dispose(); } catch { /* ignore disposal error */ }
    }
    const config = this.manager.getConfig();
    for (const connector of config.connectors) {
      for (const tool of connector.tools || []) {
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
          getGlobalEnabled: () => this.manager.getConfig().enabled,
          getAgentConfig: (agentId) => this.manager.getAgentConfig(agentId),
          callTool: (connectorId, toolName, args) => this.manager.callTool(connectorId, toolName, args),
        });
        this.manager.toolDisposers.push(this.manager.ctx.registerTool(definition));
      }
    }
  }

  async refreshTools(id) {
    const client = this.manager.clients.get(id);
    if (!client?.running) throw new Error(`MCP connector "${id}" is not running`);
    const tools = await client.listTools();
    const config = this.manager.getConfig();
    const connector = config.connectors.find((s) => s.id === id);
    if (!connector) throw new Error(`MCP connector "${id}" not found`);
    connector.tools = tools.map(normalizeTool).filter(Boolean);
    this.manager.saveConfig(config);
    this.registerCachedTools();

    if (client.serverCapabilities?.prompts) {
      try {
        const { prompts } = await client.listPrompts();
        connector.prompts = prompts || [];
        this.manager.saveConfig(config);
        this.manager._registerPrompts(id, prompts || []);
      } catch (err) {
        this.manager.ctx.log.debug?.(`[mcp:${id}] failed to list prompts: ${err.message}`);
      }
    }

    if (client.serverCapabilities?.resources) {
      try {
        const { resources } = await client.listResources();
        connector.resources = resources || [];
        this.manager.saveConfig(config);
      } catch (err) {
        this.manager.ctx.log.debug?.(`[mcp:${id}] failed to list resources: ${err.message}`);
      }
    }

    this.manager._refreshCachedResourcesText().catch(() => {});

    return connector.tools;
  }

  async callTool(connectorId, toolName, args) {
    const config = this.manager.getConfig();
    if (!config.enabled) throw new Error("MCP connectors are disabled globally");
    const client = this.manager.clients.get(connectorId);
    if (!client?.running) throw new Error(`MCP connector "${connectorId}" is not running`);
    try {
      return await client.callTool(toolName, args);
    } catch (err) {
      if (err?.status === 401 || err?.message?.includes("401") || err?.message?.includes("authentication")) {
        const currentConfig = this.manager.getConfig();
        const connector = currentConfig.connectors.find((c) => c.id === connectorId);
        if (connector?.authType === "oauth" && connector?.oauth?.refreshToken) {
          this.manager.ctx.log.info(`[mcp:${connectorId}] token expired, attempting refresh...`);
          try {
            await this.manager._refreshOAuthToken(connectorId);
            const newClient = this.manager.clients.get(connectorId);
            if (newClient?.running) {
              return newClient.callTool(toolName, args);
            }
          } catch (refreshErr) {
            this.manager.ctx.log.error(`[mcp:${connectorId}] OAuth refresh failed: ${refreshErr.message}`);
          }
        }
      }
      throw err;
    }
  }

  async _handleSamplingRequest(connectorId, params) {
    if (this.manager.ctx.bus?.request) {
      const result = await this.manager.ctx.bus.request("llm:complete", {
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

  async _handleElicitationRequest(connectorId, params) {
    if (!params?.message || typeof params.message !== "string") {
      return { action: "cancel", content: {} };
    }

    if (this.manager.ctx.bus?.request) {
      const result = await this.manager.ctx.bus.request("mcp:elicit", {
        connectorId,
        message: params.message,
        description: params.description || "",
        requestedSchema: params.requestedSchema || { type: "object", properties: {} },
      });

      if (result?.action && ["accept", "decline", "cancel"].includes(result.action)) {
        return {
          action: result.action,
          content: result.action === "accept" ? (result.content || {}) : {},
        };
      }
      return { action: "cancel", content: {} };
    }

    this.manager.ctx.log.warn?.(`[mcp:${connectorId}] elicitation not available: no UI bridge`);
    return { action: "cancel", content: {} };
  }
}
