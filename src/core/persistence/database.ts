import Dexie, { type Table } from 'dexie';
import type { ScoutingEvent } from '../scouting/ScoutingEvent';
import type { ControllerProfile } from '../controller/ControllerTypes';
import type { Rally } from '../scouting/Rally';
import type { Score, ScoreAdjustment } from '../scouting/scoreTimeline';

export interface VideoSource {
  id: string;
  sessionId: string;
  kind: 'youtube' | 'local';
  name: string;
  url?: string;
  videoId?: string;
  fileName?: string;
  fileSize?: number;
  lastModified?: number;
  fileHandle?: unknown;
  createdAt: string;
  lastPositionMs?: number;
}

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
  /** Manual/unrecorded points, independent of editable action contributions. */
  scoreBaselines?: Record<string, Score>;
  scoreAdjustments?: ScoreAdjustment[];
  scoutingDraft?: Partial<ScoutingEvent>;
  scoutingTeam?: 'A' | 'B';
  scoutingPlayerId?: string;
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
  rallies!: Table<Rally, string>;
  videoSources!: Table<VideoSource, string>;

  constructor(name = 'SPStickDatabase') {
    super(name);

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

    this.version(4).stores({
      events: 'id, sessionId, matchId, timestamp, teamId, skill, rallyId, videoSourceId',
      sessions: 'id, createdAt, updatedAt, status',
      customProfiles: 'id, name, type',
      bookmarks: 'id, sessionId, timestamp',
      settings: 'key',
      rallies: 'id, sessionId, [sessionId+setNumber], status',
      videoSources: 'id, sessionId'
    }).upgrade(async transaction => {
      // Legacy rows stay untouched. Their evaluation was quality, not a rally result.
      const events = await transaction.table('events').toArray() as ScoutingEvent[];
      await transaction.table('sessions').toCollection().modify((session: Session) => {
        if (session.scoreBaselines) return;
        const baselines: Record<string, Score> = {};
        for (const event of events.filter(e => e.sessionId === session.id).sort((a, b) => a.timestamp - b.timestamp)) {
          baselines[event.setNumber] ??= { ...(event.scoreBefore ?? { teamA: 0, teamB: 0 }) };
        }
        const current = events.filter(e => e.sessionId === session.id && e.setNumber === (session.currentSet || 1));
        baselines[session.currentSet || 1] = {
          teamA: (session.scoreA || 0) - current.filter(e => e.pointImpact === 'TEAM_A').length,
          teamB: (session.scoreB || 0) - current.filter(e => e.pointImpact === 'TEAM_B').length
        };
        session.scoreBaselines = baselines;
      });
    });
  }
}

export const db = new SPStickDatabase();
