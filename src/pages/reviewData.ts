import type { Player } from '../core/persistence/database';
import type { Session } from '../core/persistence/database';
import type { ScoutingEvent } from '../core/scouting/ScoutingEvent';

export function resolvePlayer(session: Session | undefined, event: ScoutingEvent): string {
  if (!event.playerId || !session) return '—';
  const roster: Player[] = event.teamId === 'A'
    ? session.teamAPlayers ?? []
    : session.teamBPlayers ?? [];
  const player = roster.find((candidate) => candidate.id === event.playerId);
  if (!player) return '—';
  return `#${player.number}${player.name ? ` ${player.name}` : ''}`;
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function csvForEvents(events: ScoutingEvent[], session?: Session): string {
  const headers = [
    'timestamp', 'setNumber', 'teamId', 'teamName', 'player', 'playerId', 'skill', 'subSkill',
    'originZone', 'targetZone', 'evaluation', 'pointImpact', 'scoreBeforeA', 'scoreBeforeB',
    'scoreAfterA', 'scoreAfterB', 'inputSource'
  ];
  const rows = events.map((event) => [
    new Date(event.timestamp).toISOString(), event.setNumber, event.teamId,
    event.teamId === 'A' ? session?.teamA : session?.teamB,
    resolvePlayer(session, event), event.playerId, event.skill, event.subSkill, event.originZone,
    event.targetZone, event.evaluation, event.pointImpact, event.scoreBefore?.teamA,
    event.scoreBefore?.teamB, event.scoreAfter?.teamA, event.scoreAfter?.teamB, event.inputSource
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function sessionExportFilename(
  session: Session,
  extension: 'csv' | 'json',
  date = new Date()
): string {
  const slug = `${session.teamA}-vs-${session.teamB}`
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'match';
  return `sp-stick-volleyball-${slug}-${date.toISOString().slice(0, 10)}.${extension}`;
}

export function jsonForEvents(events: ScoutingEvent[]): string {
  return JSON.stringify(events, null, 2);
}
