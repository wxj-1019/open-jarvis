import { describe, it, expect } from "vitest";
import { WindowsEventHook } from "../../lib/events/platform/windows-event-hook.js";

describe("WindowsEventHook", () => {
  it("should emit app:switch on foreground window change", async () => {
    const adapter = new WindowsEventHook();
    const events = [];
    adapter.on("event", (e) => events.push(e));
    adapter._simulateNativeEvent("foreground", { app: "Code.exe", title: "main.js" });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("app:switch");
    expect(events[0].app).toBe("Code.exe");
    expect(events[0].platform).toBe("win32");
  });

  it("should not emit if same app within debounce", async () => {
    const adapter = new WindowsEventHook();
    const events = [];
    adapter.on("event", (e) => events.push(e));
    adapter._simulateNativeEvent("foreground", { app: "Code.exe", title: "main.js" });
    adapter._simulateNativeEvent("foreground", { app: "Code.exe", title: "main.js" });
    expect(events.length).toBe(1);
  });
});