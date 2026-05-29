/**
 * 简单 glob 匹配（仅支持 * 通配符）
 * @param {string} str
 * @param {string} pattern
 * @returns {boolean}
 */
function simpleGlob(str, pattern) {
  // 将 glob pattern 转为正则
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexStr}$`, "i").test(str);
}

/**
 * @typedef {object} WorkHoursConfig
 * @property {boolean} enabled
 * @property {string} timeRange  "HH:MM-HH:MM"
 * @property {string[]} days  ["Mon", "Tue", ...]
 */

/**
 * @typedef {object} PrivacyConfigData
 * @property {"minimal"|"standard"|"full"} [globalLevel="standard"]
 * @property {string[]} [excludedApps=[]]
 * @property {string[]} [excludedWindows=[]]
 * @property {string[]} [allowedContentTypes=["accessibility", "ocr"]]
 * @property {WorkHoursConfig} [workHoursOnly]
 * @property {boolean} [blurSensitiveFields=true]
 * @property {number} [retentionDays=30]
 * @property {{enabled: boolean, strategy: "keywords"|"recent-plaintext"}} [searchableEncryption]
 */

export class PrivacyConfig {
  /**
   * @param {PrivacyConfigData} [data]
   */
  constructor(data = {}) {
    this.globalLevel = data.globalLevel ?? "standard";
    this.excludedApps = data.excludedApps ?? [];
    this.excludedWindows = data.excludedWindows ?? [];
    this.allowedContentTypes = data.allowedContentTypes ?? ["accessibility", "ocr"];
    this.workHoursOnly = data.workHoursOnly ?? { enabled: false };
    this.blurSensitiveFields = data.blurSensitiveFields ?? true;
    this.retentionDays = data.retentionDays ?? 30;
    this.searchableEncryption = data.searchableEncryption ?? {
      enabled: true,
      strategy: "keywords",
    };
  }

  /**
   * 检查应用是否在排除列表
   * @param {string} appName
   * @returns {boolean}
   */
  isAppExcluded(appName) {
    return this.excludedApps.some((pattern) =>
      simpleGlob(appName, pattern)
    );
  }

  /**
   * 检查窗口标题是否在排除列表
   * @param {string} windowTitle
   * @returns {boolean}
   */
  isWindowExcluded(windowTitle) {
    return this.excludedWindows.some((pattern) =>
      simpleGlob(windowTitle, pattern)
    );
  }

  /**
   * 检查内容类型是否允许
   * @param {string} contentType  "accessibility" | "ocr" | "screenshot"
   * @returns {boolean}
   */
  isContentTypeAllowed(contentType) {
    return this.allowedContentTypes.includes(contentType);
  }

  /**
   * 检查给定时间是否在工作时间内
   * @param {Date} [date]
   * @returns {boolean}
   */
  isWithinWorkHours(date = new Date()) {
    if (!this.workHoursOnly.enabled) return true;

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const day = dayNames[date.getDay()];
    if (!this.workHoursOnly.days.includes(day)) return false;

    const [startStr, endStr] = this.workHoursOnly.timeRange.split("-");
    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);

    const minutes = date.getHours() * 60 + date.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return minutes >= startMinutes && minutes <= endMinutes;
  }

  /**
   * 序列化为 JSON
   * @returns {PrivacyConfigData}
   */
  toJSON() {
    return {
      globalLevel: this.globalLevel,
      excludedApps: this.excludedApps,
      excludedWindows: this.excludedWindows,
      allowedContentTypes: this.allowedContentTypes,
      workHoursOnly: this.workHoursOnly,
      blurSensitiveFields: this.blurSensitiveFields,
      retentionDays: this.retentionDays,
      searchableEncryption: this.searchableEncryption,
    };
  }
}

/**
 * 验证配置对象
 * @param {object} data
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePrivacyConfig(data) {
  const errors = [];

  if (data.globalLevel && !["minimal", "standard", "full"].includes(data.globalLevel)) {
    errors.push("globalLevel must be one of: minimal, standard, full");
  }

  if (data.retentionDays !== undefined) {
    if (typeof data.retentionDays !== "number" || data.retentionDays < 1) {
      errors.push("retentionDays must be a positive number");
    }
  }

  if (data.workHoursOnly?.timeRange) {
    const rangeRegex = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
    if (!rangeRegex.test(data.workHoursOnly.timeRange)) {
      errors.push("workHoursOnly.timeRange must be in format HH:MM-HH:MM");
    }
  }

  return { valid: errors.length === 0, errors };
}
