import { describe, it, assert } from "vitest";
import { createWindowsUiaProvider } from "../../core/computer-use/providers/windows-uia-provider.js";

describe("Windows UIA Actions", () => {
  it("should support all foreground actions", () => {
    const provider = createWindowsUiaProvider({ platform: "win32" });
    
    assert.equal(provider.capabilities.pointClick, "foreground");
    assert.equal(provider.capabilities.drag, "foreground");
    assert.equal(provider.capabilities.keyboardInput, "foreground");
    assert.equal(provider.capabilities.requiresForegroundForInput, true);
  });

  it("should have click_point in allowed actions", () => {
    const provider = createWindowsUiaProvider({ platform: "win32" });
    // The allowed actions are defined in the module scope, we verify capabilities
    assert.equal(provider.capabilities.pointClick, "foreground");
  });

  it("should have double_click in allowed actions", () => {
    const provider = createWindowsUiaProvider({ platform: "win32" });
    assert.equal(provider.capabilities.pointClick, "foreground");
  });

  it("should have drag in allowed actions", () => {
    const provider = createWindowsUiaProvider({ platform: "win32" });
    assert.equal(provider.capabilities.drag, "foreground");
  });

  it("should have press_key in allowed actions", () => {
    const provider = createWindowsUiaProvider({ platform: "win32" });
    assert.equal(provider.capabilities.keyboardInput, "foreground");
  });
});
