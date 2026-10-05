import type { ScoutingEvent } from './ScoutingEvent';

export interface Score {
  teamA: number;
  teamB: number;
}

export interface ScoreAdjustment extends Score {
  setNumber: number;
  afterTimestamp: number;
  afterEventId?: string;
}

/** Rebuild snapshots while keeping manual corrections at the point they were entered. */
export function recalculateScoreState(events: ScoutingEvent[], baselines: Record<string, Score> = {}, adjustments: ScoreAdjustment[] = []) {
  const chronological = events
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort((a, b) => a.event.timestamp - b.event.timestamp || a.originalIndex - b.originalIndex);
  const scoresBySet = new Map<number, Score>();
  const eventPositions = new Map(chronological.map(({ event }, index) => [event.id, { index, setNumber: event.setNumber }]));
  const pending = [...adjustments];
  const applyBefore = (setNumber: number, timestamp: number, position: number): Score => {
    const score = { ...(scoresBySet.get(setNumber) ?? baselines[setNumber] ?? { teamA: 0, teamB: 0 }) };
    for (let i = 0; i < pending.length;) {
      const adjustment = pending[i];
      const anchor = adjustment.afterEventId ? eventPositions.get(adjustment.afterEventId) : undefined;
      const isBefore = anchor?.setNumber === setNumber ? anchor.index < position : adjustment.afterTimestamp < timestamp;
      if (adjustment.setNumber === setNumber && isBefore) {
        score.teamA += adjustment.teamA;
        score.teamB += adjustment.teamB;
        pending.splice(i, 1);
      } else i++;
    }
    return score;
  };

  const rebuilt = chronological.map(({ event }, index) => {
    const scoreBefore = applyBefore(event.setNumber, event.timestamp, index);
    const scoreAfter = { ...scoreBefore };

    if (event.pointImpact === 'TEAM_A') scoreAfter.teamA += 1;
    if (event.pointImpact === 'TEAM_B') scoreAfter.teamB += 1;

    scoresBySet.set(event.setNumber, scoreAfter);
    return { ...event, scoreBefore: { ...scoreBefore }, scoreAfter };
  });
  const sets = new Set([...Object.keys(baselines).map(Number), ...events.map(e => e.setNumber), ...adjustments.map(a => a.setNumber)]);
  for (const setNumber of sets) scoresBySet.set(setNumber, applyBefore(setNumber, Infinity, Infinity));
  return { events: rebuilt, scoresBySet };
}

export function recalculateScoreTimeline(events: ScoutingEvent[], baselines: Record<string, Score> = {}, adjustments: ScoreAdjustment[] = []): ScoutingEvent[] {
  return recalculateScoreState(events, baselines, adjustments).events;
}
