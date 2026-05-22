/**
 * Icon registry — Phosphor-based file-type icons
 */

import type { IconProps } from '@phosphor-icons/react';
import {
  File, FileText, Table, Presentation, Image, Video,
  MusicNote, Archive, Code, Globe, Folder, Lightbulb, Paperclip,
} from '@phosphor-icons/react';

import type { ComponentType } from 'react';

export const FILE_KIND_ICONS: Record<string, ComponentType<IconProps>> = {
  file: File,
  text: FileText,
  table: Table,
  slides: Presentation,
  image: Image,
  video: Video,
  music: MusicNote,
  archive: Archive,
  code: Code,
  globe: Globe,
  folder: Folder,
  skill: Lightbulb,
  clip: Paperclip,
};

const FILE_ICON_MAP: Record<string, string> = {
  pdf: 'file', docx: 'text', doc: 'text', xlsx: 'table', xls: 'table',
  pptx: 'slides', ppt: 'slides', md: 'text', txt: 'text', csv: 'table',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', bmp: 'image',
  mp4: 'video', mp3: 'music', zip: 'archive',
  js: 'code', ts: 'code', py: 'code', css: 'code', json: 'code',
  html: 'globe', htm: 'globe',
  skill: 'skill',
};

export function fileIconComponent(ext: string): ComponentType<IconProps> {
  return FILE_KIND_ICONS[FILE_ICON_MAP[ext]] || FILE_KIND_ICONS.file;
}
