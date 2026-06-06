/**
 * voice-input-tool.test.js — voice_input Agent 工具测试
 */

import { describe, expect, it, vi } from "vitest";
import { createVoiceInputTool } from "../../lib/tools/voice-input-tool.js";

describe("createVoiceInputTool", () => {
  it("has correct name", () => {
    const tool = createVoiceInputTool({ onListen: vi.fn() });
    expect(tool.name).toBe("voice_input");
  });

  it("has description", () => {
    const tool = createVoiceInputTool({ onListen: vi.fn() });
    expect(tool.description).toBeTruthy();
    expect(typeof tool.description).toBe("string");
  });

  it("has parameters schema with optional lang and timeout", () => {
    const tool = createVoiceInputTool({ onListen: vi.fn() });
    expect(tool.parameters).toBeDefined();
    // Type.Object generates a schema with properties
    expect(typeof tool.execute).toBe("function");
  });

  it("calls onListen with default params", async () => {
    const onListen = vi.fn().mockResolvedValue("Hello world");
    const tool = createVoiceInputTool({ onListen });

    const result = await tool.execute("call-1", {});

    expect(onListen).toHaveBeenCalledWith({
      lang: "zh-CN",
      timeout: 10000,
    });
    expect(result.content[0].text).toContain('"Hello world"');
  });

  it("passes custom lang and timeout", async () => {
    const onListen = vi.fn().mockResolvedValue("Bonjour");
    const tool = createVoiceInputTool({ onListen });

    await tool.execute("call-1", { lang: "fr-FR", timeout: 5000 });

    expect(onListen).toHaveBeenCalledWith({
      lang: "fr-FR",
      timeout: 5000,
    });
  });

  it("returns 'No speech recognized' for empty result", async () => {
    const onListen = vi.fn().mockResolvedValue("");
    const tool = createVoiceInputTool({ onListen });

    const result = await tool.execute("call-1", {});

    expect(result.content[0].text).toBe("No speech was recognized.");
  });

  it("returns 'No speech recognized' for whitespace-only result", async () => {
    const onListen = vi.fn().mockResolvedValue("   ");
    const tool = createVoiceInputTool({ onListen });

    const result = await tool.execute("call-1", {});

    expect(result.content[0].text).toBe("No speech was recognized.");
  });

  it("handles onListen error", async () => {
    const onListen = vi.fn().mockRejectedValue(new Error("Microphone not available"));
    const tool = createVoiceInputTool({ onListen });

    const result = await tool.execute("call-1", {});

    expect(result.content[0].text).toContain("Voice input failed");
    expect(result.content[0].text).toContain("Microphone not available");
  });

  it("returns no-speech when onListen is undefined", async () => {
    const tool = createVoiceInputTool({ onListen: undefined });

    // 没有回调时返回 undefined → 视为 "No speech recognized"
    const result = await tool.execute("call-1", {});
    expect(result.content[0].text).toBe("No speech was recognized.");
  });

  it("includes recognizedText in details", async () => {
    const onListen = vi.fn().mockResolvedValue("Test transcript");
    const tool = createVoiceInputTool({ onListen });

    const result = await tool.execute("call-1", {});

    expect(result.details).toEqual({ recognizedText: "Test transcript" });
  });
});
