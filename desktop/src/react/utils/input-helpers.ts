import type { Editor } from '@tiptap/core';
import type { ChatListItem, SessionConfirmationBlock } from '../stores/chat-types';

export interface FileMentionRange {
  from: number;
  to: number;
  query: string;
}

export interface InputKeyEvent {
  key: string;
  shiftKey: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  preventDefault: () => void;
}

export function chatVideoMimeTypeForName(name: string, fallback?: string): string {
  if (fallback?.startsWith('video/')) return fallback;
  const ext = name.toLowerCase().replace(/^.*\./, '');
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
  };
  return mimeMap[ext] || 'video/mp4';
}

export function chatImageMimeTypeForName(name: string, fallback?: string): string {
  if (fallback?.startsWith('image/')) return fallback;
  const ext = name.toLowerCase().replace(/^.*\./, '');
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  return mimeMap[ext] || 'image/png';
}

export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

export function findLatestInputSessionConfirmation(items: ChatListItem[] | undefined, confirmId?: string, pendingOnly?: boolean): SessionConfirmationBlock | null {
  if (!items) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== 'message' || item.data.role !== 'assistant') continue;
    const blocks = item.data.blocks || [];
    for (let j = blocks.length - 1; j >= 0; j--) {
      const block = blocks[j];
      if (block.type !== 'session_confirmation' || block.surface !== 'input') continue;
      if (confirmId && block.confirmId !== confirmId) continue;
      if (pendingOnly && block.status !== 'pending') continue;
      return block;
    }
  }
  return null;
}

export function findFileMentionRange(editor: Editor | null): FileMentionRange | null {
  if (!editor?.state?.selection) return null;
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const before = selection.$from.parent.textBetween(0, selection.$from.parentOffset, '\n', '\n');
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) return null;
  if (atIndex > 0 && /\S/.test(before[atIndex - 1])) return null;
  const query = before.slice(atIndex + 1);
  if (/[\s@]/.test(query)) return null;
  return {
    from: selection.from - query.length - 1,
    to: selection.from,
    query,
  };
}

export function editorHasInlineNode(editor: Editor | null, nodeType: string): boolean {
  if (!editor?.state?.doc) return false;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) {
      found = true;
      return false;
    }
    return !found;
  });
  return found;
}
