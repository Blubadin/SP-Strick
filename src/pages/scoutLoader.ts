import { redirect } from 'react-router-dom';
import { useScoutStore } from '../core/scouting/ScoutStore';

export async function scoutLoader() {
  const scout = useScoutStore.getState();
  if (!scout.sessionId && !(await scout.restoreActiveSession())) return redirect('/setup');
  return null;
}
