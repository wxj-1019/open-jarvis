import { describe, it, expect } from "vitest";
import { CapabilityDetector } from "../../lib/events/capability-detector.js";

describe("CapabilityDetector", () => {
  it("should detect all capabilities on win32", async () => {
    const detector = new CapabilityDetector("win32");
    const caps = await detector.detect();

    expect(caps.appSwitch.available).toBe(true);
    expect(caps.appSwitch.platform).toBe("win32");
    expect(caps.windowFocus.available).toBe(true);
    expect(caps.mouseClick.available).toBe(true);
    expect(caps.typingPause.available).toBe(true);
    expect(caps.clipboardCopy.available).toBe(true);
  });

  it("should report unavailable for unsupported platform", async () => {
    const detector = new CapabilityDetector("freebsd");
    const caps = await detector.detect();

    expect(caps.appSwitch.available).toBe(false);
    expect(caps.appSwitch.reason).toContain("unsupported");
  });
});
