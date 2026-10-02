import Dexie, { type Table } from 'dexie';
import type { ScoutingEvent } from '../scouting/ScoutingEvent';
import type { ControllerProfile } from '../controller/ControllerTypes';

export interface Player {
  id: string;
  number: number;
  name?: string;
  position?: string;
}

export interface Session {
  id: string;
  name: string;
  sport: string;
  matchId: string;
  createdAt: string;
  updatedAt: string;
  teamA: string;
  teamB: string;
  teamAPlayers?: Player[];
  teamBPlayers?: Player[];
  currentSet: number;
  scoreA: number;
  scoreB: number;
  scoutingProfileId?: string;
  status: 'active' | 'ended';
  /** Kept in sync for compatibility with clients that still query the v2 field. */
  active?: boolean;
}

type LegacySessionRecord = Record<string, unknown>;

/** Normalize old session rows while retaining all fields from the stored record. */
export function migrateSessionForV3(session: LegacySessionRecord): LegacySessionRecord & {
  updatedAt: string;
  teamAPlayers: Player[];
  teamBPlayers: Player[];
  scoutingProfileId: string;
  status: 'active' | 'ended';
  active: boolean;
} {
  const status =
    session.status === 'active' || session.status === 'ended'
      ? session.status
      : session.active === false || session.active === 0
        ? 'ended'
        : 'active';
  const createdAt = typeof session.createdAt === 'string' && session.createdAt ? session.createdAt : undefined;
  const updatedAt =
    typeof session.updatedAt === 'string' && session.updatedAt ? session.updatedAt : createdAt;

  return {
    ...session,
    updatedAt: updatedAt || new Date(0).toISOString(),
    teamAPlayers: Array.isArray(session.teamAPlayers) ? (session.teamAPlayers as Player[]) : [],
    teamBPlayers: Array.isArray(session.teamBPlayers) ? (session.teamBPlayers as Player[]) : [],
    scoutingProfileId:
      typeof session.scoutingProfileId === 'string' && session.scoutingProfileId
        ? session.scoutingProfileId
        : 'volleyball_basic',
    status,
    active: status === 'active'
  };
}

export interface SessionBookmark {
  id: string;
  sessionId: string;
  timestamp: number;
  label?: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
}

export class SPStickDatabase extends Dexie {
  events!: Table<ScoutingEvent, string>;
  sessions!: Table<Session, string>;
  customProfiles!: Table<ControllerProfile, string>;
  bookmarks!: Table<SessionBookmark, string>;
  settings!: Table<AppSetting, string>;

  constructor() {
    super('SPStickDatabase');

    // Schema Version 1 (preserves backward compatibility)
    this.version(1).stores({
      events: 'id, sessionId, matchId, timestamp, teamId, skill',
      sessions: 'id, createdAt'
    });

    // Schema Version 2: Extended for full offline match management and profiles
    this.version(2).stores({
      events: 'id, sessionId, matchId, timestamp, teamId, skill',
      sessions: 'id, createdAt, updatedAt, active',
      customProfiles: 'id, name, type',
      bookmarks: 'id, sessionId, timestamp',
      settings: 'key'
    });

    // Schema Version 3: normalized session status and safe legacy defaults.
    this.version(3)
      .stores({
        events: 'id, sessionId, matchId, timestamp, teamId, skill',
        sessions: 'id, createdAt, updatedAt, status',
        customProfiles: 'id, name, type',
        bookmarks: 'id, sessionId, timestamp',
        settings: 'key'
      })
      .upgrade((transaction) =>
        transaction.table('sessions').toCollection().modify((session) => {
          Object.assign(session, migrateSessionForV3(session as LegacySessionRecord));
        })
      );
  }
}

export const db = new SPStickDatabase();
