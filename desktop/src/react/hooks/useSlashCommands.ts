import { useState, useEffect, useCallback, useMemo, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { useStore } from '../stores';
import { useI18n } from './use-i18n';
import { useSkillSlashItems } from './use-slash-items';
import { loadDeskFiles, toggleJianSidebar } from '../stores/desk-actions';
import { sendAsUser } from './useMessageSend';
import {
  XING_PROMPT,
  executeDiary,
  executeCompact,
  buildSlashCommands,
  getSlashMatches,
  type SlashItem,
} from '../components/input/slash-commands';

export interface UseSlashCommandsInput {
  editor: Editor | null;
  slashMenuOpen: boolean;
  setSlashMenuOpen: (v: boolean) => void;
  slashSelected: number;
  setSlashSelected: (v: number | ((prev: number) => number)) => void;
  inputText: string;
  surface: 'desktop' | 'mobile';
  slashDismissedTextRef: MutableRefObject<string | null>;
}

export function useSlashCommands({
  editor,
  slashMenuOpen,
  setSlashMenuOpen,
  slashSelected,
  setSlashSelected,
  inputText,
  surface,
  slashDismissedTextRef,
}: UseSlashCommandsInput) {
  const { t } = useI18n();
  const addToast = useStore(s => s.addToast);
  const removeToast = useStore(s => s.removeToast);

  const [slashBusy, setSlashBusy] = useState<string | null>(null);
  const [slashResult, setSlashResult] = useState<{ text: string; type: 'success' | 'error'; deskDir?: string } | null>(null);

  // ── Global inline notice ──
  useEffect(() => {
    const handler = (e: Event) => {
      const { text, type, deskDir } = (e as CustomEvent).detail;
      setSlashResult({ text, type, deskDir });
      setTimeout(() => setSlashResult(null), 3000);
    };
    window.addEventListener('hana-inline-notice', handler);
    return () => window.removeEventListener('hana-inline-notice', handler);
  }, []);

  // ── Slash command callbacks ──
  const diaryFn = useCallback(() => {
    executeDiary(t, addToast, removeToast, () => { editor?.commands.clearContent(); }, setSlashMenuOpen)();
  }, [t, addToast, removeToast, editor, setSlashMenuOpen]);
  const xingFn = useCallback(async () => {
    editor?.commands.clearContent();
    setSlashMenuOpen(false);
    await sendAsUser(XING_PROMPT);
  }, [editor, setSlashMenuOpen]);
  const compactFn = useCallback(async () => {
    await executeCompact(setSlashBusy, () => { editor?.commands.clearContent(); }, setSlashMenuOpen)();
  }, [editor, setSlashMenuOpen]);

  const skillItems = useSkillSlashItems({ enabled: surface !== 'mobile' });

  const slashCommands = useMemo(
    () => [...buildSlashCommands(t, diaryFn, xingFn, compactFn), ...skillItems],
    [diaryFn, xingFn, compactFn, t, skillItems],
  );

  const filteredCommands = useMemo(() => {
    if (!inputText.startsWith('/')) return slashCommands;
    return getSlashMatches(inputText, slashCommands);
  }, [inputText, slashCommands]);

  useEffect(() => {
    setSlashSelected(index => Math.min(index, Math.max(filteredCommands.length - 1, 0)));
  }, [filteredCommands.length, setSlashSelected]);

  const dismissSlashMenu = useCallback(() => {
    const text = editor?.getText().trim() ?? inputText.trim();
    slashDismissedTextRef.current = text.startsWith('/') ? text : null;
    setSlashMenuOpen(false);
  }, [editor, inputText, setSlashMenuOpen, slashDismissedTextRef]);

  const openSlashMenu = useCallback(() => {
    slashDismissedTextRef.current = null;
    setSlashMenuOpen(true);
  }, [setSlashMenuOpen, slashDismissedTextRef]);

  const handleSlashToggle = useCallback(() => {
    if (slashMenuOpen) dismissSlashMenu();
    else openSlashMenu();
  }, [slashMenuOpen, dismissSlashMenu, openSlashMenu]);

  const handleSlashSelect = useCallback((item: SlashItem) => {
    slashDismissedTextRef.current = null;
    if (item.type === 'builtin') {
      item.execute();
      return;
    }
    if (!editor) return;
    editor.chain()
      .clearContent()
      .insertContent({ type: 'skillBadge', attrs: { name: item.name } })
      .insertContent(' ')
      .focus()
      .run();
    setSlashMenuOpen(false);
  }, [editor, setSlashMenuOpen, slashDismissedTextRef]);

  const handleSlashResultClick = useCallback(() => {
    if (!slashResult?.deskDir) return;
    toggleJianSidebar(true);
    loadDeskFiles('', slashResult.deskDir);
  }, [slashResult?.deskDir]);

  return {
    slashCommands,
    filteredCommands,
    slashBusy,
    slashResult,
    handleSlashSelect,
    handleSlashToggle,
    handleSlashResultClick,
    dismissSlashMenu,
    openSlashMenu,
  };
}
