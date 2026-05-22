/**
 * 前端全局常量
 */

/** 单条消息最大附件数量 */
export const MAX_ATTACHMENTS = 9;

/** 响应式断点（与 CSS 设计令牌同步） */
export const BREAKPOINTS = {
  COMPACT: 640,
  TABLET: 860,
  DESKTOP: 1200,
  WIDE: 1600,
} as const;
