import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventCaptureEngine } from "../../lib/events/event-capture-engine.js";
import { EventAggregator } from "../../lib/events/event-aggregator.js";
import { CapabilityDetector } from "../../lib/events/capability-detector.js";
import { IdleFallbackMonitor } from "../../lib/events/idle-fallback-monitor.js";

describe("Event Capture Integration", () => {
  describe("EventAggregator + IdleFallbackMonitor", () => {
    it("should not conflict when both emit events", async () => {
      const aggregator = new EventAggregator();
      const idleMonitor = new IdleFallbackMonitor({
        idleThresholdMs: 50,
        checkIntervalMs: 25,
      });

      const events = [];
      aggregator.on("event", (e) => events.push({ source: "aggregator", ...e }));
      idleMonitor.on("idle", (e) => events.push({ source: "idle", ...e }));

      await idleMonitor.start();

      // 模拟 aggregator 事件（在 idleMonitor 启动后发送）
      aggregator.ingest({ type: "app:switch", app: "Test.exe", timestamp: Date.now() });

      // 等待 debounce + idle 检测
      await new Promise((r) => setTimeout(r, 400));
      await idleMonitor.stop();

      // aggregator 应该发出 1 个事件（debounced）
      // idle 应该发出至少 1 个事件
      const aggEvents = events.filter((e) => e.source === "aggregator");
      const idleEvents = events.filter((e) => e.source === "idle");

      expect(aggEvents.length).toBeGreaterThanOrEqual(1);
      expect(idleEvents.length).toBeGreaterThanOrEqual(1);

      aggregator.destroy();
    });
  });

  describe("CapabilityDetector + EventCaptureEngine", () => {
    it("should use fallback when capabilities are unavailable", async () => {
      const engine = new EventCaptureEngine({
        platform: "win32",
        useNative: false,
      });

      const caps = await new CapabilityDetector("win32").detect();
      expect(caps.appSwitch.available).toBe(true);
      expect(caps.appSwitch.platform).toBe("win32");

      await engine.start();
      expect(engine.isRunning()).toBe(true);
      expect(engine.getCapabilities()).toBeDefined();
      await engine.stop();
    });
  });

  describe("EventAggregator deduplication stress test", () => {
    it("should deduplicate rapid same-app switches", async () => {
      const aggregator = new EventAggregator({ minIntervalMs: 100 });
      const events = [];
      aggregator.on("event", (e) => events.push(e));

      const now = Date.now();
      // 快速发送 10 个相同 app 的切换事件
      for (let i = 0; i < 10; i++) {
        aggregator.ingest({
          type: "app:switch",
          app: "Code.exe",
          title: `file${i}.js`,
          timestamp: now + i * 10,
        });
      }

      // 等待 debounce 完成
      await new Promise((r) => setTimeout(r, 500));

      // 应该只发出 1 个事件（因为都在 debounce 窗口内）
      expect(events.length).toBe(1);
      expect(events[0].app).toBe("Code.exe");

      aggregator.destroy();
    });

    it("should emit separate events for different apps", async () => {
      const aggregator = new EventAggregator({ minIntervalMs: 50 });
      const events = [];
      aggregator.on("event", (e) => events.push(e));

      const now = Date.now();
      aggregator.ingest({ type: "app:switch", app: "Code.exe", timestamp: now });
      aggregator.ingest({ type: "app:switch", app: "Chrome.exe", timestamp: now + 200 });

      await new Promise((r) => setTimeout(r, 500));

      expect(events.length).toBe(2);
      expect(events[0].app).toBe("Code.exe");
      expect(events[1].app).toBe("Chrome.exe");

      aggregator.destroy();
    });
  });

  describe("Full pipeline: engine → aggregator → output", () => {
    it("should emit aggregated events from engine", async () => {
      const engine = new EventCaptureEngine({
        platform: "win32",
        useNative: false,
        aggregatorOptions: { minIntervalMs: 50 },
      });

      const events = [];
      engine.on("event", (e) => events.push(e));

      await engine.start();

      // 等待 polling 产生事件（需要足够时间）
      await new Promise((r) => setTimeout(r, 1200));

      await engine.stop();

      // 应该至少收到一个事件（当前窗口的 app:switch）
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]).toHaveProperty("type");
      expect(events[0]).toHaveProperty("app");
    });
  });
});
