/**
 * speak-tool.test.js — speak Agent 工具测试
 */

import { describe, expect, it, vi } from "vitest";
import { createSpeakTool } from "../../lib/tools/speak-tool.js";

describe("createSpeakTool", () => {
  it("has correct name", () => {
    const tool = createSpeakTool({ onSpeak: vi.fn() });
    expect(tool.name).toBe("speak");
  });

  it("has description", () => {
    const tool = createSpeakTool({ onSpeak: vi.fn() });
    expect(tool.description).toBeTruthy();
    expect(typeof tool.description).toBe("string");
  });

  it("has parameters schema", () => {
    const tool = createSpeakTool({ onSpeak: vi.fn() });
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("calls onSpeak with text", async () => {
    const onSpeak = vi.fn().mockResolvedValue(undefined);
    const tool = createSpeakTool({ onSpeak });

    const result = await tool.execute("call-1", { text: "Hello there" });

    expect(onSpeak).toHaveBeenCalledWith({
      text: "Hello there",
      voice: undefined,
      lang: undefined,
      rate: undefined,
      pitch: undefined,
    });
    expect(result.content[0].text).toContain("Hello there");
  });

  it("passes all optional params to onSpeak", async () => {
    const onSpeak = vi.fn().mockResolvedValue(undefined);
    const tool = createSpeakTool({ onSpeak });

    await tool.execute("call-1", {
      text: "Bonjour",
      voice: "French Voice",
      lang: "fr-FR",
      rate: 0.8,
      pitch: 1.2,
    });

    expect(onSpeak).toHaveBeenCalledWith({
      text: "Bonjour",
      voice: "French Voice",
      lang: "fr-FR",
      rate: 0.8,
      pitch: 1.2,
    });
  });

  it("returns error for empty text", async () => {
    const onSpeak = vi.fn();
    const tool = createSpeakTool({ onSpeak });

    const result = await tool.execute("call-1", { text: "" });

    expect(result.content[0].text).toBe("Error: text is required for speak.");
    expect(onSpeak).not.toHaveBeenCalled();
  });

  it("returns error for whitespace-only text", async () => {
    const onSpeak = vi.fn();
    const tool = createSpeakTool({ onSpeak });

    const result = await tool.execute("call-1", { text: "   " });

    expect(result.content[0].text).toBe("Error: text is required for speak.");
    expect(onSpeak).not.toHaveBeenCalled();
  });

  it("returns error for missing text param", async () => {
    const onSpeak = vi.fn();
    const tool = createSpeakTool({ onSpeak });

    const result = await tool.execute("call-1", {});

    expect(result.content[0].text).toBe("Error: text is required for speak.");
    expect(onSpeak).not.toHaveBeenCalled();
  });

  it("handles onSpeak error", async () => {
    const onSpeak = vi.fn().mockRejectedValue(new Error("TTS engine not available"));
    const tool = createSpeakTool({ onSpeak });

    const result = await tool.execute("call-1", { text: "Test" });

    expect(result.content[0].text).toContain("Speak failed");
    expect(result.content[0].text).toContain("TTS engine not available");
  });

  it("works without onSpeak callback (noop)", async () => {
    const tool = createSpeakTool({ onSpeak: undefined });

    const result = await tool.execute("call-1", { text: "Hello" });

    expect(result.content[0].text).toContain("Hello");
  });

  it("truncates long text in result message", async () => {
    const onSpeak = vi.fn().mockResolvedValue(undefined);
    const tool = createSpeakTool({ onSpeak });

    const longText = "A".repeat(200);
    const result = await tool.execute("call-1", { text: longText });

    expect(result.content[0].text).toContain("...");
    expect(result.content[0].text.length).toBeLessThan(longText.length + 50);
  });
});
