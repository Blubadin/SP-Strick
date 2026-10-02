import { create } from 'zustand';
import type { ScoutingEvent } from './ScoutingEvent';
import { db } from '../persistence/database';

export type ScoutState = 'IDLE' | 'BUILDING_EVENT' | 'SELECTING_RADIAL' | 'VALIDATING' | 'COMMITTING' | 'SAVED' | 'PAUSED';

interface ScoutStateStore {
  status: ScoutState;
  sessionId: string | null;
  matchId: string | null;
  currentSet: number;
  scoreA: number;
  scoreB: number;
  activeTeam: string; // 'A' or 'B'
  
  // Event Builder
  currentEvent: Partial<ScoutingEvent>;
  recentEvents: ScoutingEvent[];
  
  setStatus: (status: ScoutState) => void;
  setActiveTeam: (team: string) => void;
  updateCurrentEvent: (update: Partial<ScoutingEvent>) => void;
  commitEvent: () => Promise<void>;
  undoLastEvent: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  createSession: (teamA: string, teamB: string) => Promise<void>;
}

export const useScoutStore = create<ScoutStateStore>((set: any, get: any) => ({
  status: 'IDLE',
  sessionId: null,
  matchId: null,
  currentSet: 1,
  scoreA: 0,
  scoreB: 0,
  activeTeam: 'A',
  currentEvent: {},
  recentEvents: [],
  
  setStatus: (status: ScoutState) => set({ status }),
  setActiveTeam: (team: string) => set({ activeTeam: team }),
  updateCurrentEvent: (update: Partial<ScoutingEvent>) => set((state: any) => ({ 
    currentEvent: { ...state.currentEvent, ...update },
    status: 'BUILDING_EVENT'
  })),
  
  commitEvent: async () => {
    const state = get();
    set({ status: 'COMMITTING' });
    
    // Validating basic required fields
    const ev = state.currentEvent;
    if (!ev.skill || !ev.originZone || ev.evaluation === undefined) {
      // Incomplete
      set({ status: 'BUILDING_EVENT' });
      return;
    }
    
    let pointImpact: "TEAM_A" | "TEAM_B" | null = null;
    let newScoreA = state.scoreA;
    let newScoreB = state.scoreB;
    
    if (ev.evaluation === 1) {
        pointImpact = state.activeTeam === 'A' ? "TEAM_A" : "TEAM_B";
        if (pointImpact === "TEAM_A") newScoreA++;
        if (pointImpact === "TEAM_B") newScoreB++;
    } else if (ev.evaluation === -1) {
        pointImpact = state.activeTeam === 'A' ? "TEAM_B" : "TEAM_A";
        if (pointImpact === "TEAM_A") newScoreA++;
        if (pointImpact === "TEAM_B") newScoreB++;
    }

    const fullEvent: ScoutingEvent = {
      id: crypto.randomUUID(),
      sport: "volleyball",
      sessionId: state.sessionId || 'temp',
      matchId: state.matchId || 'temp',
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      setNumber: state.currentSet,
      teamId: state.activeTeam,
      skill: ev.skill,
      originZone: ev.originZone,
      evaluation: ev.evaluation,
      pointImpact,
      scoreBefore: { teamA: state.scoreA, teamB: state.scoreB },
      scoreAfter: { teamA: newScoreA, teamB: newScoreB },
      inputSource: "controller"
    };
    
    try {
      await db.events.add(fullEvent);
      if (state.sessionId) {
          await db.sessions.update(state.sessionId, { scoreA: newScoreA, scoreB: newScoreB });
      }
      set({ 
        currentEvent: {}, 
        status: 'SAVED',
        recentEvents: [fullEvent, ...state.recentEvents].slice(0, 5),
        scoreA: newScoreA,
        scoreB: newScoreB
      });
      setTimeout(() => {
        if (get().status === 'SAVED') set({ status: 'IDLE' });
      }, 800);
    } catch (e) {
      console.error(e);
      set({ status: 'IDLE' });
    }
  },
  
  undoLastEvent: async () => {
    const state = get();
    if (state.recentEvents.length === 0) return;
    
    const lastEvent = state.recentEvents[0];
    try {
      await db.events.delete(lastEvent.id);
      
      const newScoreA = lastEvent.scoreBefore?.teamA ?? state.scoreA;
      const newScoreB = lastEvent.scoreBefore?.teamB ?? state.scoreB;
      
      if (state.sessionId) {
          await db.sessions.update(state.sessionId, { scoreA: newScoreA, scoreB: newScoreB });
      }
      
      set({
        recentEvents: state.recentEvents.slice(1),
        scoreA: newScoreA,
        scoreB: newScoreB,
        currentEvent: {}, // clear buffer
        status: 'IDLE'
      });
    } catch(e) {
      console.error("Undo failed", e);
    }
  },
  
  loadSession: async (sessionId: string) => {
     const s = await db.sessions.get(sessionId);
     if (s) {
         const evs = await db.events.where('sessionId').equals(sessionId).reverse().sortBy('timestamp');
         set({
             sessionId: s.id,
             matchId: s.matchId,
             currentSet: s.currentSet,
             scoreA: s.scoreA,
             scoreB: s.scoreB,
             recentEvents: evs.slice(0, 5),
             status: 'IDLE'
         });
     }
  },
  
  createSession: async (teamA: string, teamB: string) => {
      const id = crypto.randomUUID();
      const s = {
          id,
          name: `${teamA} vs ${teamB}`,
          sport: "volleyball",
          matchId: id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          teamA,
          teamB,
          currentSet: 1,
          scoreA: 0,
          scoreB: 0
      };
      await db.sessions.add(s);
      set({
         sessionId: id,
         matchId: id,
         currentSet: 1,
         scoreA: 0,
         scoreB: 0,
         activeTeam: 'A',
         recentEvents: [],
         status: 'IDLE'
      });
  }
}));
