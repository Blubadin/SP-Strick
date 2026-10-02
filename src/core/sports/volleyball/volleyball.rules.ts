import type { VolleyballEvaluation, ResultOption } from './volleyball.types';

export const VOLLEYBALL_RESULTS: ResultOption[] = [
  { id: 'positive', value: 1, label: '+1' },
  { id: 'neutral', value: 0, label: '0' },
  { id: 'negative', value: -1, label: '-1' }
];

export interface ScoringPolicyConfig {
  autoScoreOnTerminalSkills: boolean; // e.g. service ace, attack kill, or error
}

/**
 * Decouples skill quality evaluation from rally point impact.
 * An evaluation of +1 or -1 does NOT automatically alter the scoreboard unless
 * specifically defined by a terminal action or explicit score toggle.
 */
export function calculatePointImpact(
  skill: string,
  evaluation: VolleyballEvaluation,
  activeTeam: string,
  autoScore: boolean = false
): 'TEAM_A' | 'TEAM_B' | null {
  if (!autoScore) {
    return null;
  }

  // Optional auto-scoring policy for terminal outcomes:
  // e.g. Kill or Ace (+1 on attack/serve) awards point to active team.
  // Error (-1 on any skill) awards point to opposing team.
  if (evaluation === 1 && (skill === 'attack' || skill === 'serve' || skill === 'block')) {
    return activeTeam === 'A' ? 'TEAM_A' : 'TEAM_B';
  }

  if (evaluation === -1) {
    return activeTeam === 'A' ? 'TEAM_B' : 'TEAM_A';
  }

  return null;
}
