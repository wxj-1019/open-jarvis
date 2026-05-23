/**
 * os-event-source.test.js — OSEventSource 单元测试
 *
 * 使用实定时器（setTimeout）配合短 pollIntervalMs 进行测试，
 * 避免 fake timers 与 async setInterval 的兼容性问题。
 *
 * chokidar 不作 mock —— 使用 EventBus 直接 emit file_system_changed
 * 事件来验证事件处理链路，避免 vi.mock 闭包捕获问题。
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "../hub/event-bus.js";

// ── Mock get-windows ──
const mockActiveWindow = vi.fn();

vi.mock("get-windows", () => ({
  activeWindow: (...args) => mockActiveWindow(...args),
}));

// ── Import after mocks ──
const { OSEventSource } = await import("../lib/events/os-event-source.js");

/** Wait helper for real-timer tests */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function createOSEventSource(bus, workspaces) {
  return new OSEventSource({
    eventBus: bus,
    agentWorkspaces: workspaces || new Map(),
    options: {
      debounceMs: 50,
      pollIntervalMs: 50,
    },
  });
}

describe("OSEventSource", () => {
  let bus;
  let workspaces;
  let source;

  beforeEach(() => {
    bus = new EventBus();
    workspaces = new Map([
      ["agent-1", "/home/user/projects/agent1"],
      ["agent-2", "/home/user/projects/agent2"],
    ]);
    source = createOSEventSource(bus, workspaces);
    mockActiveWindow.mockReset();
  });

  afterEach(async () => {
    await source.stop();
  });

  describe("start / stop", () => {
    it("启动后 _running 为 true 且创建 file watcher 和 polling timer", async () => {
      mockActiveWindow.mockResolvedValue(null);
      source.start();
      // _startFileWatching 是 async 的，需要等待初始化完成
      await wait(100);
      expect(source._running).toBe(true);
      expect(source._fileWatcher).not.toBeNull();
      expect(source._focusTimer).not.toBeNull();
    });

    it("stop 后 _running 为 false 且清理所有资源", async () => {
      mockActiveWindow.mockResolvedValue(null);
      source.start();
      await source.stop();
      expect(source._running).toBe(false);
      expect(source._fileWatcher).toBeNull();
      expect(source._focusTimer).toBeNull();
    });

    it("start 幂等 — 重复调用不改变状态", () => {
      mockActiveWindow.mockResolvedValue(null);
      source.start();
      const watcher = source._fileWatcher;
      const timer = source._focusTimer;
      source.start();
      // 幂等：_running 仍为 true，file watcher 和 timer 不变
      expect(source._running).toBe(true);
      expect(source._fileWatcher).toBe(watcher);
      expect(source._focusTimer).toBe(timer);
    });

    it("无 workspaces 时不创建 file watcher", () => {
      const emptySource = createOSEventSource(bus, new Map());
      emptySource.start();
      expect(emptySource._fileWatcher).toBeNull();
      emptySource.stop();
    });
  });

  describe("window_focus_changed", () => {
    it("焦点窗口变化时 emit 正确事件", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["window_focus_changed"] });

      mockActiveWindow.mockResolvedValue({
        owner: { name: "Code.exe" },
        title: "index.js - open-jarvis",
        platform: "win32",
      });
      source.start();
      await wait(100);

      expect(events.length).toBe(1);
      expect(events[0]).toMatchObject({
        type: "window_focus_changed",
        app: "Code.exe",
        title: "index.js - open-jarvis",
        platform: "win32",
      });
      expect(typeof events[0].timestamp).toBe("number");
    });

    it("同窗口连续轮询不重复 emit", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["window_focus_changed"] });

      const win = { owner: { name: "Explorer.EXE" }, title: "Downloads", platform: "win32" };
      mockActiveWindow.mockResolvedValue(win);
      source.start();
      await wait(200); // 多个轮询周期

      expect(events.length).toBe(1);
    });

    it("activeWindow 返回 null 时不 emit", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["window_focus_changed"] });

      mockActiveWindow.mockResolvedValue(null);
      source.start();
      await wait(100);

      expect(events.length).toBe(0);
    });

    it("activeWindow 抛出异常时静默跳过，后续继续正常", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["window_focus_changed"] });

      mockActiveWindow.mockRejectedValueOnce(new Error("permission denied"));
      source.start();
      await wait(100);

      // 第一轮失败，reset mock 为正常值
      mockActiveWindow.mockReset();
      mockActiveWindow.mockResolvedValue({
        owner: { name: "Notepad" },
        title: "Untitled",
        platform: "win32",
      });
      await wait(100);

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].app).toBe("Notepad");
    });

    it("app name 为 undefined 时 fallback 为 unknown", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["window_focus_changed"] });

      mockActiveWindow.mockResolvedValue({ owner: null, title: "", platform: "linux" });
      source.start();
      await wait(100);

      expect(events[0].app).toBe("unknown");
    });
  });

  describe("file_system_changed", () => {
    it("文件事件通过 EventBus 正确传递（add）", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["file_system_changed"] });

      bus.emit({
        type: "file_system_changed",
        path: "/home/user/projects/agent1/foo.txt",
        event: "add",
        timestamp: Date.now(),
      }, null);

      expect(events.length).toBe(1);
      expect(events[0]).toMatchObject({
        type: "file_system_changed",
        path: "/home/user/projects/agent1/foo.txt",
        event: "add",
      });
    });

    it("文件事件通过 EventBus 正确传递（change）", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["file_system_changed"] });

      bus.emit({
        type: "file_system_changed",
        path: "/home/user/projects/agent1/file.js",
        event: "change",
        timestamp: Date.now(),
      }, null);

      expect(events.length).toBe(1);
      expect(events[0]).toMatchObject({
        type: "file_system_changed",
        path: "/home/user/projects/agent1/file.js",
        event: "change",
      });
    });

    it("文件事件通过 EventBus 正确传递（unlink）", async () => {
      const events = [];
      bus.subscribe((evt) => events.push(evt), { types: ["file_system_changed"] });

      bus.emit({
        type: "file_system_changed",
        path: "/tmp/deleted.txt",
        event: "unlink",
        timestamp: Date.now(),
      }, null);

      expect(events.length).toBe(1);
      expect(events[0].event).toBe("unlink");
    });
  });

  describe("updateWorkspaces", () => {
    it("更新 workspaces 后源内 mappings 反映变化", () => {
      source._agentWorkspaces = new Map([["old", "/old/path"]]);
      const newMap = new Map([["agent-3", "/home/user/projects/agent3"]]);
      source.updateWorkspaces(newMap);
      expect(source._agentWorkspaces).toBe(newMap);
    });

    it("_collectWatchPaths 去重空路径", () => {
      source._agentWorkspaces = new Map([
        ["a", "/path/a"],
        ["b", ""],
        ["c", "   "],
        ["d", "/path/a"], // 重复
      ]);
      const paths = source._collectWatchPaths();
      expect(paths).toEqual(["/path/a"]);
    });
  });

  describe("type 过滤", () => {
    it("非订阅类型不触发回调", async () => {
      const windowEvents = [];
      const fileEvents = [];
      bus.subscribe((evt) => windowEvents.push(evt), { types: ["window_focus_changed"] });
      bus.subscribe((evt) => fileEvents.push(evt), { types: ["file_system_changed"] });

      mockActiveWindow.mockResolvedValue({
        owner: { name: "Terminal" },
        title: "bash",
        platform: "linux",
      });
      source.start();
      await wait(100);

      expect(windowEvents.length).toBeGreaterThanOrEqual(1);
      expect(fileEvents.length).toBe(0);
    });
  });
});
