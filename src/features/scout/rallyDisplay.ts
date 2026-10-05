import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';

export const COURT_ZONE_ORDER = [4, 3, 2, 5, 6, 1];
export function skillKey(skill: string): string {
  return `skill.${skill === 'free_ball' ? 'freeball' : skill}`;
}
export function formatVideoTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const tail = `${String(minutes).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  return hours ? `${String(hours).padStart(2,'0')}:${tail}` : tail;
}
export function groupRallyActions(events: ScoutingEvent[]): {id:string; events:ScoutingEvent[]}[] {
  const groups = new Map<string, ScoutingEvent[]>();
  for (const event of [...events].sort((a,b) => a.timestamp - b.timestamp || (a.actionIndex ?? 0) - (b.actionIndex ?? 0))) {
    const key = event.rallyId ?? `legacy-${event.id}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return Array.from(groups, ([id, grouped]) => ({id,events:grouped})).reverse();
}
