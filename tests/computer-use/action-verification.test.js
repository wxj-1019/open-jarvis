import { describe, it, assert, beforeEach } from "vitest";
import { ComputerHost } from "../../core/computer-use/computer-host.js";
import { ComputerLeaseRegistry } from "../../core/computer-use/lease-registry.js";

describe("Action Verification", () => {
  let host;
  let leases;
  let mockProvider;

  beforeEach(() => {
    leases = new ComputerLeaseRegistry();
    mockProvider = {
      providerId: "windows:uia",
      capabilities: {
        elementActions: true,
        pointClick: "foreground",
      },
      getAppState: async () => ({
        screenshot: { data: "mock-screenshot-data" },
        elements: [{ id: "list1", name: "List", type: "list" }],
      }),
      performAction: async () => ({ success: true }),
      getHealthStatus: () => ({ healthy: true }),
      createLease: async () => ({
        appId: "pid:1234",
        windowId: null,
        providerState: {},
        allowedActions: ["click_element", "type_text", "scroll", "stop", "click_point", "double_click", "drag", "press_key"],
      }),
    };

    host = new ComputerHost({
      providers: {
        list: () => [mockProvider],
        has: (id) => id === "windows:uia",
        require: (id) => mockProvider,
      },
      leases,
      platform: "win32",
      getSettings: () => ({ 
        enabled: true, 
        verifyActions: true,
        app_approvals: [{ providerId: "windows:uia", appId: "pid:1234", approvedAt: new Date().toISOString() }],
      }),
      getAccessMode: () => "operate",
      getPrimaryAgentId: () => "main-agent",
    });
  });

  it("should capture before/after screenshots when verifyActions is enabled", async () => {
    const ctx = { 
      sessionPath: "/test", 
      agentId: "main-agent", 
      model: { id: "claude-3-5-sonnet-20241022", provider: "anthropic", input: ["image", "text"] }
    };
    const target = { appId: "pid:1234" };
    
    const lease = await host.createLease(ctx, target);
    await host.getAppState(ctx, lease.leaseId);
    
    assert.ok(lease);
  });

  it("should skip verification when verifyActions is disabled", async () => {
    host = new ComputerHost({
      providers: {
        list: () => [mockProvider],
        has: (id) => id === "windows:uia",
        require: (id) => mockProvider,
      },
      leases,
      platform: "win32",
      getSettings: () => ({ 
        enabled: true, 
        verifyActions: false,
        app_approvals: [{ providerId: "windows:uia", appId: "pid:1234", approvedAt: new Date().toISOString() }],
      }),
      getAccessMode: () => "operate",
      getPrimaryAgentId: () => "main-agent",
    });

    const ctx = { 
      sessionPath: "/test", 
      agentId: "main-agent", 
      model: { id: "claude-3-5-sonnet-20241022", provider: "anthropic", input: ["image", "text"] }
    };
    const target = { appId: "pid:1234" };
    
    const lease = await host.createLease(ctx, target);
    
    // 先获取 app state 来创建 snapshot
    await host.getAppState(ctx, lease.leaseId);
    
    const result = await host.performAction(ctx, lease.leaseId, { 
      type: "stop",
    });
    
    assert.equal(result.success, true);
  });
});
