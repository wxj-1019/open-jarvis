import { useRef, useCallback, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/core';
import type { SlashItem } from '../components/input/slash-commands';
import type { FileMentionItem } from '../utils/file-mention-items';
import type { InputKeyEvent } from '../utils/input-helpers';

export interface UseKeyboardHandlerInput {
  editor: Editor | null;
  fileMenuOpen: boolean;
  fileMentionItems: FileMentionItem[];
  fileMentionBusy: boolean;
  fileSelected: number;
  setFileSelected: (v: number | ((prev: number) => number)) => void;
  slashMenuOpen: boolean;
  filteredCommands: SlashItem[];
  slashSelected: number;
  setSlashSelected: (v: number | ((prev: number) => number)) => void;
  isStreaming: boolean;
  surface: 'desktop' | 'mobile';
  handleSend: () => void;
  handleSteer: () => void;
  handleSlashSelect: (item: SlashItem) => void;
  handleFileMentionSelect: (item: FileMentionItem) => void;
  dismissSlashMenu: () => void;
  setFileMenuOpen: (v: boolean) => void;
}

export function useKeyboardHandler({
  editor,
  fileMenuOpen,
  fileMentionItems,
  fileMentionBusy,
  fileSelected,
  setFileSelected,
  slashMenuOpen,
  filteredCommands,
  slashSelected,
  setSlashSelected,
  isStreaming,
  surface,
  handleSend,
  handleSteer,
  handleSlashSelect,
  handleFileMentionSelect,
  dismissSlashMenu,
  setFileMenuOpen,
}: UseKeyboardHandlerInput) {
  const isComposingRef = useRef(false);
  const keyDownHandlerRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const beforeInputHandlerRef = useRef<(event: InputEvent) => boolean>(() => false);

  const handleEditorKeyDown = useCallback((e: InputKeyEvent): boolean => {
    if (e.defaultPrevented) return false;
    if (fileMenuOpen && (fileMentionItems.length > 0 || fileMentionBusy)) {
      if (e.key === 'ArrowDown' && fileMentionItems.length > 0) {
        e.preventDefault();
        setFileSelected(i => (i + 1) % fileMentionItems.length);
        return true;
      }
      if (e.key === 'ArrowUp' && fileMentionItems.length > 0) {
        e.preventDefault();
        setFileSelected(i => (i - 1 + fileMentionItems.length) % fileMentionItems.length);
        return true;
      }
      if ((e.key === 'Tab' || e.key === 'Enter') && fileMentionItems.length > 0) {
        e.preventDefault();
        const item = fileMentionItems[fileSelected];
        if (item) handleFileMentionSelect(item);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setFileMenuOpen(false);
        return true;
      }
    }
    if (slashMenuOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSelected(i => (i + 1) % filteredCommands.length); return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSelected(i => (i - 1 + filteredCommands.length) % filteredCommands.length); return true; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[slashSelected] || filteredCommands[0];
        if (cmd) handleSlashSelect(cmd);
        return true;
      }
      if (e.key === 'Escape') { e.preventDefault(); dismissSlashMenu(); return true; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current && !e.isComposing) {
      e.preventDefault();
      if (isStreaming && (editor?.getText().trim())) handleSteer(); else handleSend();
      return true;
    }
    return false;
  }, [
    dismissSlashMenu,
    fileMentionBusy,
    fileMentionItems,
    fileMenuOpen,
    fileSelected,
    filteredCommands,
    handleFileMentionSelect,
    handleSend,
    handleSteer,
    handleSlashSelect,
    isStreaming,
    editor,
    slashMenuOpen,
    slashSelected,
    setFileSelected,
    setSlashSelected,
    setFileMenuOpen,
  ]);

  keyDownHandlerRef.current = handleEditorKeyDown as (event: KeyboardEvent) => boolean;
  beforeInputHandlerRef.current = (event: InputEvent): boolean => {
    if (surface !== 'mobile') return false;
    if (event.defaultPrevented) return false;
    if (event.inputType !== 'insertParagraph') return false;
    return handleEditorKeyDown({
      key: 'Enter',
      shiftKey: false,
      defaultPrevented: event.defaultPrevented,
      isComposing: event.isComposing,
      preventDefault: () => event.preventDefault(),
    });
  };

  return {
    isComposingRef,
    keyDownHandlerRef,
    beforeInputHandlerRef,
  };
}
