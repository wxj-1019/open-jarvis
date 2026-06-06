import { describe, it, expect } from "vitest";
import { WindowsUiaAdapter } from "../../lib/context/adapters/windows-uia-adapter.js";

describe("WindowsUiaAdapter", () => {
  const adapter = new WindowsUiaAdapter();

  it("should return mock elements for VS Code", async () => {
    const result = await adapter.extract({
      app: "Code.exe",
      title: "main.js - open-jarvis - VS Code",
    });

    expect(result.app).toBe("Code.exe");
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.elements[0].role).toBe("tab");
  });

  it("should extract browser URL for Chrome", async () => {
    const result = await adapter.extract({
      app: "chrome.exe",
      title: "GitHub - Google Chrome",
    });

    expect(result.browserUrl).toContain("github.com");
  });

  it("should return null browserUrl for non-browser", async () => {
    const result = await adapter.extract({
      app: "Code.exe",
      title: "main.js",
    });

    expect(result.browserUrl).toBeNull();
  });

  it("should return default elements for unknown app", async () => {
    const result = await adapter.extract({
      app: "Unknown.exe",
      title: "Some Window",
    });

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].text).toBe("Some Window");
  });
});
