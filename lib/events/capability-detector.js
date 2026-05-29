import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("capability-detector");

/**
 * 平台能力定义
 * @typedef {object} CapabilityInfo
 * @property {boolean} available
 * @property {string} [platform]
 * @property {string} [reason]
 */

export class CapabilityDetector {
  /**
   * @param {string} platform  process.platform
   */
  constructor(platform) {
    this._platform = platform;
  }

  /**
   * 探测当前平台支持的所有事件捕获能力
   * @returns {Promise<Record<string, CapabilityInfo>>}
   */
  async detect() {
    const result = {
      appSwitch: { available: false },
      windowFocus: { available: false },
      mouseClick: { available: false },
      typingPause: { available: false },
      scrollStop: { available: false },
      clipboardCopy: { available: false },
      idleFallback: { available: true, platform: this._platform }, // 纯 JS 实现，总是可用
      visualChange: { available: false },
    };

    switch (this._platform) {
      case "win32":
        result.appSwitch = { available: true, platform: "win32" };
        result.windowFocus = { available: true, platform: "win32" };
        result.mouseClick = { available: true, platform: "win32" };
        result.typingPause = { available: true, platform: "win32" };
        result.scrollStop = { available: false, reason: "not yet implemented" };
        result.clipboardCopy = { available: true, platform: "win32" };
        result.visualChange = { available: false, reason: "not yet implemented" };
        break;

      case "darwin":
        result.appSwitch = { available: true, platform: "darwin" };
        result.windowFocus = { available: true, platform: "darwin" };
        result.mouseClick = { available: true, platform: "darwin" };
        result.typingPause = { available: true, platform: "darwin" };
        result.scrollStop = { available: false, reason: "not yet implemented" };
        result.clipboardCopy = { available: true, platform: "darwin" };
        result.visualChange = { available: false, reason: "not yet implemented" };
        break;

      case "linux":
        result.appSwitch = { available: true, platform: "linux" };
        result.windowFocus = { available: true, platform: "linux" };
        result.mouseClick = { available: false, reason: "evdev requires root or input group" };
        result.typingPause = { available: false, reason: "evdev requires root or input group" };
        result.scrollStop = { available: false, reason: "not yet implemented" };
        result.clipboardCopy = { available: true, platform: "linux" };
        result.visualChange = { available: false, reason: "not yet implemented" };
        break;

      default:
        for (const key of Object.keys(result)) {
          if (!result[key].available) {
            result[key].reason = 'unsupported platform: ' + this._platform;
          }
        }
    }

    log.log("capabilities detected: " + JSON.stringify({ platform: this._platform, result }));
    return result;
  }

  /**
   * 快速检查单个能力
   * @param {string} capability
   * @returns {Promise<CapabilityInfo>}
   */
  async check(capability) {
    const all = await this.detect();
    return all[capability] ?? { available: false, reason: "unknown capability" };
  }
}
