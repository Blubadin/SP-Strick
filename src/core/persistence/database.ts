import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { ScoutingEvent } from '../scouting/ScoutingEvent';

export interface Session {
  id: string;
  name: string;
  sport: string;
  matchId: string;
  createdAt: string;
  updatedAt: string;
  teamA: string;
  teamB: string;
  currentSet: number;
  scoreA: number;
  scoreB: number;
}

export class SPStickDatabase extends Dexie {
  events!: Table<ScoutingEvent, string>;
  sessions!: Table<Session, string>;

  constructor() {
    super('SPStickDatabase');
    this.version(1).stores({
      events: 'id, sessionId, matchId, timestamp, teamId, skill',
      sessions: 'id, createdAt'
    });
  }
}

export const db = new SPStickDatabase();
