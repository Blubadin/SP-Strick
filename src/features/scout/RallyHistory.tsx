import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';
import type { Player } from '../../core/persistence/database';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatVideoTime, groupRallyActions, skillKey } from './rallyDisplay';
import styles from './RallyDisplay.module.css';
export interface RallyHistoryProps {
  events: ScoutingEvent[]; teamA: string; teamB: string;
  teamAPlayers: Player[]; teamBPlayers: Player[];
  selectedEventId?: string; onInspect: (event: ScoutingEvent) => void;
  incompleteRallyIds?: string[];
}
export function RallyHistory({events,teamA,teamB,teamAPlayers,teamBPlayers,selectedEventId,onInspect,incompleteRallyIds=[]}: RallyHistoryProps) {
  const {t} = useTranslation();
  const [visibleCount,setVisibleCount] = useState(8);
  const groups = groupRallyActions(events);
  if (!groups.length) return <div className={styles.empty}>{t('scout.no_events','No events recorded yet.')}<small>{t('scout.pass_hint','Pass saves an action and continues the rally.')}</small></div>;
  return <div className={styles.history}>
    {groups.slice(0,visibleCount).map(group => {
      const first = group.events[0], last = group.events.at(-1)!;
      const isNew = Boolean(first.rallyId);
      const incomplete = incompleteRallyIds.includes(group.id);
      const terminal = isNew && !incomplete && (last.evaluation === 1 || last.evaluation === -1);
      const winner = last.pointImpact === 'TEAM_A' ? teamA : last.pointImpact === 'TEAM_B' ? teamB : '';
      return <section key={group.id} className={styles.rallyGroup}>
        <div className={styles.rallyHeading}><strong>{isNew ? t('scout.rally_number','Rally {{number}}',{number:first.rallyNumber}) : t('scout.legacy_action','Earlier action')}</strong><span>{t('scout.set','Set {{set}}',{set:first.setNumber})} · {group.events.length} {t('scout.actions','actions')}</span></div>
        <div className={styles.rallyStatus} data-open={isNew && !terminal && !incomplete}>{incomplete ? t('scout.incomplete','Incomplete') : terminal ? `${t('scout.rally_complete','Complete')} · ${winner} +1` : isNew ? t('scout.rally_open','Rally in progress') : t('scout.legacy','Legacy recording')}</div>
        <ol className={styles.actionList}>
          {group.events.map((event,index) => {
            const player = (event.teamId === 'A' ? teamAPlayers : teamBPlayers).find(candidate => candidate.id === event.playerId);
            const result = event.evaluation === 0 ? t('result.pass','Pass') : event.evaluation === 1 ? '+1' : '-1';
            return <li key={event.id}><button type="button" className={`${styles.actionRow} ${selectedEventId === event.id ? styles.actionSelected : ''}`}
              aria-label={t('scout.view_action','View action {{index}}: {{skill}}, {{result}}',{index:event.actionIndex ?? index + 1,skill:t(skillKey(event.skill)),result})}
              onClick={() => onInspect(event)}>
              <span className={styles.actionIndex}>{event.actionIndex ?? index + 1}</span>
              <span className={styles.actionDetail}><span className={styles.actionTop}><b>{event.teamId === 'A' ? teamA : teamB}</b><em data-result={event.evaluation}>{result}</em></span>
                <strong>{t(skillKey(event.skill))} · {event.originZone ? `Z${event.originZone} ${t(`zone.${event.originZone}`)}` : '—'}</strong>
                <span>{player ? `#${player.number}${player.name ? ` ${player.name}` : ''}` : t('scout.no_player','No player selected')}</span>
                <span className={styles.actionMetadata}>{event.videoTimeMs !== undefined ? formatVideoTime(event.videoTimeMs) : new Date(event.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}<span>{event.scoreBefore ? `${event.scoreBefore.teamA}–${event.scoreBefore.teamB} → ${event.scoreAfter?.teamA ?? event.scoreBefore.teamA}–${event.scoreAfter?.teamB ?? event.scoreBefore.teamB}` : '—'}</span></span>
              </span>
            </button></li>;
          })}
        </ol>
      </section>;
    })}
    {groups.length > visibleCount && <button type="button" className={styles.loadMore} onClick={() => setVisibleCount(count => count + 8)}>{t('scout.load_more','Load earlier rallies')} ({groups.length-visibleCount})</button>}
  </div>;
}
