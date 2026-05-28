import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("pii-guard-extended");

/**
 * PII 模式定义（扩展版）
 */
const PII_PATTERNS = {
  password: {
    patterns: [
      /kAXSecureTextField/g,
      /type=["']password["']/gi,
    ],
    replacement: "[PASSWORD]",
    description: "Password field",
  },
  apiKey: {
    patterns: [
      /\b(sk-[a-zA-Z0-9]{20,})/g,
      /\b(ghp_[a-zA-Z0-9]{36})/g,
      /\b(glpat-[a-zA-Z0-9\-]{20})/g,
      /\b(AKIA[0-9A-Z]{16})/g,
    ],
    replacement: "[API_KEY]",
    description: "API key",
  },
  email: {
    patterns: [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ],
    replacement: "[EMAIL]",
    description: "Email address",
  },
  idCard: {
    patterns: [
      /\b\d{17}[\dXx]\b/g,
      /\b\d{3}-\d{2}-\d{4}\b/g,
    ],
    replacement: "[ID]",
    description: "ID card / SSN",
  },
  creditCard: {
    patterns: [
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    ],
    replacement: "[CARD]",
    description: "Credit card number",
  },
  phone: {
    patterns: [
      /\+?\d{1,3}[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/g,
      /\b1[3-9]\d{9}\b/g,
    ],
    replacement: "[PHONE]",
    description: "Phone number",
  },
};

export class PiiGuard {
  /**
   * @param {object} [options]
   * @param {string[]} [options.enabledTypes]  启用的 PII 类型，默认全部
   * @param {boolean} [options.logRedactions=false]  是否记录脱敏操作
   */
  constructor(options = {}) {
    this._enabledTypes = options.enabledTypes ?? Object.keys(PII_PATTERNS);
    this._logRedactions = options.logRedactions ?? false;
  }

  /**
   * 对文本进行 PII 脱敏
   * @param {string} text
   * @returns {{text: string, redactions: Array<{type: string, count: number}>}}
   */
  sanitize(text) {
    if (!text || typeof text !== "string") {
      return { text: text ?? "", redactions: [] };
    }

    let result = text;
    const redactions = [];

    for (const [type, config] of Object.entries(PII_PATTERNS)) {
      if (!this._enabledTypes.includes(type)) continue;

      let count = 0;
      for (const pattern of config.patterns) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, () => {
          count++;
          return config.replacement;
        });
      }

      if (count > 0) {
        redactions.push({ type, count, description: config.description });
        if (this._logRedactions) {
          log.log("redacted", { type, count });
        }
      }
    }

    return { text: result, redactions };
  }

  /**
   * 批量脱敏（用于结构化数据）
   * @param {Array<{text: string}>} items
   * @returns {Array<{text: string, redactions: object[]}>}
   */
  sanitizeBatch(items) {
    return items.map((item) => ({
      ...item,
      ...this.sanitize(item.text ?? ""),
    }));
  }

  /**
   * 检查文本是否包含 PII
   * @param {string} text
   * @returns {boolean}
   */
  containsPii(text) {
    if (!text) return false;

    for (const [type, config] of Object.entries(PII_PATTERNS)) {
      if (!this._enabledTypes.includes(type)) continue;
      for (const pattern of config.patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) return true;
      }
    }

    return false;
  }

  /**
   * 获取支持的 PII 类型列表
   * @returns {string[]}
   */
  getSupportedTypes() {
    return Object.keys(PII_PATTERNS);
  }
}
