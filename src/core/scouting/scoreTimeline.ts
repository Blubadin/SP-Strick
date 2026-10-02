import type { ScoutingEvent } from './ScoutingEvent';

export interface Score {
  teamA: number;
  teamB: number;
}

/** Rebuilds score snapshots from recorded point impacts, starting each set at 0–0. */
export function recalculateScoreTimeline(events: ScoutingEvent[]): ScoutingEvent[] {
  const chronological = events
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort((a, b) => a.event.timestamp - b.event.timestamp || a.originalIndex - b.originalIndex);
  const scoresBySet = new Map<number, Score>();

  return chronological.map(({ event }) => {
    const scoreBefore = scoresBySet.get(event.setNumber) ?? { teamA: 0, teamB: 0 };
    const scoreAfter = { ...scoreBefore };

    if (event.pointImpact === 'TEAM_A') scoreAfter.teamA += 1;
    if (event.pointImpact === 'TEAM_B') scoreAfter.teamB += 1;

    scoresBySet.set(event.setNumber, scoreAfter);
    return { ...event, scoreBefore: { ...scoreBefore }, scoreAfter };
  });
}
