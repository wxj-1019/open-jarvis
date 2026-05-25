import { useState, useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { useStore } from '../stores';
import { useI18n } from './use-i18n';
import { isImageFile, isVideoFile } from '../utils/format';
import { fetchConfig } from './use-config';
import { ensureSession, loadSessions } from '../stores/session-actions';
import { getWebSocket } from '../services/websocket';
import { collectUiContext } from '../utils/ui-context';
import { formatQuotedSelectionForPrompt } from '../utils/quoted-selection';
import type { ThinkingLevel } from '../stores/model-slice';
import { serializeEditor } from '../utils/editor-serializer';
import { notifyPasteUploadFailure } from '../utils/paste-upload-feedback';
import { extractPlainUrlPaste } from '../utils/plain-url-paste';
import {
  evaluateChatImageSendPreflight,
  evaluateChatVideoSendPreflight,
  notifyTextModelImageBlocked,
  notifyTextModelVideoBlocked,
} from '../utils/chat-image-send-preflight';
import { openProviderModelSettings } from '../utils/model-settings-navigation';
import {
  resolveSlashSubmitSelection,
  type SlashItem,
} from '../components/input/slash-commands';
import { hanaFetch } from './use-hana-fetch';
import { mergeEditorFileRefs } from '../utils/file-mention-items';
import { chatImageMimeTypeForName, chatVideoMimeTypeForName } from '../utils/input-helpers';
import { editorHasInlineNode } from '../utils/input-helpers';
import type { PermissionMode } from '../components/input/PlanModeButton';
import type { TodoItem } from '../types';
import type { FileRef } from '../types/file-ref';

// ── Standalone sendAsUser (reads Zustand directly, no React deps needed) ──
export async function sendAsUser(text: string, displayText?: string): Promise<boolean> {
  const ws = getWebSocket();
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const _s = useStore.getState();
  if (_s.streamingSessions.includes(_s.currentSessionPath || '')) return false;
  if (_s.pendingSessionSwitchPath) return false;

  if (_s.pendingNewSession) {
    const ok = await ensureSession();
    if (!ok) return false;
    loadSessions();
  }

  ws.send(JSON.stringify({
    type: 'prompt',
    text,
    sessionPath: useStore.getState().currentSessionPath,
    uiContext: collectUiContext(useStore.getState()),
    displayMessage: { text: displayText ?? text },
  }));
  return true;
}

export interface UseMessageSendInput {
  editor: Editor | null;
  attachedFiles: FileRef[];
  docContextAttached: boolean;
  currentDoc: { path: string; name: string } | null;
  surface: 'desktop' | 'mobile';
  currentSessionPath: string | null;
  currentModelInfo: import('../stores').StoreState['models'][number] | undefined;
  supportsVision: boolean;
  isStreaming: boolean;
  connected: boolean;
  modelSwitching: boolean;
  sessionTodos: TodoItem[];
  slashCommands: SlashItem[];
  slashSelected: number;
  handleSlashSelect: (item: SlashItem) => void;
  slashDismissedTextRef: MutableRefObject<string | null>;
  setPermissionMode: (mode: PermissionMode) => void;
}

export function useMessageSend({
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
}: UseMessageSendInput) {
  const { t } = useI18n();

  const setDocContextAttached = useStore(s => s.setDocContextAttached);
  const clearAttachedFiles = useStore(s => s.clearAttachedFiles);
  const clearDraft = useStore(s => s.clearDraft);
  const addAttachedFile = useStore(s => s.addAttachedFile);
  const setThinkingLevel = useStore(s => s.setThinkingLevel);
  const addToast = useStore(s => s.addToast);

  const quotedSelection = useStore(s => s.quotedSelection);
  const pendingNewSession = useStore(s => s.pendingNewSession);
  const pendingSessionSwitchPath = useStore(s => s.pendingSessionSwitchPath);

  const [sending, setSending] = useState(false);
  const [completingTodos, setCompletingTodos] = useState(false);
  const pasteHandlerRef = useRef<(event: ClipboardEvent) => boolean>(() => false);

  // Can send?
  const inputText = editor?.getText() ?? '';
  const hasContent = inputText.trim().length > 0 || attachedFiles.length > 0 || docContextAttached || !!quotedSelection
    || editorHasInlineNode(editor, 'skillBadge')
    || editorHasInlineNode(editor, 'fileBadge');
  const canSend = hasContent && connected && !isStreaming && !modelSwitching && !pendingSessionSwitchPath;

  const loadVisionAuxiliaryConfig = useCallback(async () => {
    const res = await hanaFetch('/api/preferences/models');
    const data = await res.json();
    return {
      enabled: data?.models?.vision_enabled === true,
      model: data?.models?.vision || null,
    };
  }, []);

  // ── Paste image ──
  const handlePaste = useCallback((e: ClipboardEvent): boolean => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (!item.type.startsWith('image/')) continue;
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return true;
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (!match) return;
          const [, mimeType, base64Data] = match;
          const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'png');
          const name = `${t('input.pastedImage')}.${ext}`;
          try {
            const res = await hanaFetch('/api/upload-blob', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                base64Data,
                mimeType,
                ...(useStore.getState().currentSessionPath ? { sessionPath: useStore.getState().currentSessionPath } : {}),
              }),
            });
            const data = await res.json();
            const upload = data?.uploads?.[0];
            if (upload?.dest) {
              addAttachedFile({ fileId: upload.fileId, path: upload.dest, name: upload.name || name, isDirectory: false });
            } else {
              notifyPasteUploadFailure(t, upload?.error);
              console.warn('[paste] upload-blob failed', upload?.error || data);
            }
          } catch (err) {
            notifyPasteUploadFailure(t, err);
            console.warn('[paste] upload-blob error', err);
          }
        };
        reader.readAsDataURL(file);
        return true;
      }
    }

    const plainUrlPaste = extractPlainUrlPaste(e.clipboardData);
    if (plainUrlPaste && editor && !editor.isDestroyed) {
      e.preventDefault();
      try {
        editor.commands.insertContent(plainUrlPaste);
      } catch {
        // Editor may be destroyed during command execution
      }
      return true;
    }
    return false;
  }, [addAttachedFile, editor, t]);

  pasteHandlerRef.current = handlePaste;

  // ── Load thinking level once server port is ready + listen for plan mode sync ──
  const activeServerConnection = useStore(s => s.activeServerConnection);
  useEffect(() => {
    if (activeServerConnection && surface !== 'mobile') {
      fetchConfig()
        .then(d => { if (d.thinking_level) setThinkingLevel(d.thinking_level as ThinkingLevel); })
        .catch((err: unknown) => console.warn('[InputArea] load config failed', err));
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setPermissionMode((detail.mode || (detail.enabled ? 'read_only' : 'operate')) as PermissionMode);
    };
    window.addEventListener('hana-plan-mode', handler);
    return () => window.removeEventListener('hana-plan-mode', handler);
  }, [activeServerConnection, setThinkingLevel, setPermissionMode, surface]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    if (!editor || editor.isDestroyed) return;
    const editorJson = editor.getJSON();
    const { text: rawText, skills, fileRefs } = serializeEditor(editorJson);
    const text = rawText.trim();

    // Defensive: editor may be destroyed during async operations
    const isEditorValid = () => editor && !editor.isDestroyed;

    const slashSelection = resolveSlashSubmitSelection({
      text,
      skills,
      commands: slashCommands,
      selectedIndex: slashSelected,
      dismissedText: slashDismissedTextRef.current,
    });
    if (slashSelection) {
      handleSlashSelect(slashSelection);
      return;
    }

    const inputFiles = mergeEditorFileRefs(attachedFiles, fileRefs);
    const hasFiles = inputFiles.length > 0;
    if ((!text && !hasFiles && !docContextAttached && !useStore.getState().quotedSelection) || !connected) return;
    if (isStreaming) return;
    if (sending) return;
    if (modelSwitching) return;
    if (useStore.getState().pendingSessionSwitchPath) return;
    setSending(true);

    try {
      if (pendingNewSession) {
        const ok = await ensureSession();
        if (!ok) return;
        loadSessions();
        // Re-check editor after async operation
        if (!isEditorValid()) return;
      }

      // Separate native media from regular attachments; backend decides image vision bridge, video native capability, or explicit error.
      const imageFiles = hasFiles ? inputFiles.filter(f => !f.isDirectory && isImageFile(f.name)) : [];
      const videoFiles = hasFiles ? inputFiles.filter(f => !f.isDirectory && isVideoFile(f.name)) : [];
      const otherFiles = hasFiles ? inputFiles.filter(f => f.isDirectory || (!isImageFile(f.name) && !isVideoFile(f.name))) : [];

      const imagePreflight = await evaluateChatImageSendPreflight({
        attachments: inputFiles,
        model: currentModelInfo,
        loadVisionAuxiliaryConfig,
      });
      if (!imagePreflight.ok) {
        notifyTextModelImageBlocked({
          t,
          addToast: useStore.getState().addToast,
          openSettings: () => openProviderModelSettings(currentModelInfo?.provider),
        });
        return;
      }
      const videoPreflight = await evaluateChatVideoSendPreflight({
        attachments: inputFiles,
        model: currentModelInfo,
      });
      if (!videoPreflight.ok) {
        notifyTextModelVideoBlocked({
          t,
          addToast: useStore.getState().addToast,
          openSettings: () => openProviderModelSettings(currentModelInfo?.provider),
        });
        return;
      }

      let finalText = text;
      if (otherFiles.length > 0) {
        const fileBlock = otherFiles.map(f => f.isDirectory ? `[目录] ${f.path}` : `[附件] ${f.path}`).join('\n');
        finalText = text ? `${text}\n\n${fileBlock}` : fileBlock;
      }

      // Images / videos read base64. Unified through platform layer.
      const platform = window.platform;
      const images: Array<{ type: 'image'; data: string; mimeType: string }> = [];
      const videos: Array<{ type: 'video'; data: string; mimeType: string }> = [];
      const imageBase64Map = new Map<string, { base64Data: string; mimeType: string }>();
      const videoBase64Map = new Map<string, { base64Data: string; mimeType: string }>();
      for (const img of imageFiles) {
        try {
          if (img.base64Data && img.mimeType) {
            images.push({ type: 'image', data: img.base64Data, mimeType: img.mimeType });
          } else {
            const base64 = await platform?.readFileBase64?.(img.path);
            if (base64) {
              const mimeType = chatImageMimeTypeForName(img.name, img.mimeType);
              imageBase64Map.set(img.path, { base64Data: base64, mimeType });
              images.push({ type: 'image', data: base64, mimeType });
            } else {
              throw new Error(`failed to read image attachment: ${img.path}`);
            }
          }
        } catch (err) {
          console.warn('[input] failed to read image attachment', err);
          useStore.getState().addToast(t('input.imageReadFailed'), 'error', 6000, {
            dedupeKey: `image-read-failed:${img.path}`,
          });
          return;
        }
      }
      for (const video of videoFiles) {
        try {
          if (video.base64Data && video.mimeType) {
            const mimeType = chatVideoMimeTypeForName(video.name, video.mimeType);
            videos.push({ type: 'video', data: video.base64Data, mimeType });
          } else {
            const base64 = await platform?.readFileBase64?.(video.path);
            if (base64) {
              const mimeType = chatVideoMimeTypeForName(video.name, video.mimeType);
              videoBase64Map.set(video.path, { base64Data: base64, mimeType });
              videos.push({ type: 'video', data: base64, mimeType });
            } else {
              throw new Error(`failed to read video attachment: ${video.path}`);
            }
          }
        } catch (err) {
          console.warn('[input] failed to read video attachment', err);
          useStore.getState().addToast(t('input.videoReadFailed'), 'error', 6000, {
            dedupeKey: `video-read-failed:${video.path}`,
          });
          return;
        }
      }

      // Document context
      let docForRender: { path: string; name: string } | null = null;
      if (docContextAttached && currentDoc) {
        finalText = finalText ? `${finalText}\n\n[参考文档] ${currentDoc.path}` : `[参考文档] ${currentDoc.path}`;
        docForRender = currentDoc;
      }
      if (docContextAttached) setDocContextAttached(false);

      // Quoted selection
      const qs = useStore.getState().quotedSelection;
      if (qs) {
        const quoteStr = formatQuotedSelectionForPrompt(qs);
        finalText = finalText ? `${finalText}\n\n${quoteStr}` : quoteStr;
      }

      const allFiles = [...(hasFiles ? inputFiles : [])];
      if (docForRender) allFiles.push({ path: docForRender.path, name: docForRender.name });

      if (isEditorValid()) {
        editor.commands.clearContent();
      }
      if (currentSessionPath) clearDraft(currentSessionPath);
      clearAttachedFiles();
      const qs2 = useStore.getState().quotedSelection;
      if (qs2) useStore.getState().clearQuotedSelection();

      const ws = getWebSocket();
      const wsMsg: Record<string, unknown> = {
        type: 'prompt',
        text: finalText,
        sessionPath: useStore.getState().currentSessionPath,
        uiContext: collectUiContext(useStore.getState()),
        displayMessage: {
          text,
          skills: skills.length > 0 ? skills : undefined,
          quotedText: qs?.text,
          attachments: allFiles.length > 0 ? allFiles.map(f => {
            const cached = imageBase64Map.get(f.path);
            const cachedVideo = videoBase64Map.get(f.path);
            const imageFile = !f.isDirectory && isImageFile(f.name);
            return {
              fileId: f.fileId,
              path: f.path,
              name: f.name,
              isDir: !!f.isDirectory,
              mimeType: f.mimeType || cached?.mimeType || cachedVideo?.mimeType || undefined,
              visionAuxiliary: imageFile && !supportsVision,
            };
          }) : undefined,
        },
      };
      if (images.length > 0) wsMsg.images = images;
      if (videos.length > 0) wsMsg.videos = videos;
      if (skills.length > 0) wsMsg.skills = skills;
      ws?.send(JSON.stringify(wsMsg));
    } finally {
      setSending(false);
    }
  }, [editor, attachedFiles, docContextAttached, connected, isStreaming, sending, pendingNewSession, currentDoc, clearAttachedFiles, clearDraft, currentSessionPath, setDocContextAttached, slashCommands, slashSelected, handleSlashSelect, supportsVision, currentModelInfo, loadVisionAuxiliaryConfig, modelSwitching, t, slashDismissedTextRef]);

  // ── Steer ──
  const handleSteer = useCallback(async () => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text || !isStreaming) return;
    const ws = getWebSocket();
    if (!ws) return;
    const sessionPath = useStore.getState().currentSessionPath;
    if (sessionPath) {
      const { renderMarkdown } = await import('../utils/markdown');
      useStore.getState().appendItem(sessionPath, {
        type: 'message',
        data: { id: `user-${Date.now()}`, role: 'user', text, textHtml: renderMarkdown(text), timestamp: Date.now() },
      });
    }
    editor?.commands?.clearContent();
    const sp = useStore.getState().currentSessionPath;
    if (sp) clearDraft(sp);
    ws.send(JSON.stringify({ type: 'steer', text, sessionPath: sp }));
  }, [editor, isStreaming, clearDraft]);

  // ── Stop ──
  const handleStop = useCallback(() => {
    const ws = getWebSocket();
    if (!isStreaming || !ws) return;
    ws.send(JSON.stringify({ type: 'abort', sessionPath: useStore.getState().currentSessionPath }));
  }, [isStreaming]);

  // ── Complete todos ──
  const handleCompleteTodos = useCallback(async () => {
    const path = currentSessionPath;
    if (!path || completingTodos || sessionTodos.length === 0) return;
    setCompletingTodos(true);
    try {
      await hanaFetch('/api/sessions/todos/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      useStore.getState().setSessionTodosForPath(path, []);
      useStore.getState().bumpTodosLiveVersion(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error', 6000);
    } finally {
      setCompletingTodos(false);
    }
  }, [addToast, completingTodos, currentSessionPath, sessionTodos.length]);

  return {
    sending,
    canSend,
    sendAsUser,
    handleSend,
    handleSteer,
    handleStop,
    handlePaste,
    pasteHandlerRef,
    handleCompleteTodos,
    completingTodos,
  };
}
