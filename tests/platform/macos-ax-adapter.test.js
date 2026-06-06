import { describe, it, expect } from "vitest";
import { MacosAxAdapter } from "../../lib/context/adapters/macos-ax-adapter.js";

describe("MacosAxAdapter", () => {
  it("should return mock elements for Xcode", async () => {
    const adapter = new MacosAxAdapter();
    const result = await adapter.extract({
      app: "Xcode.app",
      title: "ContentView.swift",
    });

    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.browserUrl).toBeNull();
  });

  it("should return browserUrl for Safari", async () => {
    const adapter = new MacosAxAdapter();
    const result = await adapter.extract({
      app: "Safari.app",
      title: "Apple",
    });

    expect(result.browserUrl).toBe("https://apple.com");
  });
});
