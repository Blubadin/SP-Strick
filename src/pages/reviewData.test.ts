import { describe, expect, it } from 'vitest';
import type { ScoutingEvent } from '../core/scouting/ScoutingEvent';
import type { Session } from '../core/persistence/database';
import { csvForEvents, resolvePlayer, sessionExportFilename } from './reviewData';

const session = {
  id: 's1', name: 'Test', sport: 'volleyball', matchId: 'm1', createdAt: '', updatedAt: '',
  teamA: 'ทีม A', teamB: 'Team, B', teamAPlayers: [{ id: 'p1', number: 7, name: 'Nok' }],
  teamBPlayers: [{ id: 'p2', number: 3, name: 'Bee' }], currentSet: 1, scoreA: 0, scoreB: 0,
  status: 'active' as const
} satisfies Session;

const event = {
  id: 'e1', sport: 'volleyball', sessionId: 's1', matchId: 'm1', timestamp: 0,
  createdAt: '', setNumber: 1, teamId: 'B', playerId: 'p2', skill: 'attack',
  subSkill: 'line, hard', originZone: 4, evaluation: 1, pointImpact: 'TEAM_B',
  scoreBefore: { teamA: 0, teamB: 0 }, scoreAfter: { teamA: 0, teamB: 1 }, inputSource: 'controller'
} satisfies ScoutingEvent;

describe('review export helpers', () => {
  it('resolves roster ids to jersey and name for the event team', () => {
    expect(resolvePlayer(session, event)).toEqual('#3 Bee');
    expect(resolvePlayer(session, { ...event, teamId: 'A', playerId: 'p2' })).toBe('—');
  });

  it('quotes CSV values containing commas, quotes, and newlines and includes a BOM', () => {
    const csv = csvForEvents([event], session);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"line, hard"');
    expect(csv).toContain('"Team, B"');
  });

  it('keeps Unicode team names in a safe filename', () => {
    expect(sessionExportFilename(session, 'csv', new Date('2026-01-02T00:00:00Z')))
      .toContain('ทีม-a-vs-team-b');
  });
});
