import { create } from 'zustand';
import type { ScoutingEvent } from './ScoutingEvent';
import type { Rally } from './Rally';
import { db, type Session, type SessionBookmark, type Player } from '../persistence/database';
import { EventValidator } from './EventValidator';
import { hapticManager } from '../controller/HapticManager';
import { calculatePointImpact } from '../sports/volleyball/volleyball.rules';
import { recalculateScoreState, type Score } from './scoreTimeline';
import { audioFeedbackManager } from '../preferences/AudioFeedbackManager';
export type { Rally } from './Rally';

export type ScoutState = 'IDLE' | 'BUILDING_EVENT' | 'SELECTING_RADIAL' | 'VALIDATING' | 'COMMITTING' | 'SAVED' | 'PAUSED' | 'ERROR';
export type ScoutFeedback = 'saved' | 'undo' | 'bookmark';
export type ScoutSaveError = 'save-failed';
export type VideoTiming = { videoTimeMs?: number; videoSourceId?: string };
let videoTimingProvider: () => VideoTiming = () => ({});
export function setVideoTimingProvider(provider: () => VideoTiming): void { videoTimingProvider = provider; }

// One queue covers draft updates, saves, history mutations, and session changes.
let commandTail: Promise<unknown> = Promise.resolve();
function serialize<T>(command: () => Promise<T>): Promise<T> {
  const result = commandTail.then(command);
  commandTail = result.catch(() => undefined);
  return result;
}

export interface ScoutStateStore {
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
  currentEvent: Partial<ScoutingEvent>;
  allEvents: ScoutingEvent[];
  recentEvents: ScoutingEvent[];
  rallies: Rally[];
  currentRallyId: string | null;
  bookmarks: SessionBookmark[];
  autoScoreEnabled: boolean;
  lastFeedback: ScoutFeedback | null;
  saveError: ScoutSaveError | null;
  setStatus: (status: ScoutState) => void;
  setActiveTeam: (team: 'A' | 'B') => void;
  setSelectedPlayer: (playerId?: string) => void;
  updateCurrentEvent: (update: Partial<ScoutingEvent>) => Promise<void>;
  commitEvent: () => Promise<void>;
  retrySave: () => Promise<void>;
  clearCurrentEvent: () => Promise<void>;
  undoLastEvent: () => Promise<void>;
  editEvent: (eventId: string, changes: Partial<ScoutingEvent>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<boolean>;
  restoreActiveSession: () => Promise<boolean>;
  createSession: (teamA: string, teamB: string, teamAPlayers?: Player[], teamBPlayers?: Player[]) => Promise<string>;
  endSet: () => Promise<void>;
  endMatch: () => Promise<void>;
  addBookmark: (label?: string) => Promise<void>;
  setScore: (scoreA: number, scoreB: number) => Promise<void>;
}

const initial = {
  status: 'IDLE' as ScoutState, sessionId: null, matchId: null, sessionName: '',
  currentSet: 1, scoreA: 0, scoreB: 0, teamA: 'Team A', teamB: 'Team B',
  teamAPlayers: [] as Player[], teamBPlayers: [] as Player[], activeTeam: 'A' as const,
  selectedPlayerId: undefined, currentEvent: {} as Partial<ScoutingEvent>,
  allEvents: [] as ScoutingEvent[], recentEvents: [] as ScoutingEvent[], rallies: [] as Rally[],
  currentRallyId: null, bookmarks: [] as SessionBookmark[], autoScoreEnabled: false,
  lastFeedback: null, saveError: null
};
const requiredFields = ['teamId', 'skill', 'originZone', 'evaluation'];
const isComplete = (draft: Partial<ScoutingEvent>) => EventValidator.validate(draft, requiredFields).isValid;
const hasActionFields = (draft: Partial<ScoutingEvent>) =>
  draft.skill !== undefined || draft.originZone !== undefined || draft.evaluation !== undefined || draft.subSkill !== undefined || draft.targetZone !== undefined;
const stickyDraft = (state: ScoutStateStore): Partial<ScoutingEvent> => ({ teamId: state.activeTeam, playerId: state.selectedPlayerId });
const orderedRallies = (rallies: Rally[]) => rallies.sort((a, b) => a.setNumber - b.setNumber || a.rallyNumber - b.rallyNumber);

async function sessionEvents(sessionId: string) {
  return db.events.where('sessionId').equals(sessionId).sortBy('timestamp');
}

/** Preserve points that were entered manually or were never recorded as actions. */
async function ensureBaselines(session: Session, events: ScoutingEvent[]): Promise<Record<string, Score>> {
  if (session.scoreBaselines) return session.scoreBaselines;
  const baselines: Record<string, Score> = {};
  for (const event of events) baselines[event.setNumber] ??= { ...(event.scoreBefore ?? { teamA: 0, teamB: 0 }) };
  const current = events.filter(e => e.setNumber === session.currentSet);
  baselines[session.currentSet] = {
    teamA: session.scoreA - current.filter(e => e.pointImpact === 'TEAM_A').length,
    teamB: session.scoreB - current.filter(e => e.pointImpact === 'TEAM_B').length
  };
  await db.sessions.update(session.id, { scoreBaselines: baselines });
  return baselines;
}

/** Repartition only new-format actions. Legacy evaluations retain their stored impacts. */
function regroup(events: ScoutingEvent[], previous: Rally[], session: Session): { events: ScoutingEvent[]; rallies: Rally[] } {
  const oldRallies = new Map(previous.map(r => [r.id, r]));
  const usedIds = new Set<string>();
  const rallyCounts = new Map<number, number>();
  const rallies: Rally[] = [];
  let current: Rally | undefined;
  let previousOriginalId: string | undefined;
  const rebuilt = events.map(event => {
    if (!event.rallyId) return event;
    const originalId = event.rallyId;
    // Set/match closure is a hard boundary even if an old Pass is later edited.
    if (current && (current.setNumber !== event.setNumber || (previousOriginalId !== originalId && oldRallies.get(previousOriginalId!)?.status === 'incomplete'))) {
      if (current.status === 'open') current.status = 'incomplete';
      current = undefined;
    }
    if (!current) {
      const rallyNumber = (rallyCounts.get(event.setNumber) ?? 0) + 1;
      rallyCounts.set(event.setNumber, rallyNumber);
      const id = usedIds.has(originalId) ? crypto.randomUUID() : originalId;
      usedIds.add(id);
      current = { id, sessionId: event.sessionId, setNumber: event.setNumber, rallyNumber, status: 'open', actionCount: 0 };
      rallies.push(current);
    }
    const pointImpact = calculatePointImpact(event.skill, event.evaluation as -1 | 0 | 1, event.teamId);
    current.actionCount++;
    const result = { ...event, rallyId: current.id, rallyNumber: current.rallyNumber, actionIndex: current.actionCount, pointImpact };
    previousOriginalId = originalId;
    if (pointImpact) {
      current.status = 'completed';
      current.winningTeam = pointImpact === 'TEAM_A' ? 'A' : 'B';
      current = undefined;
    }
    return result;
  });
  if (current && (session.status === 'ended' || current.setNumber !== session.currentSet || oldRallies.get(previousOriginalId!)?.status === 'incomplete')) current.status = 'incomplete';
  return { events: rebuilt, rallies: orderedRallies(rallies) };
}

export const useScoutStore = create<ScoutStateStore>((set, get) => {
  let pendingUpdates = 0;
  let pendingDraftResets = 0;
  let projectedDraft: Partial<ScoutingEvent> = {};
  function resetDraft(command: () => Promise<void>): Promise<void> {
    projectedDraft = stickyDraft(get());
    pendingDraftResets++;
    return serialize(command).finally(() => { pendingDraftResets--; });
  }
  const failed = () => { set({ status: 'ERROR', saveError: 'save-failed' }); hapticManager.warning(null); };
  async function persistDraft(): Promise<boolean> {
    const state = get();
    if (!state.sessionId) return true;
    try {
      await db.sessions.update(state.sessionId, {
        scoutingDraft: state.currentEvent, scoutingTeam: state.activeTeam,
        scoutingPlayerId: state.selectedPlayerId, updatedAt: new Date().toISOString()
      });
      return true;
    } catch { failed(); return false; }
  }

  async function commit(): Promise<void> {
    const state = get();
    if (!state.sessionId || !isComplete(state.currentEvent)) return;
    const draft = state.currentEvent;
    const pointImpact = calculatePointImpact(draft.skill!, draft.evaluation as -1 | 0 | 1, draft.teamId!);
    const timestamp = Math.max(Date.now(), (state.allEvents.at(-1)?.timestamp ?? 0) + 1);
    const id = draft.id ?? crypto.randomUUID();
    set({ status: 'COMMITTING', currentEvent: { ...draft, id } });
    let savedEvent: ScoutingEvent | undefined;
    let savedRally: Rally | undefined;
    try {
      await db.transaction('rw', [db.events, db.rallies, db.sessions], async () => {
        const session = await db.sessions.get(state.sessionId!);
        if (!session || session.status === 'ended') throw new Error('Session is not active');
        if (!session.scoreBaselines) await ensureBaselines(session, await sessionEvents(session.id));
        const previous = state.currentRallyId ? await db.rallies.get(state.currentRallyId) : undefined;
        const rally: Rally = previous?.status === 'open' ? { ...previous } : {
          id: crypto.randomUUID(), sessionId: session.id, setNumber: session.currentSet,
          rallyNumber: state.rallies.reduce((last, r) => r.setNumber === session.currentSet ? Math.max(last, r.rallyNumber) : last, 0) + 1,
          status: 'open', actionCount: 0
        };
        rally.actionCount++;
        if (pointImpact) { rally.status = 'completed'; rally.winningTeam = pointImpact === 'TEAM_A' ? 'A' : 'B'; }
        const scoreAfter = { teamA: session.scoreA + (pointImpact === 'TEAM_A' ? 1 : 0), teamB: session.scoreB + (pointImpact === 'TEAM_B' ? 1 : 0) };
        const event: ScoutingEvent = {
          ...draft, id, sport: 'volleyball', sessionId: session.id, matchId: session.matchId,
          timestamp, createdAt: new Date(timestamp).toISOString(), setNumber: session.currentSet,
          teamId: draft.teamId!, skill: draft.skill!, pointImpact,
          rallyId: rally.id, rallyNumber: rally.rallyNumber, actionIndex: rally.actionCount,
          scoreBefore: { teamA: session.scoreA, teamB: session.scoreB }, scoreAfter,
          inputSource: draft.inputSource ?? 'controller'
        };
        await db.events.add(event);
        await db.rallies.put(rally);
        await db.sessions.update(session.id, {
          scoreA: scoreAfter.teamA, scoreB: scoreAfter.teamB, scoutingDraft: stickyDraft(get()),
          scoutingTeam: get().activeTeam, scoutingPlayerId: get().selectedPlayerId, updatedAt: new Date().toISOString()
        });
        savedEvent = event;
        savedRally = rally;
      });
      const event = savedEvent!;
      const rally = savedRally!;
      const latest = get();
      const allEvents = [...latest.allEvents, event];
      set({
        allEvents, recentEvents: allEvents.slice(-6).reverse(),
        rallies: orderedRallies([...latest.rallies.filter(r => r.id !== rally.id), rally]),
        currentRallyId: rally.status === 'open' ? rally.id : null,
        currentEvent: stickyDraft(latest), scoreA: event.scoreAfter!.teamA, scoreB: event.scoreAfter!.teamB,
        status: 'SAVED', lastFeedback: 'saved', saveError: null
      });
      hapticManager.success(null);
      audioFeedbackManager.playCommitTone();
      setTimeout(() => { if (get().status === 'SAVED') set({ status: 'IDLE', lastFeedback: null }); }, 850);
    } catch { failed(); }
  }

  async function load(sessionId: string): Promise<boolean> {
    const session = await db.sessions.get(sessionId);
    if (!session) return false;
    const [allEvents, rallies, bookmarks] = await Promise.all([
      sessionEvents(sessionId), db.rallies.where('sessionId').equals(sessionId).toArray(),
      db.bookmarks.where('sessionId').equals(sessionId).reverse().sortBy('timestamp')
    ]);
    const activeTeam = session.scoutingTeam ?? 'A';
    const currentEvent = session.scoutingDraft ?? { teamId: activeTeam, playerId: session.scoutingPlayerId };
    set({
      sessionId: session.id, matchId: session.matchId, sessionName: session.name,
      teamA: session.teamA, teamB: session.teamB, teamAPlayers: session.teamAPlayers ?? [], teamBPlayers: session.teamBPlayers ?? [],
      currentSet: session.currentSet, scoreA: session.scoreA, scoreB: session.scoreB,
      allEvents, recentEvents: allEvents.slice(-6).reverse(), rallies: orderedRallies(rallies), bookmarks,
      activeTeam, selectedPlayerId: session.scoutingPlayerId, currentEvent,
      currentRallyId: rallies.find(r => r.setNumber === session.currentSet && r.status === 'open')?.id ?? null,
      status: isComplete(currentEvent) ? 'ERROR' : hasActionFields(currentEvent) ? 'BUILDING_EVENT' : 'IDLE',
      saveError: isComplete(currentEvent) ? 'save-failed' : null, lastFeedback: null
    });
    return true;
  }

  async function mutate(eventId: string, changes?: Partial<ScoutingEvent>): Promise<void> {
    let sessionId: string | undefined;
    let result: { events: ScoutingEvent[]; rallies: Rally[]; score: Score } | undefined;
    await db.transaction('rw', [db.events, db.rallies, db.sessions], async () => {
      const event = await db.events.get(eventId);
      if (!event) return;
      sessionId = event.sessionId;
      const session = await db.sessions.get(sessionId);
      if (!session) return;
      const originalEvents = await sessionEvents(sessionId);
      const baselines = await ensureBaselines(session, originalEvents);
      if (changes) await db.events.put({ ...event, ...changes, id: event.id, sessionId: event.sessionId, rallyId: event.rallyId });
      else await db.events.delete(eventId);
      const previous = await db.rallies.where('sessionId').equals(sessionId).toArray();
      const grouped = regroup(await sessionEvents(sessionId), previous, session);
      const recalculated = recalculateScoreState(grouped.events, baselines, session.scoreAdjustments ?? []);
      const events = recalculated.events;
      const score = recalculated.scoresBySet.get(session.currentSet) ?? { teamA: 0, teamB: 0 };
      if (events.length) await db.events.bulkPut(events);
      await db.rallies.where('sessionId').equals(sessionId).delete();
      if (grouped.rallies.length) await db.rallies.bulkPut(grouped.rallies);
      await db.sessions.update(sessionId, { scoreA: score.teamA, scoreB: score.teamB, updatedAt: new Date().toISOString() });
      result = { events, rallies: grouped.rallies, score };
    });
    if (result && sessionId === get().sessionId) {
      set({ allEvents: result.events, recentEvents: result.events.slice(-6).reverse(), rallies: result.rallies,
        currentRallyId: result.rallies.find(r => r.setNumber === get().currentSet && r.status === 'open')?.id ?? null,
        scoreA: result.score.teamA, scoreB: result.score.teamB });
    }
  }

  async function closeRally(): Promise<Rally | undefined> {
    const state = get();
    if (!state.currentRallyId) return;
    const rally = await db.rallies.get(state.currentRallyId);
    if (!rally || rally.status !== 'open') return;
    const incomplete = { ...rally, status: 'incomplete' as const };
    await db.rallies.put(incomplete);
    return incomplete;
  }

  return {
    ...initial,
    setStatus: status => set({ status }),
    setActiveTeam: team => {
      const state = get();
      if (team === state.activeTeam) return;
      // A failed action remains intact until the user retries or clears it.
      set({ activeTeam: team, selectedPlayerId: undefined,
        ...(state.saveError ? {} : { currentEvent: { ...state.currentEvent, teamId: team, playerId: undefined } }) });
      void serialize(async () => { if (!get().saveError) await persistDraft(); });
    },
    setSelectedPlayer: playerId => {
      set(state => ({ selectedPlayerId: playerId,
        ...(state.saveError ? {} : { currentEvent: { ...state.currentEvent, playerId } }) }));
      void serialize(async () => { if (!get().saveError) await persistDraft(); });
    },
    updateCurrentEvent: update => {
      if (get().saveError) return Promise.resolve();
      if ((update.teamId === 'A' || update.teamId === 'B') && update.teamId !== get().activeTeam) get().setActiveTeam(update.teamId);
      const context = { teamId: get().activeTeam, playerId: get().selectedPlayerId };
      if (pendingUpdates === 0 && pendingDraftResets === 0) projectedDraft = get().currentEvent;
      const timing = !hasActionFields(projectedDraft) && hasActionFields(update) ? videoTimingProvider() : {};
      projectedDraft = { ...projectedDraft, ...context, ...timing, ...update };
      if (isComplete(projectedDraft)) projectedDraft = stickyDraft(get());
      pendingUpdates++;
      return serialize(async () => {
        if (get().saveError) return;
        const draft = get().currentEvent;
        const currentEvent = { ...draft, ...context, ...(!hasActionFields(draft) ? timing : {}), ...update };
        set({ currentEvent, status: 'BUILDING_EVENT' });
        if (await persistDraft() && isComplete(currentEvent)) await commit();
      }).finally(() => { pendingUpdates--; });
    },
    commitEvent: () => serialize(async () => { if (!get().saveError) await commit(); }),
    retrySave: () => serialize(async () => {
      if (!get().saveError) return;
      if (await persistDraft()) {
        set({ saveError: null, status: 'BUILDING_EVENT' });
        await commit();
      }
    }),
    clearCurrentEvent: () => resetDraft(async () => {
      const state = get();
      const currentEvent = stickyDraft(state);
      if (state.sessionId) await db.sessions.update(state.sessionId, { scoutingDraft: currentEvent, scoutingTeam: state.activeTeam, scoutingPlayerId: state.selectedPlayerId });
      set({ currentEvent, saveError: null, status: 'IDLE' });
    }),
    undoLastEvent: () => serialize(async () => {
      const state = get();
      if (!state.sessionId) return;
      const events = await sessionEvents(state.sessionId);
      const event = events.at(-1);
      if (!event) return;
      await mutate(event.id);
      set({ lastFeedback: 'undo' });
    }),
    editEvent: (id, changes) => serialize(() => mutate(id, changes)),
    deleteEvent: id => serialize(() => mutate(id)),
    loadSession: id => serialize(() => load(id)),
    restoreActiveSession: () => serialize(async () => {
      const active = await db.sessions.where('status').equals('active').reverse().sortBy('updatedAt');
      return active[0] ? load(active[0].id) : false;
    }),
    createSession: (teamA, teamB, teamAPlayers = [], teamBPlayers = []) => serialize(async () => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const session: Session = {
        id, name: `${teamA} vs ${teamB}`, sport: 'volleyball', matchId: id, createdAt: now, updatedAt: now,
        teamA, teamB, teamAPlayers, teamBPlayers, currentSet: 1, scoreA: 0, scoreB: 0,
        scoutingProfileId: 'volleyball_basic', status: 'active', active: true,
        scoreBaselines: { '1': { teamA: 0, teamB: 0 } }, scoutingTeam: 'A', scoutingDraft: { teamId: 'A' }
      };
      await db.sessions.add(session);
      set({ ...initial, sessionId: id, matchId: id, sessionName: session.name, teamA, teamB, teamAPlayers, teamBPlayers, currentEvent: { teamId: 'A' } });
      return id;
    }),
    endSet: () => resetDraft(async () => {
      const state = get();
      if (!state.sessionId) return;
      let incomplete: Rally | undefined;
      await db.transaction('rw', [db.events, db.rallies, db.sessions], async () => {
        incomplete = await closeRally();
        const session = await db.sessions.get(state.sessionId!);
        if (!session) throw new Error('Session missing');
        const baselines = await ensureBaselines(session, await sessionEvents(session.id));
        await db.sessions.update(session.id, {
          currentSet: state.currentSet + 1, scoreA: 0, scoreB: 0,
          scoreBaselines: { ...baselines, [state.currentSet + 1]: { teamA: 0, teamB: 0 } },
          scoutingDraft: stickyDraft(state), updatedAt: new Date().toISOString()
        });
      });
      set({ currentSet: state.currentSet + 1, scoreA: 0, scoreB: 0, currentEvent: stickyDraft(state), currentRallyId: null,
        rallies: incomplete ? state.rallies.map(r => r.id === incomplete!.id ? incomplete! : r) : state.rallies, status: 'IDLE', saveError: null });
    }),
    endMatch: () => serialize(async () => {
      const state = get();
      if (!state.sessionId) return;
      await db.transaction('rw', [db.events, db.rallies, db.sessions], async () => {
        await closeRally();
        await db.sessions.update(state.sessionId!, { status: 'ended', active: false, scoutingDraft: {}, scoutingPlayerId: undefined, updatedAt: new Date().toISOString() });
      });
      set({ ...initial });
    }),
    addBookmark: (label = 'Moment') => serialize(async () => {
      const state = get();
      if (!state.sessionId) return;
      const bookmark: SessionBookmark = { id: crypto.randomUUID(), sessionId: state.sessionId, timestamp: Date.now(), label };
      await db.bookmarks.add(bookmark);
      set({ bookmarks: [bookmark, ...state.bookmarks], lastFeedback: 'bookmark' });
    }),
    setScore: (scoreA, scoreB) => serialize(async () => {
      const state = get();
      if (!state.sessionId) return;
      await db.transaction('rw', [db.events, db.sessions], async () => {
        const session = await db.sessions.get(state.sessionId!);
        if (!session) throw new Error('Session missing');
        const events = await sessionEvents(session.id);
        await ensureBaselines(session, events);
        const anchor = events.filter(event => event.setNumber === state.currentSet).at(-1);
        await db.sessions.update(session.id, {
          scoreA, scoreB, scoreAdjustments: [...(session.scoreAdjustments ?? []), {
            setNumber: state.currentSet, afterTimestamp: anchor?.timestamp ?? 0, afterEventId: anchor?.id,
            teamA: scoreA - session.scoreA, teamB: scoreB - session.scoreB
          }],
          updatedAt: new Date().toISOString()
        });
      });
      set({ scoreA, scoreB });
    })
  };
});
