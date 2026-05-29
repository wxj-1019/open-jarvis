import { createModuleLogger } from "../../debug-log.js";

const log = createModuleLogger("windows-uia");

/**
 * Windows UI Automation 适配器
 * 当前阶段：JS 骨架，返回模拟数据
 * 后续：通过 native addon 调用 UIA API
 */
export class WindowsUiaAdapter {
  constructor() {
    this._useNative = false;
  }

  /**
   * 提取窗口内容
   * @param {object} windowInfo
   * @param {string} windowInfo.app
   * @param {string} windowInfo.title
   * @returns {Promise<object>}
   */
  async extract(windowInfo) {
    if (this._useNative) {
      return this._extractNative(windowInfo);
    }

    return this._extractMock(windowInfo);
  }

  /**
   * Native 提取（后续实现）
   * @private
   */
  async _extractNative(windowInfo) {
    // TODO: 调用 native addon
    log.log("native UIA not yet implemented");
    return this._extractMock(windowInfo);
  }

  /**
   * Mock 提取（用于开发和测试）
   * @private
   */
  _extractMock(windowInfo) {
    const { app, title } = windowInfo;

    const elements = this._generateMockElements(app, title);

    return {
      title,
      app,
      elements,
      focusedElement: elements[0] ?? null,
      browserUrl: this._extractBrowserUrl(app, title),
      timestamp: Date.now(),
    };
  }

  _generateMockElements(app, title) {
    // VS Code
    if (app.includes("Code")) {
      return [
        { type: "text", text: title.split(" - ")[0], role: "tab" },
        { type: "button", text: "Explorer", role: "button" },
        { type: "button", text: "Search", role: "button" },
        { type: "text", text: "function", role: "keyword" },
        { type: "text", text: "hello()", role: "function" },
      ];
    }

    // Chrome
    if (app.includes("chrome") || app.includes("Chrome")) {
      const pageTitle = title.replace(" - Google Chrome", "");
      return [
        { type: "text", text: pageTitle, role: "heading" },
        { type: "link", text: "Search", role: "link" },
        { type: "button", text: "Submit", role: "button" },
      ];
    }

    // 默认
    return [
      { type: "text", text: title, role: "title" },
    ];
  }

  _extractBrowserUrl(app, title) {
    if (!app.includes("chrome") && !app.includes("Chrome")) return null;

    if (title.includes("GitHub")) return "https://github.com";
    if (title.includes("Google")) return "https://google.com";
    return null;
  }
}
