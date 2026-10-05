import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../persistence/database';
import { useScoutStore } from './ScoutStore';
import * as scouting from './ScoutStore';
import type { ScoutingEvent } from './ScoutingEvent';

const store = () => useScoutStore.getState();
const action = (evaluation = 0, teamId = 'A', skill = 'receive') =>
  store().updateCurrentEvent({ teamId, skill, originZone: 4, evaluation });

describe('persisted rally action engine', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    scouting.setVideoTimingProvider(() => ({}));
    await db.delete();
    await db.open();
    await store().createSession('Falcons', 'Owls');
    useScoutStore.setState({ autoScoreEnabled: false });
  });
  afterAll(async () => { await db.delete(); });

  it('saves over 100 Pass actions in one unbounded open rally', async () => {
    for (let i = 0; i < 105; i++) await action();
    expect(await db.events.count()).toBe(105);
    expect(store().allEvents).toHaveLength(105);
    expect(store().rallies).toHaveLength(1);
    expect(store().rallies[0]).toMatchObject({ status: 'open', actionCount: 105 });
    expect(store().allEvents.map(event => event.actionIndex)).toEqual(Array.from({ length: 105 }, (_, i) => i + 1));
    expect(store().recentEvents).toHaveLength(6);
    expect(store().scoreA).toBe(0);
  });

  it('terminal results award the event team or opponent on every skill', async () => {
    await action(0, 'A');
    await action(1, 'B', 'set');
    await action(-1, 'B', 'receive');
    expect(store()).toMatchObject({ scoreA: 1, scoreB: 1, currentRallyId: null });
    expect(store().rallies.map(r => [r.status, r.winningTeam, r.actionCount])).toEqual([
      ['completed', 'B', 2], ['completed', 'A', 1]
    ]);
    expect(store().allEvents.map(e => e.rallyNumber)).toEqual([1, 1, 2]);
  });

  it('serializes rapid field and completed-action commands without duplicates or loss', async () => {
    await Promise.all([
      store().updateCurrentEvent({ evaluation: 0 }),
      store().updateCurrentEvent({ originZone: 2 }),
      store().updateCurrentEvent({ skill: 'serve' }),
      ...Array.from({ length: 20 }, () => action(0)),
      action(1, 'B')
    ]);
    expect(await db.events.count()).toBe(22);
    expect(store()).toMatchObject({ scoreA: 0, scoreB: 1 });
    expect(store().rallies[0]).toMatchObject({ actionCount: 22, status: 'completed' });
    await Promise.all([store().commitEvent(), store().commitEvent()]);
    expect(await db.events.count()).toBe(22);
  });

  it('retains team/player after save and clears the player on a team change', async () => {
    store().setSelectedPlayer('player-a');
    await action();
    expect(store().currentEvent).toMatchObject({ teamId: 'A', playerId: 'player-a' });
    expect(store().currentEvent.skill).toBeUndefined();
    store().setActiveTeam('A');
    expect(store().selectedPlayerId).toBe('player-a');
    store().setActiveTeam('B');
    expect(store().selectedPlayerId).toBeUndefined();
    expect(store().currentEvent.playerId).toBeUndefined();
    await action(1, 'B');
  });

  it('captures timing on first draft field and restores draft/open rally after reload', async () => {
    const provider = vi.fn().mockReturnValue({ videoTimeMs: 1200, videoSourceId: 'source-1' });
    scouting.setVideoTimingProvider(provider);
    await action();
    provider.mockReturnValue({ videoTimeMs: 3400, videoSourceId: 'source-2' });
    await store().updateCurrentEvent({ originZone: 3 });
    const sessionId = store().sessionId!;
    const rallyId = store().currentRallyId;
    provider.mockReturnValue({ videoTimeMs: 9900, videoSourceId: 'source-3' });
    db.close();
    await db.open();
    await store().loadSession(sessionId);
    expect(store().currentRallyId).toBe(rallyId);
    expect(store().currentEvent).toMatchObject({ originZone: 3, videoTimeMs: 3400, videoSourceId: 'source-2' });
    await store().updateCurrentEvent({ skill: 'block', evaluation: 1 });
    expect(store().allEvents.at(-1)).toMatchObject({ videoTimeMs: 3400, videoSourceId: 'source-2' });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('preserves failed action for explicit retry and rolls back all writes', async () => {
    await action();
    const failure = vi.spyOn(db.rallies, 'put').mockRejectedValueOnce(new Error('storage full'));
    await action(1, 'B');
    expect(store()).toMatchObject({ saveError: 'save-failed', scoreB: 0 });
    expect(store().currentEvent).toMatchObject({ evaluation: 1, teamId: 'B' });
    expect(await db.events.count()).toBe(1);
    expect((await db.rallies.toArray())[0]).toMatchObject({ status: 'open', actionCount: 1 });
    await action(-1, 'A');
    expect(store().currentEvent).toMatchObject({ evaluation: 1, teamId: 'B' });
    failure.mockRestore();
    await store().retrySave();
    expect(await db.events.count()).toBe(2);
    expect(store()).toMatchObject({ scoreB: 1, saveError: null });
    await store().retrySave();
    expect(await db.events.count()).toBe(2);
  });

  it('keeps a failed complete action pending across reload until explicit retry', async () => {
    const id = store().sessionId!;
    vi.spyOn(db.rallies, 'put').mockRejectedValueOnce(new Error('storage full'));
    await action(1, 'B');
    await store().loadSession(id);
    expect(store()).toMatchObject({ saveError: 'save-failed', status: 'ERROR' });
    await store().updateCurrentEvent({ evaluation: -1 });
    expect(store().currentEvent.evaluation).toBe(1);
    await store().retrySave();
    expect(store()).toMatchObject({ scoreB: 1, saveError: null });
    expect(await db.events.count()).toBe(1);
  });

  it('captures first input timing before queued persistence executes', async () => {
    const provider = vi.fn().mockReturnValue({ videoTimeMs: 1234 });
    scouting.setVideoTimingProvider(provider);
    const first = store().updateCurrentEvent({ skill: 'serve' });
    provider.mockReturnValue({ videoTimeMs: 5678 });
    await first;
    await store().updateCurrentEvent({ originZone: 1, evaluation: 0 });
    expect(store().allEvents[0].videoTimeMs).toBe(1234);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('starts new timing capture when clear and fresh input are queued together', async () => {
    const provider = vi.fn().mockReturnValue({ videoTimeMs: 100 });
    scouting.setVideoTimingProvider(provider);
    await store().updateCurrentEvent({ skill: 'attack' });
    provider.mockReturnValue({ videoTimeMs: 500 });
    await Promise.all([
      store().clearCurrentEvent(),
      store().updateCurrentEvent({ skill: 'receive', originZone: 1, evaluation: 0 })
    ]);
    expect(store().allEvents[0].videoTimeMs).toBe(500);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('retains an explicit draft team across field updates in any order', async () => {
    await store().updateCurrentEvent({ teamId: 'B' });
    await store().updateCurrentEvent({ evaluation: 1 });
    await store().updateCurrentEvent({ originZone: 6 });
    await store().updateCurrentEvent({ skill: 'dig' });
    expect(store().allEvents[0]).toMatchObject({ teamId: 'B', pointImpact: 'TEAM_B' });
    expect(store().scoreB).toBe(1);
  });

  it('attributes queued actions to the team/player selected when inputs were issued', async () => {
    store().setSelectedPlayer('player-a');
    const first = store().updateCurrentEvent({ skill: 'attack', originZone: 1, evaluation: 0 });
    store().setActiveTeam('B');
    store().setSelectedPlayer('player-b');
    const second = store().updateCurrentEvent({ skill: 'receive', originZone: 2, evaluation: 1 });
    await Promise.all([first, second]);
    expect(store().allEvents.map(e => [e.teamId, e.playerId])).toEqual([['A', 'player-a'], ['B', 'player-b']]);
    await store().loadSession(store().sessionId!);
    expect(store()).toMatchObject({ activeTeam: 'B', selectedPlayerId: 'player-b' });
  });

  it('keeps manual corrections at their original position when rebuilding score snapshots', async () => {
    await action(1);
    await store().setScore(10, 8);
    await action(1, 'B');
    await store().editEvent(store().allEvents[1].id, { evaluation: 0 });
    expect(store().allEvents[0]).toMatchObject({ scoreBefore: { teamA: 0, teamB: 0 }, scoreAfter: { teamA: 1, teamB: 0 } });
    expect(store().allEvents[1]).toMatchObject({ scoreBefore: { teamA: 10, teamB: 8 }, scoreAfter: { teamA: 10, teamB: 8 } });
    expect(store()).toMatchObject({ scoreA: 10, scoreB: 8 });
    await store().deleteEvent(store().allEvents[0].id);
    expect(store()).toMatchObject({ scoreA: 9, scoreB: 8 });
  });

  it('undo reopens terminal rally and edit terminal to Pass merges following actions', async () => {
    await action();
    await action(1);
    await store().undoLastEvent();
    expect(store().rallies[0]).toMatchObject({ status: 'open', actionCount: 1 });
    expect(store().scoreA).toBe(0);
    await action(1);
    const terminalId = store().allEvents.at(-1)!.id;
    await action(0, 'B');
    await action(1, 'B');
    await store().editEvent(terminalId, { evaluation: 0 });
    expect(store().rallies).toHaveLength(1);
    expect(store().rallies[0]).toMatchObject({ actionCount: 4, winningTeam: 'B' });
    expect(store()).toMatchObject({ scoreA: 0, scoreB: 1 });
    await store().editEvent(store().allEvents[0].id, { evaluation: -1, teamId: 'B' });
    expect(store().rallies.map(r => r.actionCount)).toEqual([1, 3]);
    expect(store()).toMatchObject({ scoreA: 1, scoreB: 1 });
    await store().deleteEvent(store().allEvents[0].id);
    expect(store().rallies).toHaveLength(1);
    expect(store()).toMatchObject({ scoreA: 0, scoreB: 1 });
  });

  it('manual score corrections survive edit/delete and last-action undo', async () => {
    await store().setScore(12, 9);
    await action(1);
    await action(1, 'B');
    await store().setScore(20, 15);
    await store().editEvent(store().allEvents[0].id, { evaluation: 0 });
    expect(store()).toMatchObject({ scoreA: 19, scoreB: 15 });
    await store().deleteEvent(store().allEvents[1].id);
    expect(store()).toMatchObject({ scoreA: 19, scoreB: 14 });
    await store().undoLastEvent();
    expect(store()).toMatchObject({ scoreA: 19, scoreB: 14 });
  });

  it('endSet/endMatch preserve incomplete rallies without awarding points', async () => {
    await action();
    await store().endSet();
    expect(store().rallies[0]).toMatchObject({ status: 'incomplete', actionCount: 1 });
    expect(store()).toMatchObject({ currentSet: 2, scoreA: 0, scoreB: 0, currentRallyId: null });
    await action();
    const id = store().sessionId!;
    await store().endMatch();
    expect((await db.rallies.where('sessionId').equals(id).toArray()).map(r => r.status)).toEqual(['incomplete', 'incomplete']);
    expect(await db.sessions.get(id)).toMatchObject({ scoreA: 0, scoreB: 0, status: 'ended' });
  });

  it('clear discards only unsaved draft and preserves saved Pass actions', async () => {
    await action();
    await store().updateCurrentEvent({ skill: 'attack' });
    await store().clearCurrentEvent();
    await store().loadSession(store().sessionId!);
    expect(store().currentEvent.skill).toBeUndefined();
    expect(store().allEvents).toHaveLength(1);
    expect(store().rallies[0].status).toBe('open');
  });

  it('preserves legacy score gap and never infers legacy evaluation as a point', async () => {
    const sessionId = store().sessionId!;
    const legacy: ScoutingEvent = {
      id: 'legacy', sport: 'volleyball', sessionId, matchId: sessionId, timestamp: 1,
      createdAt: new Date(1).toISOString(), setNumber: 1, teamId: 'A', skill: 'attack',
      evaluation: 1, pointImpact: null, scoreBefore: { teamA: 18, teamB: 17 },
      scoreAfter: { teamA: 18, teamB: 17 }, inputSource: 'manual'
    };
    await db.events.add(legacy);
    await db.sessions.update(sessionId, { scoreA: 18, scoreB: 17, scoreBaselines: undefined });
    await store().loadSession(sessionId);
    expect(store().allEvents[0]).toEqual(legacy);
    await action(1, 'B');
    await store().undoLastEvent();
    expect(store()).toMatchObject({ scoreA: 18, scoreB: 17 });
    expect((await db.events.get('legacy'))?.pointImpact).toBeNull();
  });
});
