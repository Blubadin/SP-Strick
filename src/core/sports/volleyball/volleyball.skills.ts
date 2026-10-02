import type { SkillOption } from './volleyball.types';

/**
 * Deterministic volleyball skills array.
 * Positions around the wheel are stable to build scout muscle memory.
 * Maximum 8 options.
 */
export const VOLLEYBALL_SKILLS: SkillOption[] = [
  { id: 'attack', i18nKey: 'skill.attack', order: 0 },
  { id: 'block', i18nKey: 'skill.block', order: 1 },
  { id: 'set', i18nKey: 'skill.set', order: 2 },
  { id: 'receive', i18nKey: 'skill.receive', order: 3 },
  { id: 'serve', i18nKey: 'skill.serve', order: 4 },
  { id: 'dig', i18nKey: 'skill.dig', order: 5 },
  { id: 'free_ball', i18nKey: 'skill.freeball', order: 6 },
  { id: 'other', i18nKey: 'skill.other', order: 7 }
];
