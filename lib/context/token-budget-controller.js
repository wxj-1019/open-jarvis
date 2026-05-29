/**
 * Token 预算控制器
 * 防止 Accessibility Tree 文本量过大导致 LLM 上下文溢出
 */
export class TokenBudgetController {
  /**
   * @param {object} [options]
   * @param {number} [options.maxTokens=2000]  最大 Token 数
   * @param {number} [options.avgCharsPerToken=4]  平均每个 Token 的字符数
   */
  constructor(options = {}) {
    this._maxTokens = options.maxTokens ?? 2000;
    this._avgCharsPerToken = options.avgCharsPerToken ?? 4;
    this._maxChars = this._maxTokens * this._avgCharsPerToken;
  }

  /**
   * 截断元素列表到预算内
   * @param {Array<{type: string, text: string, role: string}>} elements
   * @param {{type: string, text: string}|null} focusedElement
   * @returns {{elements: Array, focusedElement: object|null, truncated: boolean}}
   */
  applyBudget(elements, focusedElement) {
    if (!elements || elements.length === 0) {
      return { elements: [], focusedElement, truncated: false };
    }

    // 优先保留 focusedElement
    const priorityElements = [];
    if (focusedElement?.text) {
      priorityElements.push({ ...focusedElement, role: "focused" });
    }

    // 按重要性排序：button > link > text > 其他
    const rolePriority = { button: 3, link: 2, text: 1 };
    const sorted = [...elements].sort((a, b) => {
      return (rolePriority[b.role] ?? 0) - (rolePriority[a.role] ?? 0);
    });

    let currentChars = 0;
    const result = [...priorityElements];

    for (const el of sorted) {
      const elChars = (el.text ?? "").length + (el.role ?? "").length + 10; // 结构开销
      if (currentChars + elChars > this._maxChars && result.length > 5) {
        break;
      }
      result.push(el);
      currentChars += elChars;
    }

    const truncated = result.length < elements.length + priorityElements.length;

    return {
      elements: result,
      focusedElement: priorityElements[0] ?? focusedElement,
      truncated,
    };
  }
}
