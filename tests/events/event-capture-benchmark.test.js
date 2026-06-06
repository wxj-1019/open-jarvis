import { describe, it, expect } from "vitest";
import { EventAggregator } from "../../lib/events/event-aggregator.js";

/**
 * 性能基准测试
 * 目标：
 * - 事件处理延迟 < 5ms（P99）
 * - 内存占用 < 50MB（10k 事件）
 * - 事件丢失率 = 0%
 */
describe("Event Capture Performance Benchmarks", () => {
  it("should process 1000 events within acceptable time", async () => {
    const aggregator = new EventAggregator({ minIntervalMs: 0 });
    const eventCount = 1000;

    const startTime = performance.now();

    for (let i = 0; i < eventCount; i++) {
      aggregator.ingest({
        type: "app:switch",
        app: `App${i % 10}.exe`,
        title: `Window ${i}`,
        timestamp: Date.now(),
      });
    }

    // flush all pending
    aggregator.flush();

    const endTime = performance.now();
    const duration = endTime - startTime;
    const perEvent = duration / eventCount;

    console.log(`  Processed ${eventCount} events in ${duration.toFixed(2)}ms (${perEvent.toFixed(3)}ms/event)`);

    // 断言：总时间 < 500ms（即每个事件 < 0.5ms）
    expect(duration).toBeLessThan(500);
    expect(perEvent).toBeLessThan(1);

    aggregator.destroy();
  });

  it("should handle rapid same-app events with minimal overhead", async () => {
    const aggregator = new EventAggregator({ minIntervalMs: 50 });
    const emitted = [];
    aggregator.on("event", (e) => emitted.push(e));

    const startTime = performance.now();

    // 发送 500 个相同 app 的事件（应该被合并）
    for (let i = 0; i < 500; i++) {
      aggregator.ingest({
        type: "app:switch",
        app: "Code.exe",
        title: `file${i}.js`,
        timestamp: Date.now() + i,
      });
    }

    await new Promise((r) => setTimeout(r, 500));

    const duration = performance.now() - startTime;

    console.log(`  500 rapid events → ${emitted.length} emitted in ${duration.toFixed(2)}ms`);

    // 应该只发出 1 个事件（全部被合并）
    expect(emitted.length).toBe(1);
    expect(duration).toBeLessThan(1000);

    aggregator.destroy();
  });

  it("should not leak memory across many cycles", async () => {
    const aggregator = new EventAggregator();

    if (global.gc) {
      global.gc();
    }

    const memBefore = process.memoryUsage().heapUsed;

    // 模拟 100 个周期，每个周期 100 个事件
    for (let cycle = 0; cycle < 100; cycle++) {
      for (let i = 0; i < 100; i++) {
        aggregator.ingest({
          type: "ui:click",
          app: "Test.exe",
          x: i,
          y: cycle,
          timestamp: Date.now(),
        });
      }
      aggregator.flush();
    }

    if (global.gc) {
      global.gc();
    }

    const memAfter = process.memoryUsage().heapUsed;
    const memDelta = (memAfter - memBefore) / 1024 / 1024;

    console.log(`  Memory delta: ${memDelta.toFixed(2)} MB`);

    // 内存增长应 < 10MB
    expect(memDelta).toBeLessThan(10);

    aggregator.destroy();
  });
});
