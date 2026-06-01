import React, { useMemo, useState } from 'react';
import type { SkillInfo } from '../../store';
import { SkillRow } from './SkillRow';
import styles from '../../Settings.module.css';
import { PhosphorIcon } from '../../../ui/PhosphorIcon';
import { PencilSimple, DownloadSimple, X, CaretDown, CaretRight } from '@phosphor-icons/react';

const t = (key: string, vars?: Record<string, string | number>): string => window.t?.(key, vars) ?? key;

export interface SkillBundleInfo {
  id: string;
  name: string;
  skillNames: string[];
  source?: string;
  agentId?: string | null;
  sourcePackage?: string | null;
  skills?: Array<{
    name: string;
    enabled: boolean;
    source: string | null;
    missing?: boolean;
  }>;
}

type TreeMode = 'manage' | 'agent';

interface SkillBundleTreeProps {
  mode: TreeMode;
  bundles: SkillBundleInfo[];
  skills: SkillInfo[];
  nameHints: Record<string, string>;
  emptyText: string;
  onDeleteSkill?: (name: string) => void;
  onToggleSkill?: (name: string, enabled: boolean) => void;
  onToggleBundle?: (bundle: SkillBundleInfo, enabled: boolean) => void;
  onCreateBundle?: () => void;
  onRenameBundle?: (bundle: SkillBundleInfo) => void;
  onExportBundle?: (bundle: SkillBundleInfo) => void;
  onDeleteBundle?: (bundle: SkillBundleInfo) => void;
  onReorderBundles?: (bundleIds: string[]) => void;
  onMoveSkillToBundle?: (skillName: string, bundle: SkillBundleInfo, index?: number) => void;
  onRemoveSkillFromBundles?: (skillName: string) => void;
}

function skillDragType() {
  return 'application/x-hana-skill-name';
}

function bundleDragType() {
  return 'application/x-hana-skill-bundle-id';
}

function startSkillDrag(event: React.DragEvent<HTMLDivElement>, skillName: string) {
  event.dataTransfer.setData(skillDragType(), skillName);
  event.dataTransfer.effectAllowed = 'move';
}

function startBundleDrag(event: React.DragEvent<HTMLDivElement>, bundleId: string) {
  event.dataTransfer.setData(bundleDragType(), bundleId);
  event.dataTransfer.effectAllowed = 'move';
}

function skillFromDrop(event: React.DragEvent) {
  return event.dataTransfer.getData(skillDragType()).trim();
}

function bundleFromDrop(event: React.DragEvent) {
  return event.dataTransfer.getData(bundleDragType()).trim();
}

function bundleEnabledState(bundle: SkillBundleInfo, skillByName: Map<string, SkillInfo>) {
  const skillNames = bundle.skillNames.filter(name => skillByName.has(name));
  if (skillNames.length === 0) return { all: false, partial: false, next: true };
  const enabled = skillNames.filter(name => skillByName.get(name)?.enabled).length;
  return {
    all: enabled === skillNames.length,
    partial: enabled > 0 && enabled < skillNames.length,
    next: enabled !== skillNames.length,
  };
}

export function SkillBundleTree({
  mode,
  bundles,
  skills,
  nameHints,
  emptyText,
  onDeleteSkill,
  onToggleSkill,
  onToggleBundle,
  onCreateBundle,
  onRenameBundle,
  onExportBundle,
  onDeleteBundle,
  onReorderBundles,
  onMoveSkillToBundle,
  onRemoveSkillFromBundles,
}: SkillBundleTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const skillByName = useMemo(() => new Map(skills.map(skill => [skill.name, skill])), [skills]);
  const bundledNames = useMemo(() => new Set(bundles.flatMap(bundle => bundle.skillNames)), [bundles]);
  const looseSkills = skills.filter(skill => !bundledNames.has(skill.name));
  const hasItems = bundles.length > 0 || looseSkills.length > 0;

  const canManage = mode === 'manage';

  const moveBundleBefore = (draggedId: string, targetId: string) => {
    if (!canManage || draggedId === targetId) return;
    const ids = bundles.map(bundle => bundle.id);
    const next = ids.filter(id => id !== draggedId);
    const targetIndex = next.indexOf(targetId);
    if (targetIndex === -1) return;
    next.splice(targetIndex, 0, draggedId);
    onReorderBundles?.(next);
  };

  const moveBundleToEnd = (draggedId: string) => {
    if (!canManage) return;
    const ids = bundles.map(bundle => bundle.id);
    if (ids[ids.length - 1] === draggedId) return;
    onReorderBundles?.([...ids.filter(id => id !== draggedId), draggedId]);
  };

  const dropOnBundle = (event: React.DragEvent, bundle: SkillBundleInfo, index?: number) => {
    if (!canManage) return;
    event.preventDefault();
    event.stopPropagation();
    const skillName = skillFromDrop(event);
    if (skillName) onMoveSkillToBundle?.(skillName, bundle, index);
  };

  const dropOnBundleHeader = (event: React.DragEvent, bundle: SkillBundleInfo) => {
    if (!canManage) return;
    event.preventDefault();
    const draggedBundleId = bundleFromDrop(event);
    if (draggedBundleId) {
      moveBundleBefore(draggedBundleId, bundle.id);
      return;
    }
    dropOnBundle(event, bundle);
  };

  const dropOnLoose = (event: React.DragEvent) => {
    if (!canManage) return;
    event.preventDefault();
    const draggedBundleId = bundleFromDrop(event);
    if (draggedBundleId) {
      moveBundleToEnd(draggedBundleId);
      return;
    }
    const skillName = skillFromDrop(event);
    if (skillName) onRemoveSkillFromBundles?.(skillName);
  };

  if (!hasItems) {
    return (
      <div className={styles['skill-bundle-tree']}>
        {canManage && onCreateBundle ? (
          <button
            className={styles['skill-bundle-create']}
            type="button"
            title={t('skillBundle.newSkillBundle')}
            aria-label={t('skillBundle.newSkillBundle')}
            onClick={onCreateBundle}
          >
            {t('skillBundle.newBundle')}
          </button>
        ) : null}
        <p className={styles['agent-skill-empty']} style={{ padding: 'var(--space-md)', margin: 0 }}>
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className={styles['skill-bundle-tree']}>
      {canManage && onCreateBundle ? (
        <div className={styles['skill-bundle-toolbar']}>
          <button
            className={styles['skill-bundle-create']}
            type="button"
            title={t('skillBundle.newSkillBundle')}
            aria-label={t('skillBundle.newSkillBundle')}
            onClick={onCreateBundle}
          >
            {t('skillBundle.newBundle')}
          </button>
        </div>
      ) : null}

      <div className={styles['skills-list-block']}>
        {bundles.map((bundle) => {
          const isExpanded = expanded[bundle.id] === true;
          const state = bundleEnabledState(bundle, skillByName);
          return (
            <div className={styles['skill-bundle-group']} key={bundle.id}>
              <div
                className={styles['skill-bundle-header']}
                data-testid={`skill-bundle-header-${bundle.id}`}
                draggable={canManage}
                onDragStart={(event) => startBundleDrag(event, bundle.id)}
                onDragOver={(event) => { if (canManage) event.preventDefault(); }}
                onDrop={(event) => dropOnBundleHeader(event, bundle)}
              >
                <button
                  className={styles['skill-bundle-caret']}
                  type="button"
                  aria-label={isExpanded ? t('skillBundle.collapse') : t('skillBundle.expand')}
                  title={isExpanded ? t('skillBundle.collapse') : t('skillBundle.expand')}
                  onClick={() => setExpanded(prev => ({ ...prev, [bundle.id]: !isExpanded }))}
                >
                  {isExpanded ? '⌄' : '›'}
                </button>
                <div className={styles['skill-bundle-title']}>
                  <span>{bundle.name}</span>
                  <small>{bundle.skillNames.length} skills</small>
                </div>
                <div className={styles['skill-bundle-actions']}>
                  {mode === 'agent' && onToggleBundle ? (
                    <button
                      data-testid={`skill-bundle-toggle-${bundle.id}`}
                      className={`hana-toggle mini${state.all ? ' on' : ''}${state.partial ? ' bundle-mixed' : ''}`}
                      type="button"
                      title={state.next ? t('skillBundle.enableAll') : t('skillBundle.disableAll')}
                      aria-label={state.next ? t('skillBundle.enable', { name: bundle.name }) : t('skillBundle.disable', { name: bundle.name })}
                      onClick={() => onToggleBundle(bundle, state.next)}
                    />
                  ) : null}
                  {canManage && onRenameBundle ? (
                    <button
                      className={styles['skill-bundle-icon-button']}
                      type="button"
                      title={t('skillBundle.renameBundle')}
                      aria-label={t('skillBundle.rename', { name: bundle.name })}
                      onClick={() => onRenameBundle(bundle)}
                    >
                      <PhosphorIcon icon={PencilSimple} size={13} />
                    </button>
                  ) : null}
                  {canManage && onExportBundle ? (
                    <button
                      className={styles['skill-bundle-icon-button']}
                      type="button"
                      title={t('skillBundle.exportBundle')}
                      aria-label={t('skillBundle.export', { name: bundle.name })}
                      onClick={() => onExportBundle(bundle)}
                    >
                      <PhosphorIcon icon={DownloadSimple} size={13} />
                    </button>
                  ) : null}
                  {canManage && onDeleteBundle ? (
                    <button
                      className={styles['skill-card-delete']}
                      type="button"
                      title={t('skillBundle.dissolveBundle')}
                      aria-label={t('skillBundle.dissolve', { name: bundle.name })}
                      onClick={() => onDeleteBundle(bundle)}
                    >
                      <PhosphorIcon icon={X} size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
              {isExpanded ? (
                <div className={styles['skill-bundle-children']}>
                  {bundle.skillNames.length === 0 ? (
                    <div className={styles['skill-bundle-empty']}>{t('skillBundle.emptyBundle')}</div>
                  ) : bundle.skillNames.map((skillName, index) => {
                    const skill = skillByName.get(skillName) || {
                      name: skillName,
                      description: t('skillBundle.missingSkill'),
                      enabled: false,
                      source: 'missing',
                    };
                    return (
                      <SkillRow
                        key={`${bundle.id}:${skillName}`}
                        skill={skill}
                        nameHint={nameHints[skillName]}
                        deletable={canManage}
                        draggable={canManage}
                        onDragStart={startSkillDrag}
                        onDelete={canManage ? onDeleteSkill : undefined}
                        onToggle={mode === 'agent' ? onToggleSkill : undefined}
                        onDragOver={(event) => { if (canManage) event.preventDefault(); }}
                        onDrop={(event) => dropOnBundle(event, bundle, index)}
                        className={styles['skill-bundle-child-row']}
                        extraActions={canManage ? (
                          <button
                            className={styles['skill-bundle-icon-button']}
                            type="button"
                            title={t('skillBundle.removeFromBundle')}
                            aria-label={t('skillBundle.removeSkill', { name: skillName })}
                            onClick={(event) => {
                              event.stopPropagation();
                              onRemoveSkillFromBundles?.(skillName);
                            }}
                          >
                            ↩
                          </button>
                        ) : null}
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <div
          className={styles['skill-bundle-loose-zone']}
          onDragOver={(event) => { if (canManage) event.preventDefault(); }}
          onDrop={dropOnLoose}
        >
          {looseSkills.map(skill => (
            <SkillRow
              key={skill.name}
              skill={skill}
              nameHint={nameHints[skill.name]}
              deletable={canManage}
              draggable={canManage}
              onDragStart={startSkillDrag}
              onDelete={canManage ? onDeleteSkill : undefined}
              onToggle={mode === 'agent' ? onToggleSkill : undefined}
            />
          ))}
          {looseSkills.length === 0 ? (
            <div className={styles['skill-bundle-empty']}>{t('skillBundle.noLooseSkills')}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
