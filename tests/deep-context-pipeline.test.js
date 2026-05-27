import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "../hub/event-bus.js";

// Mock adapters（在 import pipeline 之前）
vi.mock("../lib/context/adapters/ide-content-adapter.js", () => ({
  IDEContentAdapter: {
    supports: vi.fn(() => false),
    extract: vi.fn(),
  },
}));

vi.mock("../lib/context/adapters/clipboard-adapter.js", () => ({
  ClipboardAdapter: {
    supports: vi.fn(() => true),
    extract: vi.fn(() => Promise.resolve({ type: "clipboard", content: "test", metadata: {} })),
  },
}));

const { DeepContextPipeline } = await import("../lib/context/deep-context-pipeline.js");
const { ClipboardAdapter } = await import("../lib/context/adapters/clipboard-adapter.js");

describe("DeepContextPipeline", () => {
  let bus;
  let pipeline;

  beforeEach(() => {
    bus = new EventBus();
    pipeline = new DeepContextPipeline({
      eventBus: bus,
      options: { privacyLevel: "standard", l2DwellMs: 100 },
    });
  });

  afterEach(async () => {
    await pipeline.stop();
  });

  describe("start / stop", () => {
    it("start 后 _running 为 true", () => {
      pipeline.start();
      expect(pipeline._running).toBe(true);
    });

    it("stop 后 _running 为 false", async () => {
      pipeline.start();
      await pipeline.stop();
      expect(pipeline._running).toBe(false);
    });
  });

  describe("L1 窗口焦点", () => {
    it("窗口焦点变化更新 L1", () => {
      pipeline.start();
      bus.emit({
        type: "window_focus_changed",
        app: "Code.exe",
        title: "test.js",
        platform: "win32",
        timestamp: Date.now(),
      }, null);

      const ctx = pipeline.getRichContext();
      expect(ctx.l1.app).toBe("Code.exe");
      expect(ctx.l1.title).toBe("test.js");
    });

    it("getRichContext 在收到事件后返回完整上下文结构", () => {
      pipeline.start();
      bus.emit({
        type: "window_focus_changed",
        app: "Code.exe",
        title: "test.js",
        platform: "win32",
        timestamp: Date.now(),
      }, null);

      const ctx = pipeline.getRichContext();
      expect(ctx).toHaveProperty("timestamp");
      expect(ctx).toHaveProperty("l1");
      expect(ctx).toHaveProperty("l2");
      expect(ctx).toHaveProperty("l3");
    });
  });

  describe("L2 内容提取", () => {
    it("privacyLevel minimal 时不触发 L2", async () => {
      const minimalPipeline = new DeepContextPipeline({
        eventBus: bus,
        options: { privacyLevel: "minimal", l2DwellMs: 100 },
      });
      minimalPipeline.start();

      bus.emit({
        type: "window_focus_changed",
        app: "Code.exe",
        title: "test.js",
        platform: "win32",
        timestamp: Date.now(),
      }, null);

      // 等待 L2 触发时间窗口
      await new Promise((r) => setTimeout(r, 200));

      const ctx = minimalPipeline.getRichContext();
      expect(ctx.l2).toBeNull();
      await minimalPipeline.stop();
    });

    it("窗口停留后触发 L2 提取", async () => {
      ClipboardAdapter.extract.mockResolvedValueOnce({
        type: "clipboard",
        content: "hello world",
        metadata: {},
      });

      pipeline.start();
      bus.emit({
        type: "window_focus_changed",
        app: "Code.exe",
        title: "test.js",
        platform: "win32",
        timestamp: Date.now(),
      }, null);

      // 等待 L2 dwell 时间
      await new Promise((r) => setTimeout(r, 200));

      const ctx = pipeline.getRichContext();
      expect(ctx.l2).not.toBeNull();
      expect(ctx.l2.sourceType).toBe("clipboard");
    });

    it("窗口切换时清除旧 L2 定时器", async () => {
      pipeline.start();

      // 第一个窗口
      bus.emit({
        type: "window_focus_changed",
        app: "Code.exe",
        title: "a.js",
        platform: "win32",
        timestamp: 1000,
      }, null);

      // 50ms 后切换窗口（在 L2 触发前）
      await new Promise((r) => setTimeout(r, 50));

      bus.emit({
        type: "window_focus_changed",
        app: "Chrome",
        title: "Google",
        platform: "win32",
        timestamp: 1050,
      }, null);

      // 等待足够长时间
      await new Promise((r) => setTimeout(r, 250));

      // L1 应该是 Chrome
      const ctx = pipeline.getRichContext();
      expect(ctx.l1.app).toBe("Chrome");
    });
  });

  describe("setPrivacyLevel", () => {
    it("切换隐私级别", () => {
      pipeline.setPrivacyLevel("minimal");
      expect(pipeline._privacyLevel).toBe("minimal");
    });

    it("无效级别不改变当前值", () => {
      const original = pipeline._privacyLevel;
      pipeline.setPrivacyLevel("invalid");
      expect(pipeline._privacyLevel).toBe(original);
    });
  });
});
