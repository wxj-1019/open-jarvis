import { PrivacyConfig } from "./privacy-config.js";
import { PiiGuard } from "./pii-guard.js";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("privacy-guard");

/**
 * 隐私过滤主控
 * 拦截事件流和内容数据，应用隐私规则
 */
export class PrivacyGuard {
  /**
   * @param {import('./privacy-config.js').PrivacyConfigData} [configData]
   */
  constructor(configData) {
    this._config = new PrivacyConfig(configData);
    this._piiGuard = new PiiGuard();
  }

  /**
   * 更新配置（热更新）
   * @param {import('./privacy-config.js').PrivacyConfigData} configData
   */
  updateConfig(configData) {
    this._config = new PrivacyConfig(configData);
    log.log("privacy config updated", {
      excludedApps: this._config.excludedApps.length,
      excludedWindows: this._config.excludedWindows.length,
    });
  }

  /**
   * 过滤事件
   * @param {object} event
   * @param {Date} [date]
   * @returns {object|null}  过滤后的事件，null 表示被拦截
   */
  filterEvent(event, date = new Date()) {
    // 1. 检查工作时间
    if (!this._config.isWithinWorkHours(date)) {
      log.log("blocked: outside work hours", { app: event.app });
      return null;
    }

    // 2. 检查应用排除
    if (event.app && this._config.isAppExcluded(event.app)) {
      log.log("blocked: excluded app", { app: event.app });
      return null;
    }

    // 3. 检查窗口排除
    if (event.title && this._config.isWindowExcluded(event.title)) {
      log.log("blocked: excluded window", { title: event.title });
      return null;
    }

    return event;
  }

  /**
   * 过滤窗口内容（PII 脱敏）
   * @param {object} content
   * @returns {object}
   */
  filterContent(content) {
    if (!content) return content;

    const result = { ...content };

    // 脱敏元素文本
    if (Array.isArray(content.elements)) {
      result.elements = content.elements.map((el) => {
        if (!el.text) return el;
        const sanitized = this._piiGuard.sanitize(el.text);
        return { ...el, text: sanitized.text };
      });
    }

    // 脱敏 focusedElement
    if (content.focusedElement?.text) {
      const sanitized = this._piiGuard.sanitize(content.focusedElement.text);
      result.focusedElement = { ...content.focusedElement, text: sanitized.text };
    }

    // 脱敏 a11yText / ocrText
    if (content.a11yText) {
      const sanitized = this._piiGuard.sanitize(content.a11yText);
      result.a11yText = sanitized.text;
    }

    if (content.ocrText) {
      const sanitized = this._piiGuard.sanitize(content.ocrText);
      result.ocrText = sanitized.text;
    }

    return result;
  }

  /**
   * 批量过滤事件
   * @param {object[]} events
   * @returns {object[]}
   */
  filterEvents(events) {
    return events
      .map((e) => this.filterEvent(e))
      .filter(Boolean);
  }

  /**
   * 获取当前配置
   * @returns {PrivacyConfig}
   */
  getConfig() {
    return this._config;
  }
}
