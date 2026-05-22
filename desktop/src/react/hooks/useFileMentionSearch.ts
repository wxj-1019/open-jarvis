import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { useStore } from '../stores';
import { selectSessionFiles } from '../stores/selectors/file-refs';
import { searchDeskFiles } from '../stores/desk-actions';
import {
  buildFileMentionItems,
  type FileMentionItem,
} from '../utils/file-mention-items';
import type { FileMentionRange } from '../utils/input-helpers';
import type { DeskSearchResult } from '../types';

const EMPTY_FILE_REFS: readonly import('../types/file-ref').FileRef[] = Object.freeze([]);

export interface UseFileMentionSearchInput {
  editor: Editor | null;
  fileMenuOpen: boolean;
  fileMentionQuery: string;
  fileMentionRange: FileMentionRange | null;
  fileSelected: number;
  setFileSelected: (v: number | ((prev: number) => number)) => void;
}

export function useFileMentionSearch({
  editor,
  fileMenuOpen,
  fileMentionQuery,
  fileMentionRange,
  fileSelected,
  setFileSelected,
}: UseFileMentionSearchInput) {
  const attachedFiles = useStore(s => s.attachedFiles);
  const sessionFiles = useStore(s => (s.currentSessionPath ? selectSessionFiles(s, s.currentSessionPath) : EMPTY_FILE_REFS));
  const deskFiles = useStore(s => s.deskFiles);
  const deskBasePath = useStore(s => s.deskBasePath);
  const deskCurrentPath = useStore(s => s.deskCurrentPath);

  const [fileMentionSearchResults, setFileMentionSearchResults] = useState<DeskSearchResult[]>([]);
  const [fileMentionBusy, setFileMentionBusy] = useState(false);
  const fileMentionSearchSeqRef = useRef(0);

  const fileMentionItems = useMemo(() => buildFileMentionItems({
    query: fileMentionQuery,
    attachedFiles,
    sessionFiles,
    deskFiles,
    deskBasePath,
    deskCurrentPath,
    searchResults: fileMentionSearchResults,
  }), [
    attachedFiles,
    deskBasePath,
    deskCurrentPath,
    deskFiles,
    fileMentionQuery,
    fileMentionSearchResults,
    sessionFiles,
  ]);

  // Debounced search
  useEffect(() => {
    if (!fileMenuOpen) {
      setFileMentionSearchResults([]);
      setFileMentionBusy(false);
      return;
    }

    const query = fileMentionQuery.trim();
    const seq = ++fileMentionSearchSeqRef.current;
    if (!query) {
      setFileMentionSearchResults([]);
      setFileMentionBusy(false);
      return;
    }

    setFileMentionBusy(true);
    const timer = window.setTimeout(() => {
      searchDeskFiles(query)
        .then((results) => {
          if (fileMentionSearchSeqRef.current === seq) setFileMentionSearchResults(results);
        })
        .catch((err: unknown) => {
          if (fileMentionSearchSeqRef.current === seq) setFileMentionSearchResults([]);
          console.warn('[file-mention] search failed', err);
        })
        .finally(() => {
          if (fileMentionSearchSeqRef.current === seq) setFileMentionBusy(false);
        });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [fileMentionQuery, fileMenuOpen]);

  // Clamp selection when items change
  useEffect(() => {
    if (fileSelected < fileMentionItems.length) return;
    setFileSelected(Math.max(0, fileMentionItems.length - 1));
  }, [fileMentionItems.length, fileSelected, setFileSelected]);

  const handleFileMentionSelect = useCallback((item: FileMentionItem) => {
    if (!editor || !fileMentionRange) return;
    editor.chain()
      .focus()
      .deleteRange({ from: fileMentionRange.from, to: fileMentionRange.to })
      .insertContent({
        type: 'fileBadge',
        attrs: {
          fileId: item.fileId || null,
          path: item.path,
          name: item.name,
          isDirectory: !!item.isDirectory,
          mimeType: item.mimeType || null,
        },
      })
      .insertContent(' ')
      .run();
    // Note: the caller (InputAreaInner) is responsible for closing the menu
    // and clearing the mention range/query via the fileMenuOpen/fileMentionRange state.
  }, [editor, fileMentionRange]);

  return {
    fileMentionItems,
    fileMentionBusy,
    handleFileMentionSelect,
  };
}
