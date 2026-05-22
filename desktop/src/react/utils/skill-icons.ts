/**
 * Developer-side icon registry for slash menu items.
 * Fallback: four-pointed star for all skills.
 */

import type { IconProps } from '@phosphor-icons/react';
import { StarFour } from '@phosphor-icons/react';
import type { ComponentType } from 'react';

export const SKILL_STAR_ICON: ComponentType<IconProps> = StarFour;

const overrides: Record<string, ComponentType<IconProps>> = {
  // Add per-skill icon overrides here:
  // 'diary': BookOpen,
};

export function getSkillIcon(name: string): ComponentType<IconProps> {
  return overrides[name] ?? SKILL_STAR_ICON;
}
