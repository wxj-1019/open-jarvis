import { describe, it, expect } from "vitest";
import { MacosEventTap } from "../lib/events/platform/macos-event-tap.js";

describe("MacosEventTap", () => {
  it("should emit app:switch on app activation", () => {
    const adapter = new MacosEventTap();
    const events = [];
    adapter.on("event", (e) => events.push(e));
    adapter._simulateNativeEvent("activated", { app: "Xcode", title: "main.swift" });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("app:switch");
    expect(events[0].app).toBe("Xcode");
    expect(events[0].platform).toBe("darwin");
  });

  it("should report correct platform", () => {
    const adapter = new MacosEventTap();
    expect(adapter.getPlatform()).toBe("darwin");
  });
});