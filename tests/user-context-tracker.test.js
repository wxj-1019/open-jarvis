/**
 * user-context-tracker.test.js — UserContextTracker 单元测试
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { EventBus } from "../hub/event-bus.js";
import { UserContextTracker } from "../lib/context/user-context-tracker.js";

describe("UserContextTracker", () => {
  let bus;
  let tracker;

  beforeEach(() => {
    bus = new EventBus();
    tracker = new UserContextTracker({ eventBus: bus });
  });

  afterEach(async () => {
    await tracker.stop();
  });

  describe("start / stop", () => {
    it("start 后 _running 为 true", () => {
      tracker.start();
      expect(tracker._running).toBe(true);
    });

    it("stop 后 _running 为 false", async () => {
      tracker.start();
      await tracker.stop();
      expect(tracker._running).toBe(false);
    });

    it("start 幂等 — 重复调用不抛错", () => {
      tracker.start();
      tracker.start();
      expect(tracker._running).toBe(true);
    });
  });

  describe("窗口焦点事件聚合", () => {
    it("跟踪当前窗口 app 和 title", () => {
      tracker.start();
      bus.emit({
        type: "window_focus_changed",
        app: "Code.exe",
        title: "index.js - open-jarvis",
        platform: "win32",
        timestamp: 1000,
      }, null);

      const snap = tracker.getContextSnapshot();
      expect(snap.currentApp).toBe("Code.exe");
      expect(snap.currentTitle).toBe("index.js - open-jarvis");
    });

    it("同窗口重复不更新历史", () => {
      tracker.start();
      const event = {
        type: "window_focus_changed",
        app: "Code.exe",
        title: "index.js",
        platform: "win32",
        timestamp: 1000,
      };
      bus.emit(event, null);
      bus.emit({ ...event, timestamp: 2000 }, null);

      const snap = tracker.getContextSnapshot();
      // 历史中只有一条记录（第一次）
      expect(snap.recentApps.length).toBe(1);
    });

    it("窗口切换累积历史记录", () => {
      tracker.start();
      bus.emit({ type: "window_focus_changed", app: "Code", title: "a.js", platform: "win32", timestamp: 1000 }, null);
      bus.emit({ type: "window_focus_changed", app: "Chrome", title: "GitHub", platform: "win32", timestamp: 2000 }, null);
      bus.emit({ type: "window_focus_changed", app: "Terminal", title: "bash", platform: "win32", timestamp: 3000 }, null);

      const snap = tracker.getContextSnapshot();
      expect(snap.currentApp).toBe("Terminal");
      expect(snap.recentApps.length).toBe(3);
    });

    it("超过最大历史条数时裁剪最早的记录", () => {
      const smallTracker = new UserContextTracker({
        eventBus: bus,
        options: { maxWindowHistory: 2 },
      });
      smallTracker.start();

      bus.emit({ type: "window_focus_changed", app: "A", title: "", platform: "win32", timestamp: 1000 }, null);
      bus.emit({ type: "window_focus_changed", app: "B", title: "", platform: "win32", timestamp: 2000 }, null);
      bus.emit({ type: "window_focus_changed", app: "C", title: "", platform: "win32", timestamp: 3000 }, null);

      const snap = smallTracker.getContextSnapshot();
      expect(snap.recentApps.length).toBe(2);
      expect(snap.recentApps[0].app).toBe("B");
      expect(snap.recentApps[1].app).toBe("C");

      smallTracker.stop();
    });
  });

  describe("文件变更事件聚合", () => {
    it("跟踪文件变更记录", () => {
      tracker.start();
      bus.emit({
        type: "file_system_changed",
        path: "/home/user/projects/agent1/foo.txt",
        event: "add",
        timestamp: 1000,
      }, null);

      const snap = tracker.getContextSnapshot();
      expect(snap.recentFiles.length).toBe(1);
      expect(snap.recentFiles[0].path).toBe("/home/user/projects/agent1/foo.txt");
      expect(snap.recentFiles[0].event).toBe("add");
    });

    it("同路径文件去重（保留最新的）", () => {
      tracker.start();
      bus.emit({ type: "file_system_changed", path: "/tmp/file.js", event: "add", timestamp: 1000 }, null);
      bus.emit({ type: "file_system_changed", path: "/tmp/file.js", event: "change", timestamp: 2000 }, null);

      const snap = tracker.getContextSnapshot();
      expect(snap.recentFiles.length).toBe(1);
      expect(snap.recentFiles[0].event).toBe("change");
    });

    it("超过最大文件记录数时裁剪", () => {
      const smallTracker = new UserContextTracker({
        eventBus: bus,
        options: { maxFileHistory: 2 },
      });
      smallTracker.start();

      bus.emit({ type: "file_system_changed", path: "/a", event: "add", timestamp: 1 }, null);
      bus.emit({ type: "file_system_changed", path: "/b", event: "add", timestamp: 2 }, null);
      bus.emit({ type: "file_system_changed", path: "/c", event: "add", timestamp: 3 }, null);

      const snap = smallTracker.getContextSnapshot();
      expect(snap.recentFiles.length).toBe(2);
      expect(snap.recentFiles[0].path).toBe("/b");
      expect(snap.recentFiles[1].path).toBe("/c");

      smallTracker.stop();
    });
  });

  describe("lastActiveTime", () => {
    it("窗口事件更新 lastActiveTime", () => {
      tracker.start();
      bus.emit({ type: "window_focus_changed", app: "App", title: "", platform: "win32", timestamp: 9999 }, null);
      expect(tracker.getContextSnapshot().lastActiveTime).toBe(9999);
    });

    it("文件事件更新 lastActiveTime", () => {
      tracker.start();
      bus.emit({ type: "file_system_changed", path: "/f", event: "add", timestamp: 8888 }, null);
      expect(tracker.getContextSnapshot().lastActiveTime).toBe(8888);
    });
  });

  describe("stop 后不再追踪", () => {
    it("stop 后 emit 的事件不更新状态", async () => {
      tracker.start();
      bus.emit({ type: "window_focus_changed", app: "Before", title: "", platform: "win32", timestamp: 1000 }, null);
      await tracker.stop();

      bus.emit({ type: "window_focus_changed", app: "After", title: "", platform: "win32", timestamp: 2000 }, null);

      expect(tracker.getContextSnapshot().currentApp).toBe("Before");
    });
  });

  describe("getContextSummary", () => {
    it("无数据时返回空字符串", () => {
      tracker.start();
      expect(tracker.getContextSummary()).toBe("");
    });

    it("中文环境下生成正确摘要", () => {
      tracker.start();
      bus.emit({
        type: "window_focus_changed",
        app: "VS Code",
        title: "user-context-tracker.js",
        platform: "win32",
        timestamp: 1000,
      }, null);

      const summary = tracker.getContextSummary("zh");
      expect(summary).toContain("VS Code");
      expect(summary).toContain("user-context-tracker.js");
      expect(summary).toContain("用户当前在");
    });

    it("英文环境下生成正确摘要", () => {
      tracker.start();
      bus.emit({
        type: "window_focus_changed",
        app: "VS Code",
        title: "user-context-tracker.js",
        platform: "win32",
        timestamp: 1000,
      }, null);

      const summary = tracker.getContextSummary("en");
      expect(summary).toContain("VS Code");
      expect(summary).toContain("user-context-tracker.js");
      expect(summary).toContain("The user is currently");
    });

    it("包含最近切换应用信息", () => {
      tracker.start();
      bus.emit({ type: "window_focus_changed", app: "VS Code", title: "", platform: "win32", timestamp: 1000 }, null);
      bus.emit({ type: "window_focus_changed", app: "Chrome", title: "", platform: "win32", timestamp: 2000 }, null);
      bus.emit({ type: "window_focus_changed", app: "Terminal", title: "", platform: "win32", timestamp: 3000 }, null);

      const summary = tracker.getContextSummary("zh");
      expect(summary).toContain("VS Code");
      expect(summary).toContain("Chrome");
    });

    it("包含最近文件信息", () => {
      tracker.start();
      bus.emit({
        type: "file_system_changed",
        path: "/project/src/utils.js",
        event: "change",
        timestamp: 1000,
      }, null);

      const summary = tracker.getContextSummary("zh");
      expect(summary).toContain("utils.js");
      expect(summary).toContain("最近涉及文件");
    });
  });
});
