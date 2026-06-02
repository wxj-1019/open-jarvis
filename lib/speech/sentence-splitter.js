/**
 * sentence-splitter.js — 多语言分句工具
 *
 * 支持中日韩和英文标点符号分句。
 * 用于将 Agent 流式输出的文本逐句送入 TTS。
 */

const SENTENCE_ENDINGS = /([。！？!?\n]+)/;
const CJK_SENTENCE_ENDINGS = /[。！？]/;
const EN_SENTENCE_ENDINGS = /[.!?]/;

const ABBREVIATION_PATTERN = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|dept|est|vol)\.\s*$/i;

/**
 * 将文本分割为完整句子。
 *
 * @param {string} text - 输入文本
 * @param {object} [opts]
 * @param {boolean} [opts.includeRemainder=true] - 是否包含末尾不完整文本
 * @returns {string[]} 句子数组
 */
export function splitSentences(text, opts = {}) {
  const { includeRemainder = true } = opts;

  if (!text || typeof text !== 'string') {
    return [];
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const parts = trimmed.split(SENTENCE_ENDINGS);
  const sentences = [];
  let i = 0;

  while (i < parts.length) {
    const content = parts[i];
    const delimiter = parts[i + 1] || '';

    if (!content && !delimiter) {
      i += 2;
      continue;
    }

    const combined = content + delimiter;

    if (delimiter) {
      // 检查是否是缩写（英文）
      if (EN_SENTENCE_ENDINGS.test(delimiter) && ABBREVIATION_PATTERN.test(content)) {
        // 缩写后跟句号，不在此处分割；将内容和标点合并到下一段
        if (i + 2 < parts.length) {
          parts[i + 2] = combined + (parts[i + 2] || '');
        } else {
          // 最后一段，作为不完整句
          if (includeRemainder && combined.trim()) {
            sentences.push(combined.trim());
          }
        }
        i += 2;
        continue;
      }

      const sentence = combined.trim();
      if (sentence) {
        sentences.push(sentence);
      }
    } else {
      // 没有后续分隔符 — 末尾不完整文本
      const remainder = content.trim();
      if (remainder && includeRemainder) {
        sentences.push(remainder);
      }
    }

    i += 2;
  }

  return sentences;
}

/**
 * 判断文本是否以完整句子结尾。
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isSentenceComplete(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return CJK_SENTENCE_ENDINGS.test(trimmed.slice(-1))
    || EN_SENTENCE_ENDINGS.test(trimmed.slice(-1));
}
