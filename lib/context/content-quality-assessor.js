import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("content-quality");

/**
 * @typedef {object} AssessmentResult
 * @property {"rich"|"sparse"|"none"} quality
 * @property {"a11y-only"|"hybrid"|"ocr-only"|"skip"} strategy
 * @property {string} [reason]
 * @property {number} charCount
 */

export class ContentQualityAssessor {
  /**
   * @param {object} [options]
   * @param {number} [options.richThreshold=100]  丰富文本阈值
   * @param {number} [options.sparseThreshold=10]  稀疏文本阈值
   */
  constructor(options = {}) {
    this._richThreshold = options.richThreshold ?? 100;
    this._sparseThreshold = options.sparseThreshold ?? 10;

    // 已知 Accessibility Tree 通常为空的应用
    this._terminalApps = new Set([
      "WindowsTerminal.exe",
      "wt.exe",
      "Terminal.app",
      "iTerm.app",
      "konsole",
      "gnome-terminal",
      "alacritty",
      "wezterm",
    ]);

    // 浏览器类应用（通常有标题但 a11y 可能不完整）
    this._browserApps = new Set([
      "chrome.exe",
      "firefox.exe",
      "msedge.exe",
      "Safari.app",
      "Google Chrome.app",
      "Firefox.app",
    ]);

    // 视频/游戏类（跳过 OCR）
    this._skipOcrApps = new Set([
      "vlc.exe",
      "mpv",
      "steam.exe",
      "League of Legends.exe",
    ]);
  }

  /**
   * 评估文本质量并推荐提取策略
   * @param {string} a11yText  Accessibility Tree 提取的文本
   * @param {object} [context]
   * @param {string} [context.app]  应用名
   * @returns {AssessmentResult}
   */
  assess(a11yText, context = {}) {
    const charCount = (a11yText ?? "").length;
    const app = context.app ?? "";

    // 特殊应用处理
    if (this._terminalApps.has(app)) {
      return {
        quality: "none",
        strategy: "ocr-only",
        reason: "terminal app - a11y tree typically empty",
        charCount,
      };
    }

    if (this._skipOcrApps.has(app)) {
      return {
        quality: "none",
        strategy: "skip",
        reason: "video/game app - no meaningful text",
        charCount,
      };
    }

    // 基于字符数判断
    if (charCount >= this._richThreshold) {
      return {
        quality: "rich",
        strategy: "a11y-only",
        reason: `text length ${charCount} >= ${this._richThreshold}`,
        charCount,
      };
    }

    if (charCount >= this._sparseThreshold) {
      const isBrowser = this._browserApps.has(app);
      return {
        quality: "sparse",
        strategy: "hybrid",
        reason: isBrowser
          ? `browser app, text length ${charCount}`
          : `text length ${charCount} in [${this._sparseThreshold}, ${this._richThreshold})`,
        charCount,
      };
    }

    return {
      quality: "none",
      strategy: "ocr-only",
      reason: `text length ${charCount} < ${this._sparseThreshold}`,
      charCount,
    };
  }

  /**
   * 批量评估多个窗口
   * @param {Array<{app: string, a11yText: string}>} windows
   * @returns {Array<AssessmentResult & {app: string}>}
   */
  assessBatch(windows) {
    return windows.map((w) => ({
      app: w.app,
      ...this.assess(w.a11yText, { app: w.app }),
    }));
  }
}
