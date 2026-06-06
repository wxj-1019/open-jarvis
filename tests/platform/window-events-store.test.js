import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { WindowEventsStore } from "../../lib/db/window-events-store.js";

describe("WindowEventsStore", () => {
  let db;
  let store;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new WindowEventsStore(db);
    store.init();
  });

  afterEach(() => {
    db.close();
  });

  it("should insert and retrieve events", () => {
    store.insert({
      app: "Code.exe",
      title: "main.js",
      timestamp: Date.now(),
      duration_ms: 5000,
    });

    const events = store.queryRecent(10);
    expect(events.length).toBe(1);
    expect(events[0].app).toBe("Code.exe");
  });

  it("should query by time range", () => {
    const now = Date.now();
    store.insert({ app: "A", timestamp: now - 86400000 });
    store.insert({ app: "B", timestamp: now });

    const events = store.queryRange(now - 3600000, now + 1000);
    expect(events.length).toBe(1);
    expect(events[0].app).toBe("B");
  });

  it("should calculate app usage duration", () => {
    const now = Date.now();
    store.insert({ app: "Code.exe", timestamp: now - 3600000, duration_ms: 1800000 });
    store.insert({ app: "Code.exe", timestamp: now - 1800000, duration_ms: 1800000 });
    store.insert({ app: "chrome.exe", timestamp: now - 3600000, duration_ms: 3600000 });

    const stats = store.getAppDurationStats(now - 86400000, now);
    expect(stats["Code.exe"]).toBe(3600000);
    expect(stats["chrome.exe"]).toBe(3600000);
  });

  it("should count switches", () => {
    const now = Date.now();
    store.insert({ app: "A", timestamp: now - 2000 });
    store.insert({ app: "B", timestamp: now - 1000 });
    store.insert({ app: "C", timestamp: now });

    const count = store.getSwitchCount(now - 10000, now + 1000);
    expect(count).toBe(3);
  });

  it("should insert batch in transaction", () => {
    const now = Date.now();
    store.insertBatch([
      { app: "A", title: "a", timestamp: now, duration_ms: 1000, platform: "win32" },
      { app: "B", title: "b", timestamp: now + 1, duration_ms: 2000, platform: "win32" },
    ]);

    const events = store.queryRecent(10);
    expect(events.length).toBe(2);
  });

  it("should return empty for no results", () => {
    const events = store.queryRange(0, 1000);
    expect(events.length).toBe(0);

    const stats = store.getAppDurationStats(0, 1000);
    expect(Object.keys(stats).length).toBe(0);
  });
});
