import { describe, expect, it } from 'vitest';
import type { ScoutingEvent } from './ScoutingEvent';
import { recalculateScoreTimeline, recalculateScoreState } from './scoreTimeline';

function event(
  id: string,
  timestamp: number,
  setNumber: number,
  pointImpact: ScoutingEvent['pointImpact']
): ScoutingEvent {
  return {
    id,
    sport: 'volleyball',
    sessionId: 'session-1',
    matchId: 'match-1',
    timestamp,
    createdAt: new Date(timestamp).toISOString(),
    setNumber,
    teamId: 'A',
    skill: 'attack',
    evaluation: 1,
    pointImpact,
    scoreBefore: { teamA: 99, teamB: 99 },
    scoreAfter: { teamA: 99, teamB: 99 },
    inputSource: 'controller'
  };
}

describe('recalculateScoreTimeline', () => {
  it('rebuilds chronological score snapshots independently for each set', () => {
    const input = [
      event('set-2-b', 40, 2, 'TEAM_B'),
      event('set-1-b', 30, 1, 'TEAM_B'),
      event('set-1-a', 10, 1, 'TEAM_A'),
      event('set-1-none', 20, 1, null)
    ];

    const recalculated = recalculateScoreTimeline(input);

    expect(recalculated.map((item) => [item.id, item.scoreBefore, item.scoreAfter])).toEqual([
      ['set-1-a', { teamA: 0, teamB: 0 }, { teamA: 1, teamB: 0 }],
      ['set-1-none', { teamA: 1, teamB: 0 }, { teamA: 1, teamB: 0 }],
      ['set-1-b', { teamA: 1, teamB: 0 }, { teamA: 1, teamB: 1 }],
      ['set-2-b', { teamA: 0, teamB: 0 }, { teamA: 0, teamB: 1 }]
    ]);
  });

  it('does not mutate the input events', () => {
    const original = event('first', 10, 1, 'TEAM_A');
    const before = structuredClone(original);

    recalculateScoreTimeline([original]);

    expect(original).toEqual(before);
  });

  it('returns final scores with trailing manual corrections even when all events are removed', () => {
    const result = recalculateScoreState([], { '1': { teamA: 5, teamB: 3 } }, [
      { setNumber: 1, afterTimestamp: 10, teamA: 2, teamB: 4 }
    ]);
    expect(result.events).toEqual([]);
    expect(result.scoresBySet.get(1)).toEqual({ teamA: 7, teamB: 7 });
  });

  it('positions a manual correction after its anchor even when events share a timestamp', () => {
    const result = recalculateScoreState([event('first', 10, 1, 'TEAM_A'), event('second', 10, 1, 'TEAM_B')], {}, [
      { setNumber: 1, afterEventId: 'first', afterTimestamp: 10, teamA: 4, teamB: 2 }
    ]);
    expect(result.events[0].scoreAfter).toEqual({ teamA: 1, teamB: 0 });
    expect(result.events[1].scoreBefore).toEqual({ teamA: 5, teamB: 2 });
    expect(result.scoresBySet.get(1)).toEqual({ teamA: 5, teamB: 3 });
  });
});
