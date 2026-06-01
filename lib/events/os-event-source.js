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
 * @property {number} [fastPollMs=500]  窗口焦点快速轮询间隔（毫秒）
 * @property {number} [slowPollMs=2000]  窗口焦点慢速轮询间隔（毫秒）
 * @property {number} [stableThreshold=5]  切换到慢速轮询所需的连续相同窗口次数
 * @property {number} [staleWindowMs=60000]  同窗口过期时间（毫秒）
 * @property {number} [maxConsecutiveErrors=10]  连续错误上限，超过后停止轮询
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
    this._running = false;

    this._fastPollMs = options?.fastPollMs ?? 500;
    this._slowPollMs = options?.slowPollMs ?? 2000;
    this._stableThreshold = options?.stableThreshold ?? 5;
    this._currentPollMs = this._fastPollMs;
    this._stableCount = 0;
    this._staleWindowMs = options?.staleWindowMs ?? 60000;
    this._lastWindowTimestamp = 0;
    this._maxConsecutiveErrors = options?.maxConsecutiveErrors ?? 10;
    this._consecutiveErrors = 0;

    this._windowFocusAvailable = false;
    this._fileWatchAvailable = false;

    /** @type {string|null} "appName|windowTitle" */
    this._lastActiveWindow = null;
    /** @type {import('chokidar').FSWatcher|null} */
    this._fileWatcher = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._focusTimer = null;
  }

  // ──────────── 生命周期 ────────────

  /**
   * 启动 OS 事件监听
   * 幂等调用
   */
  async start() {
    if (this._running) return;
    this._running = true;
    log.log("═".repeat(50));
    log.log("OS 事件源已启动");
    log.log("═".repeat(50));
    await this._startWindowFocusPolling();
    this._startFileWatching();
  }

  /**
   * 停止 OS 事件监听
   */
  async stop() {
    this._running = false;
    if (this._focusTimer) {
      clearTimeout(this._focusTimer);
      this._focusTimer = null;
    }
    if (this._fileWatcher) {
      await this._fileWatcher.close();
      this._fileWatcher = null;
    }
    log.log("OS 事件源已停止");
  }

  /**
   * 获取功能可用状态
   * @returns {{ windowFocus: boolean, fileWatch: boolean }}
   */
  getFeatureStatus() {
    return {
      windowFocus: this._windowFocusAvailable,
      fileWatch: this._fileWatchAvailable,
    };
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
      this._windowFocusAvailable = true;

      const scheduleNext = () => {
        if (!this._running) return;
        this._focusTimer = setTimeout(poll, this._currentPollMs);
      };

      const poll = async () => {
        if (!this._running) return;
        try {
          const win = await activeWindow();
          if (!win) {
            this._stableCount++;
          } else {
            const app = win.owner?.name || "unknown";
            const title = win.title || "";
            const key = `${app}|${title}`;
            if (key === this._lastActiveWindow) {
              if (Date.now() - this._lastWindowTimestamp > this._staleWindowMs) {
                this._lastActiveWindow = null;
              } else {
                this._stableCount++;
                if (this._stableCount >= this._stableThreshold) {
                  this._currentPollMs = this._slowPollMs;
                } else {
                  this._currentPollMs = this._fastPollMs;
                }
                scheduleNext();
                return;
              }
            }

            this._lastActiveWindow = key;
            this._lastWindowTimestamp = Date.now();
            this._stableCount = 0;
            this._consecutiveErrors = 0;
            log.log(`窗口焦点变化: ${app} - ${title}`);
            this._eventBus.emit(
              { type: "window_focus_changed", app, title, platform: win.platform || process.platform, timestamp: Date.now() },
              null,
            );
          }
        } catch (err) {
          this._consecutiveErrors++;
          if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
            log.warn(`窗口焦点检测连续失败 ${this._consecutiveErrors} 次，停止轮询`);
            this._windowFocusAvailable = false;
            this._focusTimer = null;
            return;
          }
          log.warn(`窗口焦点检测失败: ${err.message}`);
        }

        if (this._stableCount >= this._stableThreshold) {
          this._currentPollMs = this._slowPollMs;
        } else {
          this._currentPollMs = this._fastPollMs;
        }
        scheduleNext();
      };

      scheduleNext();
      log.log("═".repeat(50));
      log.log("窗口焦点检测已启动");
      log.log(`  平台: ${process.platform}`);
      log.log(`  快速轮询间隔: ${this._fastPollMs}ms`);
      log.log(`  慢速轮询间隔: ${this._slowPollMs}ms`);
      log.log(`  稳定阈值: ${this._stableThreshold} 次`);
      log.log("═".repeat(50));
    } catch (err) {
      this._windowFocusAvailable = false;
      log.warn(
        `窗口焦点检测不可用 (${process.platform}): ${err.message}\n` +
        `提示: 请确保安装了 'get-windows' 依赖 (npm install get-windows)`
      );
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
        "**/System Volume Information/**",
        "**/$RECYCLE.BIN/**",
      ];

      this._fileWatcher = chokidar.watch(watchPaths, {
        ignored,
        ignoreInitial: true,
        ignorePermissionErrors: true,
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

      this._fileWatchAvailable = true;
      log.log(`文件监听已启动: ${watchPaths.length} 个路径`);
    } catch (err) {
      this._fileWatchAvailable = false;
      log.warn(
        `文件系统监听不可用: ${err.message}\n` +
        `提示: 请确保安装了 'chokidar' 依赖 (npm install chokidar)`
      );
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
