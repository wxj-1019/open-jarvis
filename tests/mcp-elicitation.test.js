import { describe, expect, it, beforeEach, vi } from "vitest";

describe("MCP Elicitation Support", () => {
  describe("Client Capabilities", () => {
    it("stdio client declares elicitation capability in initialize", async () => {
      const { McpStdioClient } = await import("../plugins/mcp/lib/mcp-stdio-client.js");
      const client = new McpStdioClient({ id: "test", command: "echo" });

      const initParams = {
        protocolVersion: "2025-11-25",
        capabilities: {
          sampling: {},
          roots: { listChanged: true },
          elicitation: {},
        },
        clientInfo: { name: "test", version: "1.0" },
      };

      expect(initParams.capabilities.elicitation).toBeDefined();
    });

    it("http client initialize includes elicitation capability", async () => {
      const { McpStreamableHttpClient } = await import("../plugins/mcp/lib/mcp-http-client.js");
      const client = new McpStreamableHttpClient({ id: "test", url: "http://example.com" });

      const initParams = {
        protocolVersion: "2025-11-25",
        capabilities: {
          sampling: {},
          roots: { listChanged: true },
          elicitation: {},
        },
        clientInfo: { name: "test", version: "1.0" },
      };

      expect(initParams.capabilities.elicitation).toBeDefined();
    });
  });

  describe("Elicitation Request Handling", () => {
    it("handles elicitation/create request via EventBus", async () => {
      const { ToolRegistry } = await import("../plugins/mcp/lib/tool-registry.js");

      const mockBus = {
        request: vi.fn().mockResolvedValue({ action: "accept", content: { confirm: true } }),
      };
      const mockManager = {
        ctx: {
          bus: mockBus,
          log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
        },
      };

      const toolRegistry = new ToolRegistry(mockManager);
      const result = await toolRegistry._handleElicitationRequest("test-connector", {
        message: "确认删除此文件?",
        description: "此操作不可撤销",
        requestedSchema: {
          type: "object",
          properties: { confirm: { type: "boolean" } },
        },
      });

      expect(mockBus.request).toHaveBeenCalledWith("mcp:elicit", expect.any(Object));
      expect(result.action).toBe("accept");
      expect(result.content).toEqual({ confirm: true });
    });

    it("returns cancel when no UI bridge available", async () => {
      const { ToolRegistry } = await import("../plugins/mcp/lib/tool-registry.js");

      const mockManager = {
        ctx: {
          bus: null,
          log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
        },
      };

      const toolRegistry = new ToolRegistry(mockManager);
      const result = await toolRegistry._handleElicitationRequest("test-connector", {
        message: "确认操作?",
      });

      expect(result.action).toBe("cancel");
      expect(mockManager.ctx.log.warn).toHaveBeenCalled();
    });

    it("returns cancel when user declines", async () => {
      const { ToolRegistry } = await import("../plugins/mcp/lib/tool-registry.js");

      const mockBus = {
        request: vi.fn().mockResolvedValue({ action: "decline" }),
      };
      const mockManager = {
        ctx: {
          bus: mockBus,
          log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
        },
      };

      const toolRegistry = new ToolRegistry(mockManager);
      const result = await toolRegistry._handleElicitationRequest("test-connector", {
        message: "确认操作?",
      });

      expect(result.action).toBe("decline");
    });
  });

  describe("Capability Registration", () => {
    it("registers mcp:elicit capability on load", async () => {
      const { McpRuntime } = await import("../plugins/mcp/lib/mcp-runtime.js");

      const mockBus = {
        registerCapability: vi.fn(),
      };
      const mockCtx = {
        bus: mockBus,
        log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
        config: {
          get: vi.fn().mockReturnValue({ enabled: false, connectors: [] }),
          set: vi.fn(),
        },
        dataDir: "/tmp/test-mcp",
        getCurrentWorkspace: vi.fn().mockReturnValue(null),
        registerTool: vi.fn(),
      };

      const mockManager = {
        ctx: mockCtx,
        getConfig: () => ({ enabled: false, connectors: [] }),
        toolDisposers: [],
      };

      const { ToolRegistry } = await import("../plugins/mcp/lib/tool-registry.js");
      const { ConnectorManager } = await import("../plugins/mcp/lib/connector-manager.js");

      vi.spyOn(ConnectorManager.prototype, 'constructor').mockImplementation(function() {
        this.clients = new Map();
        this.toolDisposers = [];
        this.promptDisposers = new Map();
        this.oauthSessions = new Map();
        this._refreshingTokens = new Map();
        this._cachedResourcesText = "";
        this._serverInfoCache = new Map();
      });

      const runtime = new McpRuntime(mockCtx);
      runtime._connectorManager = mockManager;
      runtime._toolRegistry = new ToolRegistry(mockManager);

      await runtime.load();

      expect(mockBus.registerCapability).toHaveBeenCalledWith("mcp:elicit", { type: "request" });
    });
  });
});

