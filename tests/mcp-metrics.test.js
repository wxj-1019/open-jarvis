import { describe, it, expect, beforeEach } from "vitest";
import { McpMetricsCollector } from "../plugins/mcp/lib/mcp-metrics.js";

describe("McpMetricsCollector", () => {
  let collector;

  beforeEach(() => {
    collector = new McpMetricsCollector();
  });

  describe("recordRequest", () => {
    it("records a successful request", () => {
      collector.recordRequest("conn-1", "tools/list", 150, true);
      const stats = collector.getConnectorStats("conn-1");
      expect(stats.totalRequests).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
      expect(stats.avgLatencyMs).toBe(150);
    });

    it("records a failed request", () => {
      collector.recordRequest("conn-1", "tools/list", 200, false);
      const stats = collector.getConnectorStats("conn-1");
      expect(stats.totalRequests).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(1);
      expect(stats.avgLatencyMs).toBe(200);
    });

    it("accumulates multiple requests and calculates average", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.recordRequest("conn-1", "tools/call", 200, true);
      collector.recordRequest("conn-1", "initialize", 300, false);

      const stats = collector.getConnectorStats("conn-1");
      expect(stats.totalRequests).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.avgLatencyMs).toBe(200);
    });

    it("tracks requests per connector independently", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.recordRequest("conn-2", "tools/list", 200, true);

      const stats1 = collector.getConnectorStats("conn-1");
      const stats2 = collector.getConnectorStats("conn-2");

      expect(stats1.totalRequests).toBe(1);
      expect(stats1.avgLatencyMs).toBe(100);
      expect(stats2.totalRequests).toBe(1);
      expect(stats2.avgLatencyMs).toBe(200);
    });

    it("rounds average latency to nearest integer", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.recordRequest("conn-1", "tools/list", 101, true);
      collector.recordRequest("conn-1", "tools/list", 102, true);

      const stats = collector.getConnectorStats("conn-1");
      expect(stats.avgLatencyMs).toBe(101);
    });

    it("handles single request with rounding", () => {
      collector.recordRequest("conn-1", "tools/list", 100.7, true);
      const stats = collector.getConnectorStats("conn-1");
      expect(stats.avgLatencyMs).toBe(101);
    });
  });

  describe("recordToolCall", () => {
    it("records a successful tool call", () => {
      collector.recordToolCall("conn-1", "search", 250, true);
      const stats = collector.getToolStats("conn-1", "search");
      expect(stats.totalCalls).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
      expect(stats.avgLatencyMs).toBe(250);
    });

    it("records a failed tool call", () => {
      collector.recordToolCall("conn-1", "search", 300, false);
      const stats = collector.getToolStats("conn-1", "search");
      expect(stats.totalCalls).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(1);
    });

    it("accumulates multiple tool calls", () => {
      collector.recordToolCall("conn-1", "search", 100, true);
      collector.recordToolCall("conn-1", "search", 200, true);
      collector.recordToolCall("conn-1", "search", 300, false);

      const stats = collector.getToolStats("conn-1", "search");
      expect(stats.totalCalls).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.avgLatencyMs).toBe(200);
    });

    it("tracks tool calls independently per connector/tool", () => {
      collector.recordToolCall("conn-1", "search", 100, true);
      collector.recordToolCall("conn-1", "fetch", 200, true);
      collector.recordToolCall("conn-2", "search", 300, true);

      const searchConn1 = collector.getToolStats("conn-1", "search");
      const fetchConn1 = collector.getToolStats("conn-1", "fetch");
      const searchConn2 = collector.getToolStats("conn-2", "search");

      expect(searchConn1.totalCalls).toBe(1);
      expect(searchConn1.avgLatencyMs).toBe(100);
      expect(fetchConn1.totalCalls).toBe(1);
      expect(fetchConn1.avgLatencyMs).toBe(200);
      expect(searchConn2.totalCalls).toBe(1);
      expect(searchConn2.avgLatencyMs).toBe(300);
    });
  });

  describe("getConnectorStats", () => {
    it("returns empty stats for unknown connector", () => {
      const stats = collector.getConnectorStats("unknown");
      expect(stats).toEqual({
        connectorId: "unknown",
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgLatencyMs: 0,
      });
    });

    it("calculates success rate as decimal", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.recordRequest("conn-1", "tools/list", 100, false);

      const stats = collector.getConnectorStats("conn-1");
      const expected = 2 / 3;
      expect(Math.abs(stats.successRate - expected)).toBeLessThan(0.001);
    });

    it("returns success rate of 1.0 for all successes", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.recordRequest("conn-1", "tools/list", 100, true);

      const stats = collector.getConnectorStats("conn-1");
      expect(stats.successRate).toBe(1.0);
    });

    it("returns success rate of 0.0 for all failures", () => {
      collector.recordRequest("conn-1", "tools/list", 100, false);
      collector.recordRequest("conn-1", "tools/list", 100, false);

      const stats = collector.getConnectorStats("conn-1");
      expect(stats.successRate).toBe(0.0);
    });

    it("includes connectorId in response", () => {
      const stats = collector.getConnectorStats("my-connector");
      expect(stats.connectorId).toBe("my-connector");
    });
  });

  describe("getToolStats", () => {
    it("returns empty stats for unknown tool", () => {
      const stats = collector.getToolStats("conn-1", "unknown");
      expect(stats).toEqual({
        connectorId: "conn-1",
        toolName: "unknown",
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgLatencyMs: 0,
      });
    });

    it("calculates success rate for tool calls", () => {
      collector.recordToolCall("conn-1", "search", 100, true);
      collector.recordToolCall("conn-1", "search", 100, false);

      const stats = collector.getToolStats("conn-1", "search");
      expect(stats.successRate).toBe(0.5);
    });

    it("includes connectorId and toolName in response", () => {
      const stats = collector.getToolStats("my-conn", "my-tool");
      expect(stats.connectorId).toBe("my-conn");
      expect(stats.toolName).toBe("my-tool");
    });
  });

  describe("getAllStats", () => {
    it("returns stats for all connectors", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.recordRequest("conn-2", "tools/list", 200, true);

      const allStats = collector.getAllStats();
      expect(allStats).toHaveLength(2);
      expect(allStats.map((s) => s.connectorId)).toContain("conn-1");
      expect(allStats.map((s) => s.connectorId)).toContain("conn-2");
    });

    it("returns empty array when no data", () => {
      const allStats = collector.getAllStats();
      expect(allStats).toEqual([]);
    });

    it("includes tool stats per connector", () => {
      collector.recordToolCall("conn-1", "search", 100, true);
      collector.recordToolCall("conn-1", "fetch", 200, true);

      const allStats = collector.getAllStats();
      expect(allStats).toHaveLength(1);
      expect(allStats[0].tools).toBeDefined();
      expect(Object.keys(allStats[0].tools)).toHaveLength(2);
      expect(allStats[0].tools).toHaveProperty("search");
      expect(allStats[0].tools).toHaveProperty("fetch");
    });
  });

  describe("reset", () => {
    it("clears all request metrics", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.reset();
      const stats = collector.getConnectorStats("conn-1");
      expect(stats.totalRequests).toBe(0);
    });

    it("clears all tool metrics", () => {
      collector.recordToolCall("conn-1", "search", 100, true);
      collector.reset();
      const stats = collector.getToolStats("conn-1", "search");
      expect(stats.totalCalls).toBe(0);
    });

    it("allows recording after reset", () => {
      collector.recordRequest("conn-1", "tools/list", 100, true);
      collector.reset();
      collector.recordRequest("conn-1", "tools/list", 200, true);

      const stats = collector.getConnectorStats("conn-1");
      expect(stats.totalRequests).toBe(1);
      expect(stats.avgLatencyMs).toBe(200);
    });
  });

  describe("edge cases", () => {
    it("handles zero latency", () => {
      collector.recordRequest("conn-1", "tools/list", 0, true);
      const stats = collector.getConnectorStats("conn-1");
      expect(stats.avgLatencyMs).toBe(0);
    });

    it("handles very large latency values", () => {
      collector.recordRequest("conn-1", "tools/list", 999999, true);
      const stats = collector.getConnectorStats("conn-1");
      expect(stats.avgLatencyMs).toBe(999999);
    });

    it("handles empty connectorId", () => {
      collector.recordRequest("", "tools/list", 100, true);
      const stats = collector.getConnectorStats("");
      expect(stats.totalRequests).toBe(1);
    });

    it("handles empty toolName", () => {
      collector.recordToolCall("conn-1", "", 100, true);
      const stats = collector.getToolStats("conn-1", "");
      expect(stats.totalCalls).toBe(1);
    });
  });
});
