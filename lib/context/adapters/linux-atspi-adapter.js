import { createModuleLogger } from "../../debug-log.js";

const log = createModuleLogger("linux-atspi");

/**
 * Linux AT-SPI2 适配器
 * 当前阶段：JS 骨架，仅返回基础数据
 */
export class LinuxAtspiAdapter {
  constructor() {
    this._useNative = false;
  }

  async extract(windowInfo) {
    return {
      title: windowInfo.title,
      app: windowInfo.app,
      elements: [{ type: "text", text: windowInfo.title, role: "title" }],
      focusedElement: null,
      browserUrl: null,
      timestamp: Date.now(),
    };
  }
}
