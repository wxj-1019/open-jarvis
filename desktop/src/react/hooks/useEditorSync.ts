import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import type { SlashItem } from '../components/input/slash-commands';
import { findFileMentionRange } from '../utils/input-helpers';
import { getSlashMatches } from '../components/input/slash-commands';
import type { FileMentionRange } from '../utils/input-helpers';
import { useStore } from '../stores';

export interface UseEditorSyncInput {
  editor: Editor | null;
  slashCommands: SlashItem[];
  currentSessionPath: string | null;
  setDraft: (sessionPath: string, text: string) => void;
  clearDraft: (sessionPath: string) => void;
}

export function useEditorSync({
  editor,
  slashCommands,
  currentSessionPath,
  setDraft,
  clearDraft,
}: UseEditorSyncInput) {
  const slashDismissedTextRef = useRef<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [fileSelected, setFileSelected] = useState(0);
  const [fileMentionRange, setFileMentionRange] = useState<FileMentionRange | null>(null);
  const [fileMentionQuery, setFileMentionQuery] = useState('');
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashSelected, setSlashSelected] = useState(0);

  // Sync editor text to React state (drives hasInput / canSend) + slash menu detection + draft save
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const text = editor.getText();
      setInputText(text);
      if (slashDismissedTextRef.current && slashDismissedTextRef.current !== text.trim()) {
        slashDismissedTextRef.current = null;
      }
      const slashMatches = getSlashMatches(text, slashCommands);
      const fileMention = findFileMentionRange(editor);
      if (fileMention) {
        setFileMentionRange(fileMention);
        setFileMentionQuery(fileMention.query);
        setFileMenuOpen(true);
        setFileSelected(0);
        setSlashMenuOpen(false);
      } else {
        setFileMenuOpen(false);
        setFileMentionRange(null);
        setFileMentionQuery('');
      }
      if (!fileMention && slashMatches.length > 0 && slashDismissedTextRef.current !== text.trim()) {
        setSlashMenuOpen(true);
        setSlashSelected(0);
      } else {
        setSlashMenuOpen(false);
      }
      // Save draft to store
      if (currentSessionPath) {
        setDraft(currentSessionPath, text);
      }
      // Auto-scroll when content exceeds visible area
      requestAnimationFrame(() => editor?.commands?.scrollIntoView());
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, currentSessionPath, setDraft, slashCommands]);

  // Restore draft when switching sessions
  useEffect(() => {
    if (!editor || !currentSessionPath) return;
    const draft = useStore.getState().drafts[currentSessionPath] || '';
    const current = editor.getText();
    if (draft !== current) {
      if (!draft) {
        editor.commands.setContent('', { emitUpdate: false });
      } else {
        const doc = {
          type: 'doc' as const,
          content: draft.split('\n').map(line => ({
            type: 'paragraph' as const,
            content: line ? [{ type: 'text' as const, text: line }] : [],
          })),
        };
        editor.commands.setContent(doc, { emitUpdate: false });
      }
    }
  }, [editor, currentSessionPath]);

  return {
    inputText,
    fileMenuOpen,
    setFileMenuOpen,
    fileSelected,
    setFileSelected,
    fileMentionRange,
    fileMentionQuery,
    slashMenuOpen,
    setSlashMenuOpen,
    slashSelected,
    setSlashSelected,
    slashDismissedTextRef,
  };
}
