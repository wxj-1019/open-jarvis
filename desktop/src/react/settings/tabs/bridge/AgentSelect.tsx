import React, { useRef } from 'react';
import { useSettingsStore } from '../../store';
import { hanaUrl, yuanFallbackAvatar } from '../../api';
import { SelectWidget, type SelectOption } from '@/ui';
import styles from '../../Settings.module.css';
import { PhosphorIcon } from '../../../ui/PhosphorIcon';
import { Check } from '@phosphor-icons/react';

interface AgentSelectProps {
  value: string | null;
  onChange: (agentId: string) => void;
}

export function AgentSelect({ value, onChange }: AgentSelectProps) {
  const agents = useSettingsStore((s) => s.agents);

  const options: SelectOption[] = agents.map((a) => ({
    value: a.id,
    label: a.name,
  }));

  const tsRef = useRef(Date.now());
  const ts = tsRef.current;

  const renderTrigger = (option: SelectOption | undefined, isOpen: boolean) => {
    const agent = agents.find((a) => a.id === option?.value);
    return (
      <>
        <img
          className={styles['bridge-agent-avatar']}
          src={agent?.hasAvatar ? hanaUrl(`/api/agents/${agent.id}/avatar?t=${ts}`) : yuanFallbackAvatar(agent?.yuan || 'hanako')}
          onError={(e) => { (e.target as HTMLImageElement).src = yuanFallbackAvatar(agent?.yuan || 'hanako'); }}
        />
        <span className={styles['bridge-agent-name']}>{agent?.name || '—'}</span>
        <span className={`${styles['bridge-agent-arrow']}${isOpen ? ` ${styles['open']}` : ''}`}>▾</span>
      </>
    );
  };

  const renderOption = (option: SelectOption, isSelected: boolean) => {
    const agent = agents.find((a) => a.id === option.value);
    /* 直接返回内容，不包内层 div，让 SelectWidget 的 option 作为唯一容器，
     * selected 高亮自然贴到 popup 边，padding 只算一次 */
    return (
      <>
        <img
          className={styles['bridge-agent-avatar']}
          src={agent?.hasAvatar ? hanaUrl(`/api/agents/${agent.id}/avatar?t=${ts}`) : yuanFallbackAvatar(agent?.yuan || 'hanako')}
          onError={(e) => { (e.target as HTMLImageElement).src = yuanFallbackAvatar(agent?.yuan || 'hanako'); }}
        />
        <span className={styles['bridge-agent-name']}>{option.label}</span>
        {isSelected && (
          <PhosphorIcon icon={Check} className={styles['bridge-agent-check']} />
        )}
      </>
    );
  };

  return (
    <div className={styles['bridge-agent-select']}>
      <SelectWidget
        options={options}
        value={value || ''}
        onChange={onChange}
        placeholder="Select Agent"
        renderTrigger={renderTrigger}
        renderOption={renderOption}
      />
    </div>
  );
}
