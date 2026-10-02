import { describe, expect, it } from 'vitest';
import { db, migrateSessionForV3 } from './database';

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
    expect(db.verno).toBe(3);
    const sessionSchema = db.tables.find((table) => table.name === 'sessions')?.schema;
    expect(sessionSchema?.indexes.map((index) => index.name)).toContain('status');
    expect(sessionSchema?.indexes.map((index) => index.name)).not.toContain('active');
  });
});
