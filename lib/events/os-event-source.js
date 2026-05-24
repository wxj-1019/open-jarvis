/**
 * os-event-source.js — 跨平台 OS 事件监听器
 *
 * 监听窗口焦点变化（get-windows）和文件系统变化（chokidar），
 * 统一抽象为 EventBus 事件发射。
 *
 * 平台支持：Windows / macOS / Linux
 */

import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("os-event-source");

/**
 * @typedef {object} OSEventSourceOptions
 * @property {number} [debounceMs=300]  文件变化去抖间隔（毫秒）
 * @property {number} [pollIntervalMs=1000]  窗口焦点轮询间隔（毫秒）
 */

export class OSEventSource {
  /**
   * @param {object} opts
   * @param {import('../../hub/event-bus.js').EventBus} opts.eventBus
   * @param {Map<string,string>} opts.agentWorkspaces  agentId → workspace 绝对路径
   * @param {OSEventSourceOptions} [opts.options]
   */
  constructor({ eventBus, agentWorkspaces, options }) {
    this._eventBus = eventBus;
    this._agentWorkspaces = agentWorkspaces || new Map();
    this._debounceMs = options?.debounceMs ?? 300;
    this._pollIntervalMs = options?.pollIntervalMs ?? 1000;
    this._running = false;

    // 内部状态
    /** @type {string|null} "appName|windowTitle" */
    this._lastActiveWindow = null;
    /** @type {import('chokidar').FSWatcher|null} */
    this._fileWatcher = null;
    /** @type {ReturnType<typeof setInterval>|null} */
    this._focusTimer = null;
  }

  // ──────────── 生命周期 ────────────

  /**
   * 启动 OS 事件监听
   * 幂等调用
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._startWindowFocusPolling();
    this._startFileWatching();
    log.log("OS 事件源已启动");
  }

  /**
   * 停止 OS 事件监听
   */
  async stop() {
    this._running = false;
    if (this._focusTimer) {
      clearInterval(this._focusTimer);
      this._focusTimer = null;
    }
    if (this._fileWatcher) {
      await this._fileWatcher.close();
      this._fileWatcher = null;
    }
    log.log("OS 事件源已停止");
  }

  /**
   * 更新 agent workspace 映射（agent 创建/删除时调用）
   * 会重建文件监听器
   * @param {Map<string,string>} workspaces
   */
  async updateWorkspaces(workspaces) {
    this._agentWorkspaces = workspaces || new Map();
    // 重建文件监听（先启动新的，再关闭旧的，避免事件丢失窗口）
    if (this._running) {
      const oldWatcher = this._fileWatcher;
      this._startFileWatching();
      // 等待新监听器启动后再关闭旧的
      if (oldWatcher) {
        try { await oldWatcher.close(); } catch {}
      }
    }
  }

  // ──────────── 窗口焦点监听 ────────────

  async _startWindowFocusPolling() {
    try {
      const { activeWindow } = await import("get-windows");
      this._focusTimer = setInterval(async () => {
        if (!this._running) return;
        try {
          const win = await activeWindow();
          if (!win) return;
          const app = win.owner?.name || "unknown";
          const title = win.title || "";
          const key = `${app}|${title}`;
          if (key === this._lastActiveWindow) return;

          this._lastActiveWindow = key;
          this._eventBus.emit(
            {
              type: "window_focus_changed",
              app,
              title,
              platform: win.platform || process.platform,
              timestamp: Date.now(),
            },
            null,
          );
        } catch {
          // 单次轮询失败静默跳过，不影响后续
        }
      }, this._pollIntervalMs);
    } catch (err) {
      log.warn(`窗口焦点检测不可用 (${process.platform}): ${err.message}`);
    }
  }

  // ──────────── 文件系统监听 ────────────

  async _startFileWatching() {
    const watchPaths = this._collectWatchPaths();
    if (watchPaths.length === 0) return;

    try {
      const chokidar = await import("chokidar");
      const ignored = [
        "**/node_modules/**",
        "**/.git/**",
        "**/.cache/**",
        "**/.output/**",
      ];

      this._fileWatcher = chokidar.watch(watchPaths, {
        ignored,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
        depth: 0,
      });

      // 去重：同一文件 300ms 内只发一次
      const pending = new Map();
      const flush = (filePath, event) => {
        const key = `${filePath}|${event}`;
        if (pending.has(key)) return;
        pending.set(
          key,
          setTimeout(() => {
            pending.delete(key);
            if (!this._running) return;
            this._eventBus.emit(
              {
                type: "file_system_changed",
                path: filePath,
                event,
                timestamp: Date.now(),
              },
              null,
            );
          }, this._debounceMs),
        );
      };

      this._fileWatcher.on("add", (p) => flush(p, "add"));
      this._fileWatcher.on("change", (p) => flush(p, "change"));
      this._fileWatcher.on("unlink", (p) => flush(p, "unlink"));

      log.log(`文件监听已启动: ${watchPaths.length} 个路径`);
    } catch (err) {
      log.warn(`文件系统监听不可用: ${err.message}`);
    }
  }

  /**
   * 收集所有 agent workspace 路径（去重、过滤无效）
   * @returns {string[]}
   */
  _collectWatchPaths() {
    const set = new Set();
    for (const p of this._agentWorkspaces.values()) {
      if (p && typeof p === "string" && p.trim()) {
        set.add(p);
      }
    }
    return [...set];
  }
}
