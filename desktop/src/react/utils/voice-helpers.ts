/**
 * voice-helpers.ts — 语音对话相关的共享工具函数和类型
 */

/** 语音对话状态 */
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'paused' | 'error';

/** 格式化秒数为 mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
