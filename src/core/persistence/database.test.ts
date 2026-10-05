import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { db, migrateSessionForV3, SPStickDatabase } from './database';

describe('database schema v3 migration', () => {
  it('adds status and backfills legacy session fields without dropping data', () => {
    const migrated = migrateSessionForV3({
      id: 'legacy-session',
      name: 'Falcons vs Owls',
      sport: 'volleyball',
      matchId: 'legacy-match',
      createdAt: '2026-09-01T10:00:00.000Z',
      teamA: 'Falcons',
      teamB: 'Owls',
      currentSet: 2,
      scoreA: 18,
      scoreB: 17,
      active: true,
      oldMetadata: 'preserved'
    });

    expect(migrated).toMatchObject({
      id: 'legacy-session',
      updatedAt: '2026-09-01T10:00:00.000Z',
      teamAPlayers: [],
      teamBPlayers: [],
      scoutingProfileId: 'volleyball_basic',
      status: 'active',
      active: true,
      oldMetadata: 'preserved'
    });
  });

  it('preserves ended state and gives sessions a queryable updatedAt', () => {
    const migrated = migrateSessionForV3({
      id: 'ended-session',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-02T10:00:00.000Z',
      active: false,
      status: 'ended'
    });

    expect(migrated.status).toBe('ended');
    expect(migrated.active).toBe(false);
    expect(migrated.updatedAt).toBe('2026-08-02T10:00:00.000Z');
  });

  it('uses createdAt when a legacy updatedAt field is blank', () => {
    const migrated = migrateSessionForV3({
      id: 'blank-update-session',
      createdAt: '2026-08-03T10:00:00.000Z',
      updatedAt: '',
      active: true
    });

    expect(migrated.updatedAt).toBe('2026-08-03T10:00:00.000Z');
  });

  it('indexes sessions by the normalized status in schema v3', () => {
    expect(db.verno).toBe(4);
    const sessionSchema = db.tables.find((table) => table.name === 'sessions')?.schema;
    expect(sessionSchema?.indexes.map((index) => index.name)).toContain('status');
    expect(sessionSchema?.indexes.map((index) => index.name)).not.toContain('active');
  });
});

describe('database v4 migration', () => {
  it('adds rally/video storage while preserving legacy event snapshots and custom profiles', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(3).stores({ events: 'id, sessionId, matchId, timestamp, teamId, skill', sessions: 'id, createdAt, updatedAt, status', customProfiles: 'id, name, type', bookmarks: 'id, sessionId, timestamp', settings: 'key' });
    await old.table('events').add({ id: 'legacy', sessionId: 's', setNumber: 1, evaluation: 1, pointImpact: null, scoreBefore: { teamA: 18, teamB: 17 }, scoreAfter: { teamA: 18, teamB: 17 } });
    await old.table('sessions').add({ id: 's', currentSet: 1, scoreA: 18, scoreB: 17 });
    await old.table('customProfiles').add({ id: 'mine', name: 'My profile', type: 'custom' });
    old.close();
    const upgraded = new SPStickDatabase(name);
    try {
      await upgraded.open();
      expect(upgraded.verno).toBe(4);
      expect(await upgraded.events.get('legacy')).toMatchObject({ evaluation: 1, pointImpact: null, scoreBefore: { teamA: 18, teamB: 17 }, scoreAfter: { teamA: 18, teamB: 17 } });
      expect((await upgraded.events.get('legacy'))?.rallyId).toBeUndefined();
      expect(await upgraded.customProfiles.count()).toBe(1);
      expect(await upgraded.rallies.count()).toBe(0);
      expect(upgraded.videoSources.schema.indexes.map(index => index.name)).toContain('sessionId');
      expect(await upgraded.sessions.get('s')).toMatchObject({ scoreA: 18, scoreB: 17, scoreBaselines: { '1': { teamA: 18, teamB: 17 } } });
    } finally { await upgraded.delete(); }
  });
});
