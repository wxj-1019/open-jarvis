import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventCaptureEngine } from "../../lib/events/event-capture-engine.js";

describe("EventCaptureEngine", () => {
  let engine;

  beforeEach(() => {
    engine = new EventCaptureEngine({ platform: "win32" });
  });

  afterEach(async () => {
    if (engine && engine.isRunning()) {
      await engine.stop();
    }
  });

  it("should start and stop without error", async () => {
    await engine.start();
    expect(engine.isRunning()).toBe(true);
    await engine.stop();
    expect(engine.isRunning()).toBe(false);
  });

  it("should emit aggregated events through EventBus", async () => {
    const events = [];
    engine.on("event", (e) => events.push(e));
    await engine.start();

    // ģ��ƽ̨�����������¼�
    engine._adapter._simulateNativeEvent("foreground", { app: "Code.exe", title: "main.js" });

    // �ȴ��ۺ��� debounce ��ɣ�app:switch debounce 300ms��
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("app:switch");
  });
});
