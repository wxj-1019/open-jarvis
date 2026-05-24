/**
 * priority-queue.js - 优先级消息队列
 *
 * 用于 info 级别通知的累积管理：
 * - FIFO 队列 + 内存保护（满时自动丢弃最旧消息）
 * - 支持批量取出（clear）用于与 normal/urgent 消息合并发送
 */

const VALID_PRIORITIES = new Set(["urgent", "normal", "info"]);
const DEFAULT_MAX_SIZE = 100;

export class PriorityMessageQueue {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxSize=100] - 队列最大长度，防止内存泄漏
   */
  constructor(opts = {}) {
    this._queue = [];
    this._maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /**
   * 推入一条消息到队列
   * @param {object} item - 消息项
   */
  push(item) {
    if (item == null || typeof item !== "object") return;
    if (this._queue.length >= this._maxSize) {
      this._queue.shift();
    }
    this._queue.push(item);
  }

  /**
   * 清空并返回所有累积的消息
   * @returns {Array<object>}
   */
  clear() {
    return this._queue.splice(0);
  }

  /**
   * 获取当前队列长度
   * @returns {number}
   */
  get size() {
    return this._queue.length;
  }

  /**
   * 检查队列是否为空
   * @returns {boolean}
   */
  get isEmpty() {
    return this._queue.length === 0;
  }
}

/**
 * 根据优先级获取延迟时间（毫秒）
 * @param {"urgent"|"normal"|"info"} priority
 * @returns {number} - 延迟毫秒数，urgent=0, normal=随机1000-3000
 */
export function getDelayByPriority(priority) {
  if (priority === "urgent") return 0;
  if (priority === "info") return 0;
  return randomInt(1000, 3000);
}

/**
 * 校验优先级参数是否合法
 * @param {string} priority
 * @returns {boolean}
 */
export function isValidPriority(priority) {
  return VALID_PRIORITIES.has(priority);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
