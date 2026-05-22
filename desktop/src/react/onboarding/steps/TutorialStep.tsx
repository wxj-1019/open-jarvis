/**
 * TutorialStep.tsx — Step 5: Feature tutorial + finish
 */

import { useState, useCallback } from 'react';
import { Brain, Lightning, Folder, Note, Users } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { StepContainer, Multiline } from '../onboarding-ui';

// ── Tutorial card sub-component ──

function TutorialCard({ icon, title, desc }: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="tutorial-card">
      <div className="tutorial-card-header">
        <span className="tutorial-card-icon">{icon}</span>
        <span className="tutorial-card-title">{title}</span>
      </div>
      <Multiline className="tutorial-card-desc" text={desc} />
    </div>
  );
}

// ── Main component ──

interface TutorialStepProps {
  preview: boolean;
  showError: (msg: string) => void;
}

export function TutorialStep({ preview, showError }: TutorialStepProps) {
  const [finishing, setFinishing] = useState(false);

  const onFinish = useCallback(async () => {
    if (preview) { window.close(); return; }
    setFinishing(true);
    try {
      await window.hana.onboardingComplete?.();
    } catch (err) {
      console.error('[onboarding] complete failed:', err);
      showError(t('onboarding.error'));
      setFinishing(false);
    }
  }, [preview, showError]);

  return (
    <StepContainer>
      <h1 className="onboarding-title">{t('onboarding.tutorial.title')}</h1>

      <div className="tutorial-cards">
        <TutorialCard
          icon={<PhosphorIcon icon={Brain} size={20} />}
          title={t('onboarding.tutorial.memory.title')}
          desc={t('onboarding.tutorial.memory.desc')}
        />
        <TutorialCard
          icon={<PhosphorIcon icon={Lightning} size={20} />}
          title={t('onboarding.tutorial.skills.title')}
          desc={t('onboarding.tutorial.skills.desc')}
        />
        <TutorialCard
          icon={<PhosphorIcon icon={Folder} size={20} />}
          title={t('onboarding.tutorial.workspace.title')}
          desc={t('onboarding.tutorial.workspace.desc')}
        />
        <TutorialCard
          icon={<PhosphorIcon icon={Note} size={20} />}
          title={t('onboarding.tutorial.jian.title')}
          desc={t('onboarding.tutorial.jian.desc')}
        />
        <TutorialCard
          icon={<PhosphorIcon icon={Users} size={20} />}
          title={t('onboarding.tutorial.agents.title')}
          desc={t('onboarding.tutorial.agents.desc')}
        />
      </div>

      <button className="ob-finish-btn" disabled={finishing} onClick={onFinish}>
        {t('onboarding.tutorial.finish')}
      </button>
    </StepContainer>
  );
}
