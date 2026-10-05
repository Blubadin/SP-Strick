import type { VolleyballEvaluation, ResultOption } from './volleyball.types';

export const VOLLEYBALL_RESULTS: ResultOption[] = [
  { id: 'positive', value: 1, label: '+1' },
  { id: 'neutral', value: 0, label: 'Pass' },
  { id: 'negative', value: -1, label: '-1' }
];

export interface ScoringPolicyConfig {
  autoScoreOnTerminalSkills: boolean;
}

/** Every terminal action ends its rally; Pass leaves the rally open. */
export function calculatePointImpact(
  _skill: string,
  evaluation: VolleyballEvaluation,
  team: string,
  _autoScore: boolean = false
): 'TEAM_A' | 'TEAM_B' | null {
  if (evaluation === 1) return team === 'A' ? 'TEAM_A' : 'TEAM_B';
  if (evaluation === -1) return team === 'A' ? 'TEAM_B' : 'TEAM_A';
  return null;
}
