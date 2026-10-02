import { create } from 'zustand';
import type { ScoutingEvent } from './ScoutingEvent';
import { db, type Session, type SessionBookmark, type Player } from '../persistence/database';
import { EventValidator } from './EventValidator';
import { hapticManager } from '../controller/HapticManager';
import { calculatePointImpact } from '../sports/volleyball/volleyball.rules';
import { recalculateScoreTimeline } from './scoreTimeline';
import { audioFeedbackManager } from '../preferences/AudioFeedbackManager';

export type ScoutState =
  | 'IDLE'
  | 'BUILDING_EVENT'
  | 'SELECTING_RADIAL'
  | 'VALIDATING'
  | 'COMMITTING'
  | 'SAVED'
  | 'PAUSED'
  | 'ERROR';

export type ScoutFeedback = 'saved' | 'undo' | 'bookmark';
export type ScoutSaveError = 'save-failed';

interface RecalculatedSession {
  events: ScoutingEvent[];
  scoreA: number;
  scoreB: number;
}

async function recalculatePersistedSession(sessionId: string): Promise<RecalculatedSession | null> {
  const session = await db.sessions.get(sessionId);
  if (!session) return null;

  const storedEvents = await db.events.where('sessionId').equals(sessionId).sortBy('timestamp');
  const events = recalculateScoreTimeline(storedEvents);
  if (events.length > 0) await db.events.bulkPut(events);

  const currentSetEvents = events.filter((event) => event.setNumber === (session.currentSet || 1));
  const currentScore = currentSetEvents.at(-1)?.scoreAfter ?? { teamA: 0, teamB: 0 };
  const scoreA = currentScore.teamA;
  const scoreB = currentScore.teamB;

  await db.sessions.update(sessionId, {
    scoreA,
    scoreB,
    updatedAt: new Date().toISOString()
  });

  return { events, scoreA, scoreB };
}

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
  lastFeedback: ScoutFeedback | null;
  saveError: ScoutSaveError | null;

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
      audioFeedbackManager.playCommitTone();

      set({
        currentEvent: { teamId: state.activeTeam }, // clear buffer, preserve sticky team
        status: 'SAVED',
        lastFeedback: 'saved',
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
        saveError: 'save-failed'
      });
      hapticManager.warning(null);
    }
  },

  /**
   * Undo latest event atomically.
   */
  undoLastEvent: async () => {
    const state = get();
    if (!state.sessionId) return;

    try {
      const resultHolder: { value: RecalculatedSession | null } = { value: null };

      await db.transaction('rw', [db.events, db.sessions], async () => {
        const latestEvents = await db.events
          .where('sessionId')
          .equals(state.sessionId as string)
          .reverse()
          .sortBy('timestamp');
        const lastEvent = latestEvents[0];
        if (!lastEvent) return;
        await db.events.delete(lastEvent.id);
        resultHolder.value = await recalculatePersistedSession(state.sessionId as string);
      });

      const result = resultHolder.value;
      if (!result) return;
      const remainingEvents = result.events;

      set({
        recentEvents: remainingEvents.slice(-6).reverse(),
        scoreA: result.scoreA,
        scoreB: result.scoreB,
        currentEvent: { teamId: state.activeTeam },
        lastFeedback: 'undo',
        status: 'IDLE'
      });

      setTimeout(() => {
        if (get().lastFeedback === 'undo') {
          set({ lastFeedback: null });
        }
      }, 1200);
    } catch (err) {
      console.error('Failed to undo event:', err);
    }
  },

  editEvent: async (eventId, changes) => {
    let sessionId: string | undefined;
    const resultHolder: { value: RecalculatedSession | null } = { value: null };

    await db.transaction('rw', [db.events, db.sessions], async () => {
      const event = await db.events.get(eventId);
      if (!event) return;
      sessionId = event.sessionId;
      await db.events.put({ ...event, ...changes, id: event.id, sessionId: event.sessionId });
      resultHolder.value = await recalculatePersistedSession(event.sessionId);
    });

    const state = get();
    const result = resultHolder.value;
    if (result && sessionId === state.sessionId) {
      set({
        recentEvents: result.events.slice(-6).reverse(),
        scoreA: result.scoreA,
        scoreB: result.scoreB
      });
    }
  },

  deleteEvent: async (eventId) => {
    let sessionId: string | undefined;
    const resultHolder: { value: RecalculatedSession | null } = { value: null };

    await db.transaction('rw', [db.events, db.sessions], async () => {
      const event = await db.events.get(eventId);
      if (!event) return;
      sessionId = event.sessionId;
      await db.events.delete(eventId);
      resultHolder.value = await recalculatePersistedSession(event.sessionId);
    });

    const state = get();
    const result = resultHolder.value;
    if (result && sessionId === state.sessionId) {
      set({
        recentEvents: result.events.slice(-6).reverse(),
        scoreA: result.scoreA,
        scoreB: result.scoreB
      });
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
      .where('status')
      .equals('active')
      .reverse()
      .sortBy('updatedAt');

    if (activeSessions.length > 0) {
      return await get().loadSession(activeSessions[0].id);
    }

    // Fallback: check most recently updated session
    const latest = await db.sessions.orderBy('updatedAt').reverse().first();
    if (latest && latest.status === 'active') {
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
      status: 'active',
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
      status: 'ended',
      active: false,
      updatedAt: new Date().toISOString()
    });

    set({
      status: 'IDLE',
      sessionId: null,
      matchId: null,
      sessionName: '',
      currentSet: 1,
      scoreA: 0,
      scoreB: 0,
      activeTeam: 'A',
      selectedPlayerId: undefined,
      currentEvent: {},
      recentEvents: [],
      bookmarks: []
    });
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
      lastFeedback: 'bookmark'
    }));

    setTimeout(() => {
      if (get().lastFeedback === 'bookmark') {
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
