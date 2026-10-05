export interface ScoutingEvent {
  id: string;
  sport: "volleyball";
  sessionId: string;
  matchId: string;
  timestamp: number;
  createdAt: string;
  videoTimeMs?: number;
  videoSourceId?: string;
  setNumber: number;
  rallyNumber?: number;
  rallyId?: string;
  actionIndex?: number;
  teamId: string;
  playerId?: string;
  skill: string;
  subSkill?: string;
  originZone?: number;
  targetZone?: number;
  evaluation?: number;
  pointImpact?: "TEAM_A" | "TEAM_B" | null;
  scoreBefore?: { teamA: number; teamB: number; };
  scoreAfter?: { teamA: number; teamB: number; };
  inputSource: "controller" | "touch" | "keyboard" | "voice" | "manual";
  controllerProfileId?: string;
  metadata?: Record<string, unknown>;
}
