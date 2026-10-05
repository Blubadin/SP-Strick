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

export function resultLabel(evaluation: number | undefined): string {
  if (evaluation === 0) return 'Pass';
  if (evaluation === 1) return '+1';
  if (evaluation === -1) return '−1';
  return '—';
}

export function formatVideoTime(videoTimeMs: number): string {
  const totalSeconds = Math.floor(videoTimeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((videoTimeMs % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

export function csvForEvents(events: ScoutingEvent[], session?: Session): string {
  const headers = [
    'timestamp', 'setNumber', 'teamId', 'teamName', 'player', 'playerId', 'skill', 'subSkill',
    'originZone', 'targetZone', 'evaluation', 'pointImpact', 'scoreBeforeA', 'scoreBeforeB',
    'scoreAfterA', 'scoreAfterB', 'inputSource', 'rallyId', 'rallyNumber', 'actionIndex',
    'resultLabel', 'videoSourceId', 'videoTimeMs'
  ];
  const rows = events.map((event) => [
    new Date(event.timestamp).toISOString(), event.setNumber, event.teamId,
    event.teamId === 'A' ? session?.teamA : session?.teamB,
    resolvePlayer(session, event), event.playerId, event.skill, event.subSkill, event.originZone,
    event.targetZone, event.evaluation, event.pointImpact, event.scoreBefore?.teamA,
    event.scoreBefore?.teamB, event.scoreAfter?.teamA, event.scoreAfter?.teamB, event.inputSource,
    event.rallyId, event.rallyNumber, event.actionIndex, resultLabel(event.evaluation), event.videoSourceId, event.videoTimeMs
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
