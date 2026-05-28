import { createModuleLogger } from "../../debug-log.js";

const log = createModuleLogger("macos-ax");

/**
 * macOS Accessibility API 适配器
 * 当前阶段：JS 骨架
 */
export class MacosAxAdapter {
  constructor() {
    this._useNative = false;
  }

  async extract(windowInfo) {
    if (this._useNative) {
      return this._extractNative(windowInfo);
    }
    return this._extractMock(windowInfo);
  }

  async _extractNative(windowInfo) {
    log.log("native AX not yet implemented");
    return this._extractMock(windowInfo);
  }

  _extractMock(windowInfo) {
    const { app, title } = windowInfo;

    // Xcode
    if (app.includes("Xcode")) {
      return {
        title,
        app,
        elements: [
          { type: "text", text: title.split(" - ")[0], role: "tab" },
          { type: "button", text: "Navigator", role: "button" },
          { type: "text", text: "import SwiftUI", role: "code" },
        ],
        focusedElement: { type: "text", text: "SwiftUI", role: "code" },
        browserUrl: null,
        timestamp: Date.now(),
      };
    }

    // Safari
    if (app.includes("Safari")) {
      return {
        title,
        app,
        elements: [
          { type: "text", text: title, role: "heading" },
          { type: "link", text: "Bookmarks", role: "link" },
        ],
        focusedElement: null,
        browserUrl: "https://apple.com",
        timestamp: Date.now(),
      };
    }

    return {
      title,
      app,
      elements: [{ type: "text", text: title, role: "title" }],
      focusedElement: null,
      browserUrl: null,
      timestamp: Date.now(),
    };
  }
}
