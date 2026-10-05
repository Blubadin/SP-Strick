export interface Rally {
  id: string;
  sessionId: string;
  setNumber: number;
  rallyNumber: number;
  status: 'open' | 'completed' | 'incomplete';
  actionCount: number;
  winningTeam?: 'A' | 'B';
}
