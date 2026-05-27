import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock clipboardy before importing the adapter
vi.mock("clipboardy", () => ({
  default: {
    readSync: vi.fn(),
    writeSync: vi.fn(),
  },
}));

import { ClipboardAdapter } from "../lib/context/adapters/clipboard-adapter.js";
import clipboardy from "clipboardy";

describe("ClipboardAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports 返回 true（通用回退）", () => {
    expect(ClipboardAdapter.supports("any", "any")).toBe(true);
  });

  it("extract 返回剪贴板内容", async () => {
    clipboardy.readSync.mockReturnValue("copied text");
    const result = await ClipboardAdapter.extract("any", "any");
    expect(result.type).toBe("clipboard");
    expect(result.content).toBe("copied text");
  });

  it("extract 剪贴板为空时返回 null content", async () => {
    clipboardy.readSync.mockReturnValue("");
    const result = await ClipboardAdapter.extract("any", "any");
    expect(result.content).toBeNull();
  });
});
