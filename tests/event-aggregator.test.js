import { describe, it, expect, beforeEach } from "vitest";
import { EventAggregator } from "../lib/events/event-aggregator.js";

describe("EventAggregator", () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new EventAggregator({
      minIntervalMs: 200,
      maxIntervalMs: 10000,
    });
  });

  it("should deduplicate same app switch within debounce window", () => {
    const events = [
      { type: "app:switch", app: "Code.exe", title: "main.js", timestamp: 1000 },
      { type: "app:switch", app: "Code.exe", title: "main.js", timestamp: 1100 },
      { type: "app:switch", app: "Code.exe", title: "main.js", timestamp: 1200 },
    ];

    const results = [];
    aggregator.on("event", (e) => results.push(e));

    events.forEach((e) => aggregator.ingest(e));
    aggregator.flush();

    expect(results.length).toBe(1);
    expect(results[0].timestamp).toBe(1200);
  });

  it("should emit different app switches immediately", () => {
    const results = [];
    aggregator.on("event", (e) => results.push(e));

    aggregator.ingest({ type: "app:switch", app: "Code.exe", timestamp: 1000 });
    aggregator.ingest({ type: "app:switch", app: "chrome", timestamp: 1500 });

    // 不同 app 应该都发射（但受 debounce 影响，需要等待）
    // 使用同步检查 pending
    expect(aggregator._pendingMerge.size).toBe(2);
  });

  it("should respect min interval between same event type", () => {
    const results = [];
    aggregator.on("event", (e) => results.push(e));

    aggregator.ingest({ type: "ui:click", app: "Code.exe", x: 10, y: 20, timestamp: Date.now() });
    aggregator.ingest({ type: "ui:click", app: "Code.exe", x: 15, y: 25, timestamp: Date.now() });

    // 第二个应该被节流
    expect(aggregator._pendingMerge.size).toBe(1); // 第一个在 debounce，第二个被节流
  });

  it("should flush pending events on demand", () => {
    const results = [];
    aggregator.on("event", (e) => results.push(e));

    aggregator.ingest({ type: "app:switch", app: "Code.exe", timestamp: 1000 });
    expect(results.length).toBe(0); // 还在 debounce

    aggregator.flush();
    expect(results.length).toBe(1);
    expect(results[0].app).toBe("Code.exe");
  });

  it("should merge typing events within debounce window", () => {
    const results = [];
    aggregator.on("event", (e) => results.push(e));

    aggregator.ingest({ type: "input:typing", app: "Code.exe", duration: 100, timestamp: 1000 });
    aggregator.ingest({ type: "input:typing", app: "Code.exe", duration: 200, timestamp: 1200 });
    aggregator.ingest({ type: "input:typing", app: "Code.exe", duration: 300, timestamp: 1400 });

    // 三个合并为一个，duration 取最新
    aggregator.flush();
    expect(results.length).toBe(1);
    expect(results[0].duration).toBe(300);
  });
});
