import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoutingEvent } from './ScoutingEvent';

const memory = vi.hoisted(() => ({
  events: [] as ScoutingEvent[],
  sessions: [] as Array<Record<string, unknown>>,
  bookmarks: [] as Array<Record<string, unknown>>
}));

vi.mock('../persistence/database', () => {
  const sortedQuery = <T extends Record<string, unknown>>(
    rows: T[],
    matches: (row: T) => boolean
  ) => {
    let direction = 1;
    return {
      reverse() {
        direction = -1;
        return this;
      },
      async sortBy(key: string) {
        return rows.filter(matches).sort((a, b) => {
          const left = a[key];
          const right = b[key];
          const order = typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left ?? '').localeCompare(String(right ?? ''));
          return order * direction;
        });
      }
    };
  };

  const sessionEvents = (sessionId: string) => {
    return sortedQuery(
      memory.events as unknown as Array<Record<string, unknown>>,
      (event) => event.sessionId === sessionId
    );
  };

  const events = {
    async get(id: string) {
      return memory.events.find((event) => event.id === id);
    },
    async put(event: ScoutingEvent) {
      const index = memory.events.findIndex((item) => item.id === event.id);
      if (index < 0) memory.events.push(event);
      else memory.events[index] = event;
    },
    async bulkPut(items: ScoutingEvent[]) {
      for (const item of items) {
        const index = memory.events.findIndex((event) => event.id === item.id);
        if (index < 0) memory.events.push(item);
        else memory.events[index] = item;
      }
    },
    async delete(id: string) {
      memory.events = memory.events.filter((event) => event.id !== id);
    },
    where(index: string) {
      return {
        equals(value: string) {
          if (index !== 'sessionId') throw new Error(`Unsupported index: ${index}`);
          return sessionEvents(value);
        }
      };
    }
  };

  const sessions = {
    async add(session: Record<string, unknown>) {
      memory.sessions.push(session);
    },
    async get(id: string) {
      return memory.sessions.find((item) => item.id === id);
    },
    async update(id: string, changes: Record<string, unknown>) {
      const session = memory.sessions.find((item) => item.id === id);
      if (session) Object.assign(session, changes);
      return session ? 1 : 0;
    },
    where(index: string) {
      return {
        equals(value: unknown) {
          return sortedQuery(memory.sessions, (session) => session[index] === value);
        }
      };
    },
    orderBy(index: string) {
      return {
        reverse() {
          return {
            async first() {
              return [...memory.sessions].sort((a, b) =>
                String(b[index] ?? '').localeCompare(String(a[index] ?? ''))
              )[0];
            }
          };
        }
      };
    }
  };

  const bookmarks = {
    where(index: string) {
      return {
        equals(value: unknown) {
          return sortedQuery(memory.bookmarks, (bookmark) => bookmark[index] === value);
        }
      };
    }
  };

  return {
    db: {
      events,
      sessions,
      bookmarks,
      async transaction<T>(_mode: string, _tables: unknown[], callback: () => Promise<T>) {
        return callback();
      }
    }
  };
});

import { useScoutStore } from './ScoutStore';

function event(
  id: string,
  timestamp: number,
  pointImpact: ScoutingEvent['pointImpact'],
  scoreA: number,
  scoreB: number
): ScoutingEvent {
  return {
    id,
    sport: 'volleyball',
    sessionId: 'session-1',
    matchId: 'match-1',
    timestamp,
    createdAt: new Date(timestamp).toISOString(),
    setNumber: 1,
    teamId: 'A',
    skill: 'attack',
    evaluation: 1,
    pointImpact,
    scoreBefore: { teamA: scoreA, teamB: scoreB },
    scoreAfter: {
      teamA: scoreA + (pointImpact === 'TEAM_A' ? 1 : 0),
      teamB: scoreB + (pointImpact === 'TEAM_B' ? 1 : 0)
    },
    inputSource: 'controller'
  };
}

describe('ScoutStore persisted scoring operations', () => {
  beforeEach(() => {
    memory.events = [];
    memory.sessions = [{
      id: 'session-1',
      currentSet: 1,
      scoreA: 0,
      scoreB: 0,
      updatedAt: ''
    }];
    memory.bookmarks = [];
    useScoutStore.setState({
      sessionId: 'session-1',
      currentSet: 1,
      scoreA: 0,
      scoreB: 0,
      activeTeam: 'A',
      recentEvents: [],
      currentEvent: { teamId: 'A' }
    });
  });

  it('recalculates later snapshots and the stored current score after editing impact', async () => {
    memory.events = [event('first', 10, null, 0, 0), event('second', 20, 'TEAM_B', 0, 0)];
    memory.sessions[0].scoreA = 0;
    memory.sessions[0].scoreB = 1;

    await useScoutStore.getState().editEvent('first', { pointImpact: 'TEAM_A' });

    expect(memory.events.map((item) => [item.scoreBefore, item.scoreAfter])).toEqual([
      [{ teamA: 0, teamB: 0 }, { teamA: 1, teamB: 0 }],
      [{ teamA: 1, teamB: 0 }, { teamA: 1, teamB: 1 }]
    ]);
    expect(memory.sessions[0]).toMatchObject({ scoreA: 1, scoreB: 1 });
    expect(useScoutStore.getState()).toMatchObject({ scoreA: 1, scoreB: 1 });
  });

  it('recalculates later snapshots and the stored current score after deleting a scoring event', async () => {
    memory.events = [event('first', 10, 'TEAM_A', 0, 0), event('second', 20, 'TEAM_B', 1, 0)];
    memory.sessions[0].scoreA = 1;
    memory.sessions[0].scoreB = 1;

    await useScoutStore.getState().deleteEvent('first');

    expect(memory.events).toHaveLength(1);
    expect(memory.events[0]).toMatchObject({
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 0, teamB: 1 }
    });
    expect(memory.sessions[0]).toMatchObject({ scoreA: 0, scoreB: 1 });
    expect(useScoutStore.getState()).toMatchObject({ scoreA: 0, scoreB: 1 });
  });

  it('continues undoing older events after the six-item recent cache is exhausted', async () => {
    memory.events = Array.from({ length: 7 }, (_, index) =>
      event(`event-${index + 1}`, (index + 1) * 10, 'TEAM_A', index, 0)
    );
    memory.sessions[0].scoreA = 7;
    useScoutStore.setState({ scoreA: 7, recentEvents: memory.events.slice(-6).reverse() });

    for (let index = 0; index < 7; index += 1) {
      await useScoutStore.getState().undoLastEvent();
    }

    expect(memory.events).toHaveLength(0);
    expect(memory.sessions[0]).toMatchObject({ scoreA: 0, scoreB: 0 });
    expect(useScoutStore.getState()).toMatchObject({ scoreA: 0, scoreB: 0, recentEvents: [] });
  });

  it('creates sessions with indexed status and the legacy active compatibility flag', async () => {
    const sessionId = await useScoutStore.getState().createSession('Falcons', 'Owls');

    expect(memory.sessions.find((session) => session.id === sessionId)).toMatchObject({
      status: 'active',
      active: true
    });
  });

  it('ends sessions by updating indexed status and the legacy active flag', async () => {
    await useScoutStore.getState().endMatch();

    expect(memory.sessions[0]).toMatchObject({ status: 'ended', active: false });
    expect(useScoutStore.getState()).toMatchObject({ sessionId: null, matchId: null, sessionName: '' });
  });

  it('restores the latest session selected through indexed status', async () => {
    memory.sessions = [
      {
        id: 'older-active', name: 'A vs B', matchId: 'older-active', teamA: 'A', teamB: 'B',
        currentSet: 1, scoreA: 0, scoreB: 0, active: true, status: 'active',
        updatedAt: '2026-09-01T10:00:00.000Z'
      },
      {
        id: 'latest-active', name: 'C vs D', matchId: 'latest-active', teamA: 'C', teamB: 'D',
        currentSet: 2, scoreA: 10, scoreB: 9, active: true, status: 'active',
        updatedAt: '2026-09-02T10:00:00.000Z'
      },
      {
        id: 'newer-ended', name: 'E vs F', matchId: 'newer-ended', teamA: 'E', teamB: 'F',
        currentSet: 3, scoreA: 0, scoreB: 0, active: false, status: 'ended',
        updatedAt: '2026-09-03T10:00:00.000Z'
      }
    ];

    expect(await useScoutStore.getState().restoreActiveSession()).toBe(true);
    expect(useScoutStore.getState()).toMatchObject({
      sessionId: 'latest-active',
      currentSet: 2,
      scoreA: 10,
      scoreB: 9
    });
  });
});
