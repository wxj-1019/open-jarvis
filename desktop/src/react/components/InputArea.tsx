/**
 * InputArea -- Chat input area React component
 *
 * Sub-components split into ./input/ directory.
 * Logic extracted into custom hooks in ../hooks/.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { useStore } from '../stores';
import { selectPreviewItems, selectActiveTabId } from '../stores/preview-slice';
import { useI18n } from '../hooks/use-i18n';
import type { PermissionMode } from './input/PlanModeButton';
import { SlashCommandMenu } from './input/SlashCommandMenu';
import { FileMentionMenu } from './input/FileMentionMenu';
import { InputStatusBars } from './input/InputStatusBars';
import { InputContextRow } from './input/InputContextRow';
import { InputControlBar } from './input/InputControlBar';
import { SessionConfirmationPrompt } from './input/SessionConfirmationPrompt';
import { findLatestInputSessionConfirmation } from '../utils/input-helpers';
import { createInputEditorExtensions } from './input/input-editor-extensions';
import { useWelcomePlaceholder } from '../hooks/useWelcomePlaceholder';
import { useSessionConfirmation } from '../hooks/useSessionConfirmation';
import { useInputCardLayout } from '../hooks/useInputCardLayout';
import { useMessageSend } from '../hooks/useMessageSend';
import { useEditorSync } from '../hooks/useEditorSync';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useFileMentionSearch } from '../hooks/useFileMentionSearch';
import { useFileAttachment } from '../hooks/useFileAttachment';
import { useKeyboardHandler } from '../hooks/useKeyboardHandler';
import { useClickOutside } from '../hooks/useClickOutside';
import { getSlashMatches, type SlashItem } from './input/slash-commands';
import styles from './input/InputArea.module.css';

const EMPTY_TODOS = [] as import('../types/index').TodoItem[];

export type { SlashItem };

// ── Main component ──

export interface InputAreaProps {
  surface?: 'desktop' | 'mobile';
}

export function InputArea({ surface = 'desktop' }: InputAreaProps = {}) {
  return <InputAreaInner surface={surface} />;
}

function InputAreaInner({ surface }: Required<InputAreaProps>) {
  const { t } = useI18n();

  // ── Zustand state ──
  const isStreaming = useStore(s => s.streamingSessions.includes(s.currentSessionPath || ''));
  const connected = useStore(s => s.connected);
  const currentSessionPath = useStore(s => s.currentSessionPath);
  const compacting = useStore(s => currentSessionPath ? s.compactingSessions.includes(currentSessionPath) : false);
  const screenshotBusy = useStore(s => s.screenshotTaskCount > 0);
  const screenshotProgress = useStore(s => s.screenshotProgress);
  const inlineError = useStore(s => s.inlineErrors[s.currentSessionPath || ''] ?? null);
  const sessionTodos = useStore(s => (s.currentSessionPath && s.todosBySession[s.currentSessionPath]) || EMPTY_TODOS);
  const attachedFiles = useStore(s => s.attachedFiles);
  const docContextAttached = useStore(s => s.docContextAttached);
  const quotedSelection = useStore(s => s.quotedSelection);
  const previewItems = useStore(selectPreviewItems);
  const activeTabId = useStore(selectActiveTabId);
  const previewOpen = useStore(s => s.previewOpen);
  const models = useStore(s => s.models);
  const thinkingLevel = useStore(s => s.thinkingLevel);
  const modelSwitching = useStore(s => s.modelSwitching);
  const currentSessionItems = useStore(s => s.currentSessionPath ? s.chatSessions[s.currentSessionPath]?.items : undefined);
  const pendingSessionConfirmation = useMemo(() => {
    return findLatestInputSessionConfirmation(currentSessionItems, undefined, true);
  }, [currentSessionItems]);

  // Zustand actions
  const removeAttachedFile = useStore(s => s.removeAttachedFile);
  const setDocContextAttached = useStore(s => s.setDocContextAttached);
  const setDraft = useStore(s => s.setDraft);
  const clearDraft = useStore(s => s.clearDraft);
  const setThinkingLevel = useStore(s => s.setThinkingLevel);

  // ── Current model info ──
  const globalModelInfo = useMemo(() => models.find(m => m.isCurrent), [models]);
  const sessionModel = useStore(s => s.currentSessionPath ? s.sessionModelsByPath[s.currentSessionPath] : undefined);
  const currentModelInfo = sessionModel || globalModelInfo;
  const supportsVision = !Array.isArray(currentModelInfo?.input) || currentModelInfo.input.includes("image");

  // ── Local state ──
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('ask');

  // ── Refs for menu anchors ──
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const slashBtnRef = useRef<HTMLButtonElement>(null);
  const slashDismissedTextRef = useRef<string | null>(null);

  // ── Welcome placeholder ──
  const { placeholder, getEditorPlaceholder } = useWelcomePlaceholder();

  // ── Session confirmation lifecycle ──
  const { visibleSessionConfirmation, sessionConfirmationExiting } = useSessionConfirmation(
    currentSessionItems,
    pendingSessionConfirmation,
  );

  // ── TipTap editor ──
  const editor = useEditor({
    immediatelyRender: surface !== 'mobile',
    extensions: createInputEditorExtensions(getEditorPlaceholder),
    editorProps: {
      attributes: {
        class: styles['input-box'],
        id: 'inputBox',
        spellcheck: 'false',
      },
      handlePaste: (_view: any, event: any) => pasteHandlerRef.current(event),
      handleKeyDown: (_view: any, event: any) => keyDownHandlerRef.current(event),
      handleDOMEvents: {
        beforeinput: (_view: any, event: any) => beforeInputHandlerRef.current(event as InputEvent),
      },
    },
  });

  // ── Hooks (ordered to resolve dependency chain) ──

  // Step 1: Independent hooks (no inter-hook deps)
  const { inputSurfaceRef, inputCardRef } = useInputCardLayout(editor);
  const { browserFileInputRef, handleBrowserFileInputChange, handleAttach } = useFileAttachment({ surface });

  // Step 2: Slash commands (uses standalone sendAsUser, no menu state needed for slashCommands itself)
  // Pass refs as needed; menu state from useEditorSync isn't available yet, but that's OK:
  // slashCommands + handleSlashSelect are computed without it.
  // filteredCommands/dismissSlashMenu depend on inputText which is initially '' (correct).
  const {
    slashCommands,
    filteredCommands: _stubFiltered,
    slashBusy,
    slashResult,
    handleSlashSelect,
    handleSlashToggle,
    handleSlashResultClick,
    dismissSlashMenu,
    openSlashMenu: _openSlashMenu,
  } = useSlashCommands({
    editor,
    slashMenuOpen: false,
    setSlashMenuOpen: (() => {}) as any,
    slashSelected: 0,
    setSlashSelected: (() => {}) as any,
    inputText: '',
    surface,
    slashDismissedTextRef,
  });

  // Step 3: Editor sync (needs slashCommands from step 2)
  const {
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
  } = useEditorSync({
    editor,
    slashCommands,
    currentSessionPath,
    setDraft,
    clearDraft,
  });

  // Compute filteredCommands with real inputText (breaks circular dep: useSlashCommands has stub inputText)
  const filteredCommands = useMemo(() => {
    if (!inputText.startsWith('/')) return slashCommands;
    return getSlashMatches(inputText, slashCommands);
  }, [inputText, slashCommands]);

  // Step 4: Message send (needs handleSlashSelect + slashCommands + menu state from steps 2-3)
  const currentDoc = useMemo(() => {
    if (!previewOpen || !activeTabId) return null;
    const art = previewItems.find(a => a.id === activeTabId);
    if (!art?.filePath) return null;
    return { path: art.filePath, name: art.title || art.filePath.split('/').pop() || '' };
  }, [previewOpen, activeTabId, previewItems]);

  const {
    sending,
    canSend,
    handleSend,
    handleSteer,
    handleStop,
    handlePaste,
    pasteHandlerRef,
    handleCompleteTodos,
    completingTodos,
  } = useMessageSend({
    editor,
    attachedFiles,
    docContextAttached,
    currentDoc,
    surface,
    currentSessionPath,
    currentModelInfo,
    supportsVision,
    isStreaming,
    connected,
    modelSwitching,
    sessionTodos,
    slashCommands,
    slashSelected,
    handleSlashSelect,
    slashDismissedTextRef,
    setPermissionMode,
  });

  // Step 5: Click outside handlers
  useClickOutside(slashMenuOpen, slashMenuRef, slashBtnRef, dismissSlashMenu);
  const closeFileMenu = useCallback(() => setFileMenuOpen(false), [setFileMenuOpen]);
  useClickOutside(fileMenuOpen, fileMenuRef, undefined, closeFileMenu);

  // Step 6: File mention search
  const {
    fileMentionItems,
    fileMentionBusy,
    handleFileMentionSelect,
  } = useFileMentionSearch({
    editor,
    fileMenuOpen,
    fileMentionQuery,
    fileMentionRange,
    fileSelected,
    setFileSelected,
  });

  // Step 7: Keyboard handler (needs everything)
  const { isComposingRef, keyDownHandlerRef, beforeInputHandlerRef } = useKeyboardHandler({
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
  });

  // ── Doc context cleanup ──
  const hasDoc = !!currentDoc;
  useEffect(() => {
    if (!hasDoc && docContextAttached) setDocContextAttached(false);
  }, [hasDoc, docContextAttached, setDocContextAttached]);

  // ── Editor placeholder refresh ──
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta('input-placeholder-refresh', placeholder));
  }, [editor, placeholder]);

  // ── Voice recognition handler ──
  const handleVoiceRecognized = useCallback((text: string) => {
    if (!editor || editor.isDestroyed || !text) return;
    // 在光标位置插入文本
    editor.commands.insertContent(text);
    editor.commands.focus();
  }, [editor]);

  // ── Focus trigger ──
  const inputFocusTrigger = useStore(s => s.inputFocusTrigger);
  useEffect(() => {
    if (inputFocusTrigger > 0) editor?.commands.focus();
  }, [inputFocusTrigger, editor]);

  // ── JSX ──
  return (
    <div
      className={`${styles['input-surface']}${surface === 'mobile' ? ` ${styles['input-surface-mobile']}` : ''}`}
      ref={inputSurfaceRef}
    >
      <InputContextRow
        attachedFiles={attachedFiles}
        removeAttachedFile={removeAttachedFile}
        hasQuotedSelection={!!quotedSelection}
        sessionTodos={sessionTodos}
        onCompleteTodos={handleCompleteTodos}
        completingTodos={completingTodos}
      />
      <InputStatusBars
        slashBusy={slashBusy}
        slashBusyLabel={slashCommands.find(c => c.name === slashBusy)?.busyLabel || t('common.executing')}
        compacting={compacting}
        compactingLabel={t('chat.compacting')}
        screenshotBusy={screenshotBusy}
        screenshotLabel={t('common.screenshotInProgress')}
        screenshotPageLabel={screenshotProgress && screenshotProgress.totalPages > 0
          ? t('common.screenshotProgressPage', {
            current: screenshotProgress.currentPage,
            total: screenshotProgress.totalPages,
          })
          : null}
        screenshotProgress={screenshotProgress}
        inlineError={inlineError}
        slashResult={slashResult}
        onResultClick={slashResult?.deskDir ? handleSlashResultClick : undefined}
      />
      <div className={styles['slash-menu-anchor']} ref={slashMenuRef}>
        {slashMenuOpen && filteredCommands.length > 0 && (
          <SlashCommandMenu commands={filteredCommands} selected={slashSelected} busy={slashBusy}
            onSelect={handleSlashSelect} onHover={(i: number) => setSlashSelected(i)} />
        )}
      </div>
      <div className={styles['slash-menu-anchor']} ref={fileMenuRef}>
        {fileMenuOpen && (fileMentionItems.length > 0 || fileMentionBusy) && (
          <FileMentionMenu
            items={fileMentionItems}
            selected={fileSelected}
            busy={fileMentionBusy}
            onSelect={handleFileMentionSelect}
            onHover={(i: number) => setFileSelected(i)}
          />
        )}
      </div>
      <div className={styles['input-stack']}>
        {visibleSessionConfirmation && (
          <SessionConfirmationPrompt
            block={visibleSessionConfirmation}
            exiting={sessionConfirmationExiting}
          />
        )}
        <div className={styles['input-wrapper']} ref={inputCardRef}>
          <input
            ref={browserFileInputRef}
            className={styles['browser-file-input']}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleBrowserFileInputChange}
          />
          <div
            onKeyDown={(event) => {
              if (!event.defaultPrevented) keyDownHandlerRef.current(event);
            }}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
          >
            <EditorContent editor={editor} />
          </div>
          <InputControlBar
            t={t}
            onAttach={handleAttach}
            slashBtnRef={slashBtnRef}
            onSlashToggle={handleSlashToggle}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            planModeLocked={false}
            showThinking={currentModelInfo?.reasoning !== false}
            thinkingLevel={thinkingLevel}
            onThinkingChange={setThinkingLevel}
            modelXhigh={(sessionModel ? (sessionModel.xhigh ?? models.find(m => m.id === sessionModel.id && m.provider === sessionModel.provider)?.xhigh) : globalModelInfo?.xhigh) ?? false}
            models={models}
            sessionModel={sessionModel}
            isStreaming={isStreaming}
            hasInput={!!inputText.trim()}
            canSend={canSend}
            onSend={handleSend}
            onSteer={handleSteer}
            onStop={handleStop}
            onVoiceRecognized={handleVoiceRecognized}
          />
        </div>
      </div>
    </div>
  );
}
