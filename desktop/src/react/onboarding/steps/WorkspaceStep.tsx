/**
 * WorkspaceStep.tsx — Step 5: Default workspace selection
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Folder } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { DEFAULT_WORKSPACE_DIRNAME } from '../../../../../shared/default-workspace-constants.js';
import {
  loadDefaultWorkspace,
  saveWorkspace,
} from '../onboarding-actions';
import type { HanaFetch } from '../onboarding-actions';
import { StepContainer, Multiline } from '../onboarding-ui';

interface WorkspaceStepProps {
  preview: boolean;
  hanaFetch: HanaFetch;
  goToStep: (index: number) => void;
  showError: (msg: string) => void;
}

export function WorkspaceStep({ preview, hanaFetch, goToStep, showError }: WorkspaceStepProps) {
  const previewPath = useMemo(() => `~/Desktop/${DEFAULT_WORKSPACE_DIRNAME}`, []);
  const [defaultPath, setDefaultPath] = useState(preview ? previewPath : '');
  const [selectedPath, setSelectedPath] = useState('');
  const [saving, setSaving] = useState(false);

  const visiblePath = selectedPath || defaultPath || previewPath;
  const usingDefault = !selectedPath || selectedPath === defaultPath;

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    loadDefaultWorkspace(hanaFetch)
      .then(path => {
        if (cancelled) return;
        setDefaultPath(path);
      })
      .catch(err => {
        console.error('[onboarding] load default workspace failed:', err);
        showError(t('onboarding.error'));
      });
    return () => { cancelled = true; };
  }, [preview, hanaFetch, showError]);

  const onBrowse = useCallback(async () => {
    const folder = await window.platform?.selectFolder?.();
    if (folder) setSelectedPath(folder);
  }, []);

  const onUseDefault = useCallback(() => {
    setSelectedPath('');
  }, []);

  const onNext = useCallback(async () => {
    if (preview) { goToStep(6); return; }
    if (!defaultPath || !visiblePath) return;
    setSaving(true);
    try {
      await saveWorkspace({ hanaFetch, workspacePath: visiblePath, defaultPath });
      goToStep(6);
    } catch (err) {
      console.error('[onboarding] save workspace failed:', err);
      showError(t('onboarding.error'));
      setSaving(false);
    }
  }, [preview, goToStep, defaultPath, visiblePath, hanaFetch, showError]);

  return (
    <StepContainer>
      <h1 className="onboarding-title">{t('onboarding.workspace.title')}</h1>
      <Multiline className="onboarding-subtitle" text={t('onboarding.workspace.subtitle')} />

      <div className="ob-workspace-card">
        <div className="ob-workspace-icon">
          <PhosphorIcon icon={Folder} size={20} />
        </div>
        <div className="ob-workspace-copy">
          <div className="ob-workspace-label">
            {usingDefault ? t('onboarding.workspace.defaultLabel') : t('onboarding.workspace.customLabel')}
          </div>
          <div className="ob-workspace-path">{visiblePath}</div>
          <Multiline className="ob-workspace-hint" text={t('onboarding.workspace.defaultHint')} />
        </div>
      </div>

      <div className="ob-workspace-actions">
        <button className="ob-test-btn" onClick={onBrowse}>
          {t('onboarding.workspace.choose')}
        </button>
        {!usingDefault && (
          <button className="ob-test-btn" onClick={onUseDefault}>
            {t('onboarding.workspace.useDefault')}
          </button>
        )}
      </div>

      <div className="onboarding-actions">
        <button className="ob-btn ob-btn-secondary" onClick={() => goToStep(4)}>
          {t('onboarding.workspace.back')}
        </button>
        <button
          className="ob-btn ob-btn-primary"
          disabled={saving || (!preview && !defaultPath)}
          onClick={onNext}
        >
          {saving ? t('onboarding.workspace.saving') : t('onboarding.workspace.next')}
        </button>
      </div>
    </StepContainer>
  );
}
