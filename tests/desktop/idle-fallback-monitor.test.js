import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IdleFallbackMonitor } from "../../lib/events/idle-fallback-monitor.js";

describe("IdleFallbackMonitor", () => {
  let monitor;

  afterEach(async () => {
    if (monitor) await monitor.stop();
  });

  it("should emit idle event after threshold", async () => {
    monitor = new IdleFallbackMonitor({
      idleThresholdMs: 100,
      checkIntervalMs: 50,
    });

    const events = [];
    monitor.on("idle", (e) => events.push(e));

    await monitor.start();

    await new Promise((r) => setTimeout(r, 200));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("idle:fallback");
    expect(events[0].idleTimeMs).toBeGreaterThanOrEqual(100);
  });

  it("should not emit if activity recorded", async () => {
    monitor = new IdleFallbackMonitor({
      idleThresholdMs: 100,
      checkIntervalMs: 50,
    });

    const events = [];
    monitor.on("idle", (e) => events.push(e));

    await monitor.start();

    monitor.recordActivity();
    await new Promise((r) => setTimeout(r, 80));
    monitor.recordActivity();
    await new Promise((r) => setTimeout(r, 80));

    expect(events.length).toBe(0);
  });

  it("should report running state correctly", async () => {
    monitor = new IdleFallbackMonitor();
    expect(monitor.isRunning()).toBe(false);
    await monitor.start();
    expect(monitor.isRunning()).toBe(true);
    await monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });
});
