import { useRef, useCallback, type ChangeEvent } from 'react';
import { useStore } from '../stores';
import { useI18n } from './use-i18n';
import { MAX_ATTACHMENTS } from '../constants';
import { chatImageMimeTypeForName, readFileAsBase64 } from '../utils/input-helpers';
import { attachFilesFromPaths } from '../MainContent';
import { hanaFetch } from './use-hana-fetch';

export interface UseFileAttachmentInput {
  surface: 'desktop' | 'mobile';
}

export function useFileAttachment({ surface }: UseFileAttachmentInput) {
  const { t } = useI18n();
  const addAttachedFile = useStore(s => s.addAttachedFile);

  const browserFileInputRef = useRef<HTMLInputElement>(null);

  const handleBrowserFileInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (files.length === 0) return;
    if (useStore.getState().attachedFiles.length >= MAX_ATTACHMENTS) return;

    for (const file of files) {
      if (useStore.getState().attachedFiles.length >= MAX_ATTACHMENTS) break;
      const mimeType = file.type || chatImageMimeTypeForName(file.name);
      try {
        const base64Data = await readFileAsBase64(file);
        const res = await hanaFetch('/api/upload-blob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            base64Data,
            mimeType,
            ...(useStore.getState().currentSessionPath ? { sessionPath: useStore.getState().currentSessionPath } : {}),
          }),
        });
        const data = await res.json();
        const upload = data?.uploads?.[0];
        if (upload?.dest) {
          addAttachedFile({
            fileId: upload.fileId,
            path: upload.dest,
            name: upload.name || file.name,
            isDirectory: false,
            base64Data,
            mimeType,
          });
        } else {
          useStore.getState().addToast(t('error.uploadFailed'), 'error');
          console.warn('[upload] browser file upload failed', upload?.error || data);
        }
      } catch (err) {
        console.warn('[upload] browser file upload error', err);
        useStore.getState().addToast(t('error.uploadFailed'), 'error');
      }
    }
  }, [addAttachedFile, t]);

  const handleAttach = useCallback(async () => {
    if (surface === 'mobile') {
      browserFileInputRef.current?.click();
      return;
    }
    if (typeof window.platform?.selectFiles === 'function') {
      const paths = await window.platform.selectFiles();
      if (paths && paths.length > 0) await attachFilesFromPaths(paths);
      return;
    }
    browserFileInputRef.current?.click();
  }, [surface]);

  return {
    browserFileInputRef,
    handleBrowserFileInputChange,
    handleAttach,
  };
}
