import { describe, expect, it } from 'vitest';
import type { ScoutingEvent } from '../core/scouting/ScoutingEvent';
import type { Session } from '../core/persistence/database';
import { csvForEvents, formatVideoTime, resolvePlayer, resultLabel, sessionExportFilename } from './reviewData';

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

  it('exports rally order and video timing and labels a zero evaluation as Pass', () => {
    const rallyEvent = {
      ...event,
      evaluation: 0,
      pointImpact: null,
      rallyId: 'rally-2',
      rallyNumber: 2,
      actionIndex: 4,
      videoSourceId: 'youtube-match-1',
      videoTimeMs: 87_500
    } satisfies ScoutingEvent;
    const csv = csvForEvents([rallyEvent], session);
    const [header, row] = csv.replace(/^\uFEFF/, '').split('\r\n');

    expect(header).toContain('rallyNumber');
    expect(header).toContain('actionIndex');
    expect(header).toContain('videoSourceId');
    expect(header).toContain('videoTimeMs');
    expect(row).toContain('rally-2');
    expect(row).toContain('youtube-match-1');
    expect(row).toContain('87500');
    expect(resultLabel(0)).toBe('Pass');
    expect(formatVideoTime(87_500)).toBe('1:27.5');
  });

  it('keeps Unicode team names in a safe filename', () => {
    expect(sessionExportFilename(session, 'csv', new Date('2026-01-02T00:00:00Z')))
      .toContain('ทีม-a-vs-team-b');
  });
});
