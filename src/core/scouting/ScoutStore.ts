import { create } from 'zustand';
import type { ScoutingEvent } from './ScoutingEvent';
import { db, type Session, type SessionBookmark, type Player } from '../persistence/database';
import { EventValidator } from './EventValidator';
import { hapticManager } from '../controller/HapticManager';
import { calculatePointImpact } from '../sports/volleyball/volleyball.rules';

export type ScoutState =
  | 'IDLE'
  | 'BUILDING_EVENT'
  | 'SELECTING_RADIAL'
  | 'VALIDATING'
  | 'COMMITTING'
  | 'SAVED'
  | 'PAUSED'
  | 'ERROR';

interface ScoutStateStore {
  status: ScoutState;
  sessionId: string | null;
  matchId: string | null;
  sessionName: string;
  currentSet: number;
  scoreA: number;
  scoreB: number;
  teamA: string;
  teamB: string;
  teamAPlayers: Player[];
  teamBPlayers: Player[];
  activeTeam: 'A' | 'B';
  selectedPlayerId?: string;

  // Active Event Builder Draft
  currentEvent: Partial<ScoutingEvent>;
  recentEvents: ScoutingEvent[];
  bookmarks: SessionBookmark[];

  // Settings / UX
  autoScoreEnabled: boolean;
  lastFeedback: string | null;
  saveError: string | null;

  // Actions
  setStatus: (status: ScoutState) => void;
  setActiveTeam: (team: 'A' | 'B') => void;
  setSelectedPlayer: (playerId?: string) => void;
  updateCurrentEvent: (update: Partial<ScoutingEvent>) => Promise<void>;
  commitEvent: () => Promise<void>;
  undoLastEvent: () => Promise<void>;
  editEvent: (eventId: string, changes: Partial<ScoutingEvent>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<boolean>;
  restoreActiveSession: () => Promise<boolean>;
  createSession: (
    teamA: string,
    teamB: string,
    teamAPlayers?: Player[],
    teamBPlayers?: Player[]
  ) => Promise<string>;
  endSet: () => Promise<void>;
  endMatch: () => Promise<void>;
  addBookmark: (label?: string) => Promise<void>;
  setScore: (scoreA: number, scoreB: number) => Promise<void>;
}

export const useScoutStore = create<ScoutStateStore>((set, get) => ({
  status: 'IDLE',
  sessionId: null,
  matchId: null,
  sessionName: '',
  currentSet: 1,
  scoreA: 0,
  scoreB: 0,
  teamA: 'Team A',
  teamB: 'Team B',
  teamAPlayers: [],
  teamBPlayers: [],
  activeTeam: 'A',
  selectedPlayerId: undefined,

  currentEvent: {},
  recentEvents: [],
  bookmarks: [],

  autoScoreEnabled: false,
  lastFeedback: null,
  saveError: null,

  setStatus: (status) => set({ status }),

  setActiveTeam: (team) =>
    set((s) => ({
      activeTeam: team,
      // Retain sticky team in draft
      currentEvent: { ...s.currentEvent, teamId: team }
    })),

  setSelectedPlayer: (playerId) =>
    set((s) => ({
      selectedPlayerId: playerId,
      currentEvent: { ...s.currentEvent, playerId }
    })),

  /**
   * Order-independent field updater.
   * Auto-commits whenever all required fields are complete!
   */
  updateCurrentEvent: async (update) => {
    const s = get();
    const updatedDraft: Partial<ScoutingEvent> = {
      ...s.currentEvent,
      teamId: s.currentEvent.teamId || s.activeTeam,
      ...update
    };

    set({
      currentEvent: updatedDraft,
      status: 'BUILDING_EVENT'
    });

    // Check completeness
    const validation = EventValidator.validate(updatedDraft, [
      'teamId',
      'skill',
      'originZone',
      'evaluation'
    ]);

    if (validation.isValid) {
      await get().commitEvent();
    }
  },

  /**
   * Commits the completed event atomically into IndexedDB.
   */
  commitEvent: async () => {
    const state = get();
    if (!state.sessionId) return;

    set({ status: 'COMMITTING' });

    const draft = state.currentEvent;
    const validation = EventValidator.validate(draft, [
      'teamId',
      'skill',
      'originZone',
      'evaluation'
    ]);

    if (!validation.isValid) {
      set({ status: 'BUILDING_EVENT' });
      return;
    }

    // Decoupled point impact calculation
    const pointImpact =
      draft.pointImpact !== undefined
        ? draft.pointImpact
        : calculatePointImpact(
            draft.skill as string,
            draft.evaluation as any,
            state.activeTeam,
            state.autoScoreEnabled
          );

    let newScoreA = state.scoreA;
    let newScoreB = state.scoreB;

    if (pointImpact === 'TEAM_A') newScoreA++;
    if (pointImpact === 'TEAM_B') newScoreB++;

    const now = Date.now();
    const fullEvent: ScoutingEvent = {
      id: crypto.randomUUID(),
      sport: 'volleyball',
      sessionId: state.sessionId,
      matchId: state.matchId || state.sessionId,
      timestamp: now,
      createdAt: new Date(now).toISOString(),
      setNumber: state.currentSet,
      teamId: draft.teamId || state.activeTeam,
      playerId: draft.playerId || state.selectedPlayerId,
      skill: draft.skill as string,
      subSkill: draft.subSkill,
      originZone: draft.originZone,
      targetZone: draft.targetZone,
      evaluation: draft.evaluation,
      pointImpact,
      scoreBefore: { teamA: state.scoreA, teamB: state.scoreB },
      scoreAfter: { teamA: newScoreA, teamB: newScoreB },
      inputSource: 'controller'
    };

    try {
      // Atomic transaction: write event + update session score
      await db.transaction('rw', [db.events, db.sessions], async () => {
        await db.events.add(fullEvent);
        if (state.sessionId) {
          await db.sessions.update(state.sessionId, {
            scoreA: newScoreA,
            scoreB: newScoreB,
            updatedAt: new Date().toISOString()
          });
        }
      });

      // Provide haptic feedback if supported
      hapticManager.success(null);

      set({
        currentEvent: { teamId: state.activeTeam }, // clear buffer, preserve sticky team
        status: 'SAVED',
        lastFeedback: `✓ ${state.activeTeam} / ${fullEvent.skill.toUpperCase()} / Z${fullEvent.originZone} / ${fullEvent.evaluation && fullEvent.evaluation > 0 ? '+1' : fullEvent.evaluation}`,
        saveError: null,
        recentEvents: [fullEvent, ...state.recentEvents].slice(0, 6),
        scoreA: newScoreA,
        scoreB: newScoreB
      });

      // Quick return to IDLE without blocking subsequent inputs
      setTimeout(() => {
        if (get().status === 'SAVED') {
          set({ status: 'IDLE', lastFeedback: null });
        }
      }, 850);
    } catch (err: unknown) {
      console.error('Failed to commit event:', err);
      set({
        status: 'ERROR',
        saveError: 'Database save failed. Please retry.'
      });
      hapticManager.warning(null);
    }
  },

  /**
   * Undo latest event atomically.
   */
  undoLastEvent: async () => {
    const state = get();
    if (!state.sessionId || state.recentEvents.length === 0) return;

    const lastEvent = state.recentEvents[0];

    try {
      const restoredScoreA = lastEvent.scoreBefore?.teamA ?? state.scoreA;
      const restoredScoreB = lastEvent.scoreBefore?.teamB ?? state.scoreB;

      await db.transaction('rw', [db.events, db.sessions], async () => {
        await db.events.delete(lastEvent.id);
        if (state.sessionId) {
          await db.sessions.update(state.sessionId, {
            scoreA: restoredScoreA,
            scoreB: restoredScoreB,
            updatedAt: new Date().toISOString()
          });
        }
      });

      set({
        recentEvents: state.recentEvents.slice(1),
        scoreA: restoredScoreA,
        scoreB: restoredScoreB,
        currentEvent: { teamId: state.activeTeam },
        lastFeedback: '↶ Last event removed',
        status: 'IDLE'
      });

      setTimeout(() => {
        if (get().lastFeedback === '↶ Last event removed') {
          set({ lastFeedback: null });
        }
      }, 1200);
    } catch (err) {
      console.error('Failed to undo event:', err);
    }
  },

  editEvent: async (eventId, changes) => {
    const event = await db.events.get(eventId);
    if (!event) return;

    const updated = { ...event, ...changes };
    await db.events.put(updated);

    // Refresh recent events if applicable
    const s = get();
    if (s.sessionId) {
      const recent = await db.events
        .where('sessionId')
        .equals(s.sessionId)
        .reverse()
        .sortBy('timestamp');
      set({ recentEvents: recent.slice(0, 6) });
    }
  },

  deleteEvent: async (eventId) => {
    await db.events.delete(eventId);
    const s = get();
    if (s.sessionId) {
      const recent = await db.events
        .where('sessionId')
        .equals(s.sessionId)
        .reverse()
        .sortBy('timestamp');
      set({ recentEvents: recent.slice(0, 6) });
    }
  },

  loadSession: async (sessionId) => {
    const s = await db.sessions.get(sessionId);
    if (!s) return false;

    const evs = await db.events
      .where('sessionId')
      .equals(sessionId)
      .reverse()
      .sortBy('timestamp');

    const marks = await db.bookmarks
      .where('sessionId')
      .equals(sessionId)
      .reverse()
      .sortBy('timestamp');

    set({
      sessionId: s.id,
      matchId: s.matchId,
      sessionName: s.name,
      teamA: s.teamA,
      teamB: s.teamB,
      teamAPlayers: s.teamAPlayers || [],
      teamBPlayers: s.teamBPlayers || [],
      currentSet: s.currentSet,
      scoreA: s.scoreA,
      scoreB: s.scoreB,
      recentEvents: evs.slice(0, 6),
      bookmarks: marks,
      activeTeam: 'A',
      currentEvent: { teamId: 'A' },
      status: 'IDLE'
    });

    return true;
  },

  /**
   * Restores an unfinished active match session from IndexedDB upon reload.
   */
  restoreActiveSession: async () => {
    const activeSessions = await db.sessions
      .where('active')
      .equals(1 as any)
      .or('active')
      .equals(true as any)
      .reverse()
      .sortBy('updatedAt');

    if (activeSessions.length > 0) {
      return await get().loadSession(activeSessions[0].id);
    }

    // Fallback: check most recently updated session
    const latest = await db.sessions.orderBy('updatedAt').reverse().first();
    if (latest && latest.active !== false) {
      return await get().loadSession(latest.id);
    }

    return false;
  },

  createSession: async (teamA, teamB, teamAPlayers = [], teamBPlayers = []) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: Session = {
      id,
      name: `${teamA} vs ${teamB}`,
      sport: 'volleyball',
      matchId: id,
      createdAt: now,
      updatedAt: now,
      teamA,
      teamB,
      teamAPlayers,
      teamBPlayers,
      currentSet: 1,
      scoreA: 0,
      scoreB: 0,
      scoutingProfileId: 'volleyball_basic',
      active: true
    };

    await db.sessions.add(session);

    set({
      sessionId: id,
      matchId: id,
      sessionName: session.name,
      teamA,
      teamB,
      teamAPlayers,
      teamBPlayers,
      currentSet: 1,
      scoreA: 0,
      scoreB: 0,
      activeTeam: 'A',
      currentEvent: { teamId: 'A' },
      recentEvents: [],
      bookmarks: [],
      status: 'IDLE'
    });

    return id;
  },

  endSet: async () => {
    const s = get();
    if (!s.sessionId) return;
    const nextSet = s.currentSet + 1;

    await db.sessions.update(s.sessionId, {
      currentSet: nextSet,
      scoreA: 0,
      scoreB: 0,
      updatedAt: new Date().toISOString()
    });

    set({
      currentSet: nextSet,
      scoreA: 0,
      scoreB: 0,
      currentEvent: { teamId: s.activeTeam }
    });
  },

  endMatch: async () => {
    const s = get();
    if (!s.sessionId) return;

    await db.sessions.update(s.sessionId, {
      active: false,
      updatedAt: new Date().toISOString()
    });

    set({ status: 'IDLE' });
  },

  addBookmark: async (label = 'Moment') => {
    const s = get();
    if (!s.sessionId) return;

    const bookmark: SessionBookmark = {
      id: crypto.randomUUID(),
      sessionId: s.sessionId,
      timestamp: Date.now(),
      label
    };

    await db.bookmarks.add(bookmark);
    set((state) => ({
      bookmarks: [bookmark, ...state.bookmarks],
      lastFeedback: `🔖 Bookmark added`
    }));

    setTimeout(() => {
      if (get().lastFeedback === '🔖 Bookmark added') {
        set({ lastFeedback: null });
      }
    }, 1000);
  },

  setScore: async (scoreA, scoreB) => {
    const s = get();
    if (!s.sessionId) return;

    await db.sessions.update(s.sessionId, {
      scoreA,
      scoreB,
      updatedAt: new Date().toISOString()
    });

    set({ scoreA, scoreB });
  }
}));
