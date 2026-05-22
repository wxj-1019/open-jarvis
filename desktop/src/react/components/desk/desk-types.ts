/**
 * desk-types — DeskSection 子组件共用的类型、常量、工具函数
 */

import type { ContextMenuItem } from '../../ui';
import type { DeskFile } from '../../types';
import { extOfName, inferKindByExt } from '../../utils/file-kind';
import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { Folder, FileText, Image, Code, File, FolderOpen, CaretLeft, Gear, ArrowsClockwise, List, Funnel } from '@phosphor-icons/react';

// ── Phosphor 图标 ──

export const ICONS = {
  folder: { component: Folder, size: 14 },
  doc: { component: FileText, size: 14 },
  image: { component: Image, size: 14 },
  code: { component: Code, size: 14 },
  pdf: { component: File, size: 14 },
  file: { component: File, size: 14 },
  finderOpen: { component: FolderOpen, size: 13 },
  back: { component: CaretLeft, size: 12 },
  settings: { component: Gear, size: 14 },
  refresh: { component: ArrowsClockwise, size: 12 },
  sort: { component: List, size: 12 },
  filter: { component: Funnel, size: 12 },
} as const;

// ── 排序 ──

export const DESK_SORT_KEY = 'hana-desk-sort';

export type SortMode = 'mtime-desc' | 'name-asc' | 'name-desc' | 'size-desc' | 'type-asc';
export type FileTypeFilter = 'image' | 'text' | 'video';

function tr(key: string, vars?: Record<string, string | number>): string {
  return window.t ? window.t(key, vars) : key;
}

export function getSortOptions(): Array<{ key: SortMode; label: string }> {
  return [
    { key: 'mtime-desc', label: tr('desk.sort.mtime') },
    { key: 'name-asc', label: tr('desk.sort.nameAsc') },
    { key: 'name-desc', label: tr('desk.sort.nameDesc') },
    { key: 'size-desc', label: tr('desk.sort.size') },
    { key: 'type-asc', label: tr('desk.sort.type') },
  ];
}

export function getSortShort(mode: string): string {
  const map: Record<string, string> = {
    'mtime-desc': tr('desk.sort.mtimeShort'),
    'name-asc': tr('desk.sort.nameAscShort'),
    'name-desc': tr('desk.sort.nameDescShort'),
    'size-desc': tr('desk.sort.sizeShort'),
    'type-asc': tr('desk.sort.typeShort'),
  };
  return map[mode] || tr('desk.sort.label');
}

export function getFileTypeFilterOptions(): Array<{ key: FileTypeFilter; label: string }> {
  return [
    { key: 'image', label: tr('desk.filter.images') },
    { key: 'text', label: tr('desk.filter.text') },
    { key: 'video', label: tr('desk.filter.videos') },
  ];
}

export function getFilterShort(filters: readonly FileTypeFilter[]): string {
  if (filters.length === 0) return tr('desk.filter.label');
  if (filters.length === 1) {
    const found = getFileTypeFilterOptions().find(item => item.key === filters[0]);
    return found?.label || tr('desk.filter.label');
  }
  return tr('desk.filter.activeShort', { count: filters.length });
}

export function fileMatchesTypeFilters(file: DeskFile, filters: readonly FileTypeFilter[]): boolean {
  if (file.isDir || filters.length === 0) return true;
  const kind = inferKindByExt(extOfName(file.name));
  return filters.some(filter => {
    if (filter === 'image') return kind === 'image' || kind === 'svg';
    if (filter === 'video') return kind === 'video';
    if (filter === 'text') return kind === 'markdown' || kind === 'code' || kind === 'doc' || kind === 'pdf';
    return false;
  });
}

export function getFileIcon(name: string): { component: ComponentType<IconProps>; size: number } {
  const ext = extOfName(name) || '';
  if (['md', 'txt'].includes(ext)) return ICONS.doc;
  if (ext === 'pdf') return ICONS.pdf;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return ICONS.image;
  if (['js', 'ts', 'py', 'json', 'yaml', 'yml', 'html', 'css'].includes(ext)) return ICONS.code;
  return ICONS.file;
}

export function sortDeskFiles(files: DeskFile[], mode: SortMode): DeskFile[] {
  const filtered = files.filter(f => f.name !== 'jian.md');
  const dirs = filtered.filter(f => f.isDir);
  const regular = filtered.filter(f => !f.isDir);

  const cmp = (a: DeskFile, b: DeskFile): number => {
    switch (mode) {
      case 'name-asc': return a.name.localeCompare(b.name, 'zh');
      case 'name-desc': return b.name.localeCompare(a.name, 'zh');
      case 'size-desc':
        if (a.isDir) return a.name.localeCompare(b.name, 'zh');
        return (b.size ?? 0) - (a.size ?? 0);
      case 'type-asc': {
        const extA = a.name.includes('.') ? a.name.split('.').pop()! : '';
        const extB = b.name.includes('.') ? b.name.split('.').pop()! : '';
        return extA.localeCompare(extB) || a.name.localeCompare(b.name, 'zh');
      }
      case 'mtime-desc':
      default:
        return new Date(b.mtime ?? 0).getTime() - new Date(a.mtime ?? 0).getTime();
    }
  };

  dirs.sort(cmp);
  regular.sort(cmp);
  return [...dirs, ...regular];
}

// ── 共享 context menu 状态类型 ──

export interface CtxMenuState {
  items: ContextMenuItem[];
  position: { x: number; y: number };
}
