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
  active: boolean; // true if match is in progress
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
  }
}

export const db = new SPStickDatabase();
