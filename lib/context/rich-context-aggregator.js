/**
 * rich-context-aggregator.js — 富上下文聚合器
 *
 * 将 L1/L2/L3 三层数据合并为结构化上下文对象，
 * 供 Agent 系统提示注入和规则引擎使用。
 */

/**
 * @typedef {object} RichContext
 * @property {number} timestamp
 * @property {object|null} l1 — 基础层 { app, title, platform }
 * @property {object|null} l2 — 内容层 { filePath, fileContent, clipboard, language, sourceType }
 * @property {object|null} l3 — 视觉层 { screenshot, visualDescription }
 */

export class RichContextAggregator {
  /**
   * 聚合三层上下文数据
   * @param {object|null} l1 — L1 基础层 { app, title, platform }
   * @param {object|null} l2 — L2 内容层 { type, content, metadata }
   * @param {object|null} l3 — L3 视觉层 { screenshot, visualDescription }
   * @returns {RichContext} 结构化上下文对象
   */
  static aggregate(l1, l2, l3) {
    return {
      timestamp: Date.now(),
      l1: l1 || null,
      l2: l2 ? this._normalizeL2(l2) : null,
      l3: l3 || null,
    };
  }

  /**
   * 统一不同适配器的 L2 输出为标准格式
   * @param {object} l2
   * @returns {object}
   */
  static _normalizeL2(l2) {
    return {
      filePath: l2.metadata?.filePath || null,
      fileContent: l2.content || null,
      clipboard: l2.type === "clipboard" ? l2.content : null,
      language: l2.metadata?.language || null,
      sourceType: l2.type || "unknown",
    };
  }
}
