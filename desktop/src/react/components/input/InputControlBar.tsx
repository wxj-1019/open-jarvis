import { memo, type RefObject } from 'react';
import { Plus, StarFour } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { PlanModeButton, type PermissionMode } from './PlanModeButton';
import { ContextRing } from './ContextRing';
import { ThinkingLevelButton } from './ThinkingLevelButton';
import { ModelSelector } from './ModelSelector';
import { SendButton } from './SendButton';
import type { ThinkingLevel } from '../../stores/model-slice';
import type { Model } from '../../types';
import type { SessionModel } from '../../stores/chat-types';
import styles from './InputArea.module.css';

interface Props {
  t: (key: string) => string;
  // 左侧工具按钮
  onAttach: () => void;
  slashBtnRef: RefObject<HTMLButtonElement | null>;
  onSlashToggle: () => void;
  permissionMode: PermissionMode;
  onPermissionModeChange: (v: PermissionMode) => void;
  planModeLocked: boolean;
  // 右侧控制
  showThinking: boolean;
  thinkingLevel: ThinkingLevel;
  onThinkingChange: (level: ThinkingLevel) => void;
  modelXhigh: boolean;
  models: Model[];
  sessionModel?: SessionModel;
  isStreaming: boolean;
  hasInput: boolean;
  canSend: boolean;
  onSend: () => void;
  onSteer: () => void;
  onStop: () => void;
}

/** 编辑器下方的工具按钮行 + 发送控制 */
export const InputControlBar = memo(function InputControlBar(props: Props) {
  const {
    t, onAttach, slashBtnRef, onSlashToggle,
    permissionMode, onPermissionModeChange, planModeLocked,
    showThinking, thinkingLevel, onThinkingChange, modelXhigh,
    models, sessionModel, isStreaming, hasInput, canSend, onSend, onSteer, onStop,
  } = props;

  return (
    <div className={styles['input-bottom-bar']}>
      <div className={styles['input-actions']}>
        <button
          className={styles['attach-btn']}
          title={t('input.attachFiles')}
          onClick={onAttach}
        >
          <PhosphorIcon icon={Plus} size={14} />
        </button>
        <button
          ref={slashBtnRef}
          className={styles['attach-btn']}
          title={t('input.commandMenu')}
          onClick={onSlashToggle}
        >
          <PhosphorIcon icon={StarFour} size={16} />
        </button>
        <PlanModeButton mode={permissionMode} onChange={onPermissionModeChange} locked={planModeLocked} />
        <ContextRing />
      </div>
      <div className={styles['input-controls']}>
        {showThinking && (
          <ThinkingLevelButton level={thinkingLevel} onChange={onThinkingChange} modelXhigh={modelXhigh} />
        )}
        <ModelSelector models={models} sessionModel={sessionModel} isStreaming={isStreaming} />
        <SendButton isStreaming={isStreaming} hasInput={hasInput}
          disabled={isStreaming ? false : !canSend} onSend={onSend} onSteer={onSteer} onStop={onStop} />
      </div>
    </div>
  );
});
