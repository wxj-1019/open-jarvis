/**
 * deep-context-pipeline.js — 深度上下文管道
 *
 * 协调 L1/L2/L3 三层上下文采集：
 * - L1: 窗口焦点变化（应用名 + 标题），一直运行
 * - L2: 内容提取（文件内容 / 剪贴板），窗口停留超时后触发
 * - L3: 视觉分析（截图 + 多模态模型），按需触发
 *
 * 隐私级别：
 * - minimal: 仅 L1
 * - standard: L1 + L2（默认）
 * - full: L1 + L2 + L3
 */

import { createModuleLogger } from "../debug-log.js";
import { RichContextAggregator } from "./rich-context-aggregator.js";
import { IDEContentAdapter } from "./adapters/ide-content-adapter.js";
import { BrowserContentAdapter } from "./adapters/browser-adapter.js";
import { TerminalContentAdapter } from "./adapters/terminal-adapter.js";
import { ClipboardAdapter } from "./adapters/clipboard-adapter.js";

const log = createModuleLogger("deep-context-pipeline");

export class DeepContextPipeline {
  /**
   * @param {object} opts
   * @param {import('../../hub/event-bus.js').EventBus} opts.eventBus
   * @param {object} [opts.options]
   * @param {string} [opts.options.privacyLevel='standard']
   * @param {number} [opts.options.l2DwellMs=5000]      L2 触发延迟（ms）
   * @param {number} [opts.options.l3CooldownMs=30000]   L3 冷却时间（ms）
   */
  constructor({ eventBus, options }) {
    this._eventBus = eventBus;
    this._privacyLevel = options?.privacyLevel ?? "standard";
    this._l2DwellMs = options?.l2DwellMs ?? 5000;
    this._l3CooldownMs = options?.l3CooldownMs ?? 30000;
    this._running = false;
    this._unsubscribers = [];

    // 当前状态
    this._l1 = null;
    this._l2 = null;
    this._l3 = null;
    this._richContext = null;
    // 上次发出的 richContext 摘要（用于去重）
    this._lastEmittedFingerprint = null;

    // L2 触发定时器
    this._l2Timer = null;
    this._currentWindowKey = null;
    this._windowEnterTime = null;

    // L3 冷却
    this._l3LastTrigger = 0;

    // 适配器列表（按优先级排列：IDE > 终端 > 浏览器 > 剪贴板兜底）
    this._adapters = [IDEContentAdapter, TerminalContentAdapter, BrowserContentAdapter, ClipboardAdapter];
  }

  // ──────────── 生命周期 ────────────

  start() {
    if (this._running) return;
    this._running = true;

    this._unsubscribers = [
      this._eventBus.subscribe(
        this._onWindowFocusChanged.bind(this),
        { types: ["window_focus_changed"] },
      ),
    ];

    log.log("深度上下文管道已启动 (privacy: %s)", this._privacyLevel);
  }

  async stop() {
    this._running = false;
    if (this._l2Timer) {
      clearTimeout(this._l2Timer);
      this._l2Timer = null;
    }
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
    log.log("深度上下文管道已停止");
  }

  // ──────────── 公共接口 ────────────

  getRichContext() {
    return this._richContext;
  }

  setPrivacyLevel(level) {
    const valid = ["minimal", "standard", "full"];
    if (!valid.includes(level)) {
      log.warn("无效的隐私级别: %s，保持当前: %s", level, this._privacyLevel);
      return;
    }
    this._privacyLevel = level;
    log.log("隐私级别切换为: %s", level);
  }

  async requestVisualCapture() {
    if (this._privacyLevel !== "full") {
      log.log("视觉捕获需要 full 隐私级别");
      return null;
    }
    return this._triggerL3();
  }

  // ──────────── 事件处理 ────────────

  _onWindowFocusChanged(event) {
    if (!this._running) return;

    const { app, title, platform, timestamp } = event;
    const windowKey = `${app}|${title}`;

    // 更新 L1
    this._l1 = { app, title, platform };
    this._updateRichContext();

    // 同一窗口不重复触发
    if (windowKey === this._currentWindowKey) return;

    // 清除旧定时器
    if (this._l2Timer) {
      clearTimeout(this._l2Timer);
      this._l2Timer = null;
    }

    this._currentWindowKey = windowKey;
    this._windowEnterTime = timestamp;
    this._l2 = null;
    this._l3 = null;

    // 按隐私级别决定是否触发 L2
    if (this._privacyLevel === "minimal") return;

    // 延迟触发 L2
    this._l2Timer = setTimeout(() => {
      this._triggerL2(app, title);
    }, this._l2DwellMs);
  }

  // ──────────── L2 内容提取 ────────────

  async _triggerL2(app, title) {
    if (!this._running) return;
    if (this._privacyLevel === "minimal") return;

    // 选择适配器（按优先级，第一个支持的胜出）
    const adapter = this._adapters.find((a) => a.supports(app, title));
    if (!adapter) {
      log.log("无适配器支持: %s", app);
      return;
    }

    try {
      const result = await adapter.extract(app, title);
      this._l2 = result;
      this._updateRichContext();
      log.log("L2 内容提取完成: %s", result.type);
    } catch (err) {
      log.warn("L2 内容提取失败: %s", err.message);
    }
  }

  // ──────────── L3 视觉捕获 ────────────

  async _triggerL3() {
    if (this._privacyLevel !== "full") return null;

    const now = Date.now();
    if (now - this._l3LastTrigger < this._l3CooldownMs) {
      log.log("L3 冷却中，跳过");
      return this._l3;
    }

    // TODO: Phase 4 实现截图 + 视觉分析
    // 当前返回 null placeholder
    this._l3 = null;
    this._l3LastTrigger = now;
    this._updateRichContext();
    return this._l3;
  }

  // ──────────── 聚合更新 ────────────

  _updateRichContext() {
    this._richContext = RichContextAggregator.aggregate(this._l1, this._l2, this._l3);
    this._emitContextChanged();
  }

  /**
   * 当 richContext 有实际变化时发出事件，供外部监听
   * 使用简单的指纹去重，避免无意义的高频事件
   */
  _emitContextChanged() {
    if (!this._eventBus || !this._richContext) return;

    // 生成指纹：l1.app + l1.title + l2.sourceType + l2.fileContent 前 100 字符
    const l1 = this._richContext.l1;
    const l2 = this._richContext.l2;
    const fingerprint = [
      l1?.app || "",
      l1?.title || "",
      l2?.sourceType || "",
      l2?.fileContent?.substring(0, 100) || "",
      l2?.clipboard?.substring(0, 100) || "",
    ].join("|");

    if (fingerprint === this._lastEmittedFingerprint) return;
    this._lastEmittedFingerprint = fingerprint;

    this._eventBus.emit({
      type: "rich_context_changed",
      context: this._richContext,
      timestamp: Date.now(),
    }, null);
  }
}
