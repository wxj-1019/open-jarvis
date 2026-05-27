/**
 * user-context-tracker.js — 用户上下文追踪器
 *
 * 聚合 OS 事件（窗口焦点变化、文件系统变化）→ 维护用户状态模型，
 * 为 Agent 提供"用户当前在做什么"的上下文感知能力。
 *
 * 数据来源：EventBus（window_focus_changed / file_system_changed）
 * 消费者：Agent.buildSystemPrompt() 注入上下文摘要
 */

import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("user-context-tracker");

/**
 * @typedef {object} WindowRecord
 * @property {string} app
 * @property {string} title
 * @property {number} timestamp
 */

/**
 * @typedef {object} FileRecord
 * @property {string} path
 * @property {"add"|"change"|"unlink"} event
 * @property {number} timestamp
 */

/**
 * @typedef {object} UserContextSnapshot
 * @property {string|null} currentApp
 * @property {string|null} currentTitle
 * @property {WindowRecord[]} recentApps
 * @property {FileRecord[]} recentFiles
 * @property {number|null} lastActiveTime
 */

export class UserContextTracker {
  /**
   * @param {object} opts
   * @param {import('../../hub/event-bus.js').EventBus} opts.eventBus
   * @param {object} [opts.options]
   * @param {number} [opts.options.maxWindowHistory=10]  最大窗口历史条数
   * @param {number} [opts.options.maxFileHistory=20]     最大文件变更记录数
   */
  constructor({ eventBus, options }) {
    this._eventBus = eventBus;
    this._maxWindowHistory = options?.maxWindowHistory ?? 10;
    this._maxFileHistory = options?.maxFileHistory ?? 20;
    this._running = false;

    // 内部状态
    /** @type {string|null} */
    this._currentApp = null;
    /** @type {string|null} */
    this._currentTitle = null;
    /** @type {WindowRecord[]} */
    this._windowHistory = [];
    /** @type {FileRecord[]} */
    this._recentFiles = [];
    /** @type {number|null} */
    this._lastActiveTime = null;

    // 深度上下文（由 DeepContextPipeline 写入）
    this._richContext = null;

    // 订阅清理函数
    this._unsubscribers = [];
  }

  // ──────────── 生命周期 ────────────

  /**
   * 启动上下文追踪（幂等）
   */
  start() {
    if (this._running) return;
    this._running = true;

    this._unsubscribers = [
      this._eventBus.subscribe(
        this._onWindowFocusChanged.bind(this),
        { types: ["window_focus_changed"] },
      ),
      this._eventBus.subscribe(
        this._onFileSystemChanged.bind(this),
        { types: ["file_system_changed"] },
      ),
    ];

    log.log("用户上下文追踪已启动");
  }

  /**
   * 停止上下文追踪
   */
  async stop() {
    this._running = false;
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
    log.log("用户上下文追踪已停止");
  }

  // ──────────── 事件处理 ────────────

  /**
   * @param {object} event { type, app, title, platform, timestamp }
   */
  _onWindowFocusChanged(event) {
    if (!this._running) return;

    const { app, title, timestamp } = event;

    // 同窗口去重
    if (app === this._currentApp && title === this._currentTitle) return;

    this._currentApp = app;
    this._currentTitle = title;
    this._lastActiveTime = timestamp;

    // 记录到窗口历史（去重：连续相同的不重复记录）
    this._windowHistory.push({ app, title, timestamp });
    if (this._windowHistory.length > this._maxWindowHistory) {
      this._windowHistory.shift();
    }
  }

  /**
   * @param {object} event { type, path, event: "add"|"change"|"unlink", timestamp }
   */
  _onFileSystemChanged(event) {
    if (!this._running) return;

    const { path: filePath, event: action, timestamp } = event;

    this._lastActiveTime = timestamp;

    // 保留最近 N 条文件事件历史（不去重，保留完整操作序列）
    this._recentFiles.push({ path: filePath, event: action, timestamp });
    if (this._recentFiles.length > this._maxFileHistory) {
      this._recentFiles.shift();
    }
  }

  // ──────────── 查询接口 ────────────

  /**
   * 获取上下文快照（原始数据）
   * @returns {UserContextSnapshot}
   */
  getContextSnapshot() {
    return {
      currentApp: this._currentApp,
      currentTitle: this._currentTitle,
      recentApps: [...this._windowHistory],
      recentFiles: [...this._recentFiles],
      lastActiveTime: this._lastActiveTime,
      richContext: this._richContext,
    };
  }

  /**
   * 生成可注入系统提示的上下文摘要文本
   * @param {string} [locale]  "zh" 开头视为中文，否则英文
   * @returns {string} 上下文摘要，无数据时返回空字符串
   */
  getContextSummary(locale) {
    const isZh = String(locale || "").startsWith("zh");
    const parts = [];

    // 当前活动窗口
    if (this._currentApp) {
      const appName = this._currentApp;
      const titleInfo = this._currentTitle ? ` (${this._currentTitle})` : "";
      parts.push(
        isZh
          ? `用户当前在 ${appName}${titleInfo} 中工作`
          : `The user is currently working in ${appName}${titleInfo}`,
      );
    }

    // 最近切换的应用
    if (this._windowHistory.length > 1) {
      // 最近 5 个不同的 app（去重）
      const recent = this._windowHistory
        .slice(-this._windowHistory.length)
        .reverse();
      const seen = new Set();
      const unique = [];
      for (const r of recent) {
        if (seen.has(r.app)) continue;
        seen.add(r.app);
        unique.push(r.app);
      }
      // 去掉当前 app
      const others = unique.filter((a) => a !== this._currentApp).slice(0, 3);
      if (others.length > 0) {
        parts.push(
          isZh
            ? `最近也在 ${others.join("、")} 之间切换`
            : `Recently switched between ${others.join(", ")}`,
        );
      }
    }

    // L2 深度上下文文件内容摘要
    if (this._richContext?.l2?.fileContent) {
      const l2 = this._richContext.l2;
      const preview = l2.fileContent.substring(0, 300);
      parts.push(
        isZh
          ? `当前文件: ${l2.filePath}\n内容预览:\n${preview}`
          : `Current file: ${l2.filePath}\nContent preview:\n${preview}`,
      );
    }

    // L2 浏览器上下文摘要
    if (this._richContext?.l2?.sourceType === "browser") {
      const l2 = this._richContext.l2;
      if (l2.searchQuery) {
        parts.push(
          isZh
            ? `用户正在搜索: ${l2.searchQuery}（${l2.searchEngine || "搜索引擎"}）`
            : `User is searching: ${l2.searchQuery} (${l2.searchEngine || "search engine"})`,
        );
      } else if (l2.pageTitle) {
        parts.push(
          isZh
            ? `用户正在浏览: ${l2.pageTitle}`
            : `User is browsing: ${l2.pageTitle}`,
        );
      }
    }

    // L2 终端上下文摘要
    if (this._richContext?.l2?.sourceType === "terminal") {
      const l2 = this._richContext.l2;
      if (l2.workingDir) {
        parts.push(
          isZh
            ? `终端工作目录: ${l2.workingDir}${l2.isSsh ? " (SSH 远程)" : ""}`
            : `Terminal working dir: ${l2.workingDir}${l2.isSsh ? " (SSH remote)" : ""}`,
        );
      }
    }

    // 最近文件活动摘要
    if (this._recentFiles.length > 0) {
      const recent = this._recentFiles.slice(-5);
      const fileNames = [...new Set(recent.map((f) => {
        const segments = f.path.replace(/\\/g, "/").split("/");
        return segments[segments.length - 1] || f.path;
      }))];
      if (fileNames.length > 0) {
        parts.push(
          isZh
            ? `最近涉及文件: ${fileNames.join(", ")}`
            : `Recently touched files: ${fileNames.join(", ")}`,
        );
      }
    }

    return parts.length > 0 ? parts.join(isZh ? "。" : ". ") : "";
  }

  // ──────────── 深度上下文接口 ────────────

  /**
   * 获取深度上下文
   * @returns {object|null}
   */
  getRichContext() {
    return this._richContext;
  }

  /**
   * 设置深度上下文（由 DeepContextPipeline 调用）
   * @param {object|null} richContext
   */
  setRichContext(richContext) {
    this._richContext = richContext;
  }
}
