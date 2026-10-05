import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';
import { useTranslation } from 'react-i18next';
import { COURT_ZONE_ORDER, skillKey } from './rallyDisplay';
import styles from './RallyDisplay.module.css';
export interface CourtMapProps {
  events: ScoutingEvent[]; teamId: string; teamName: string;
  draft: Partial<ScoutingEvent>; previewZone?: number | null;
  selectedEventId?: string; onInspect: (event: ScoutingEvent) => void;
}
export function CourtMap({events,teamId,teamName,draft,previewZone,selectedEventId,onInspect}: CourtMapProps) {
  const {t} = useTranslation();
  const displayed = events.filter(event => event.teamId === teamId);
  const currentZone = previewZone ?? draft.originZone;
  return <section className={styles.map} aria-label={t('scout.court_map','Court map')}>
    <div className={styles.mapHeading}><strong>{teamName}</strong><span>{t('scout.court_map','Court map')} · {displayed.length} {t('scout.actions','actions')}</span></div>
    <div className={styles.net}>{t('scout.net','NET')}</div>
    <div className={styles.court}>
      {COURT_ZONE_ORDER.map(zone => <div key={zone} className={`${styles.zone} ${currentZone === zone ? styles.zonePreview : ''}`}>
        <div className={styles.zoneHeading}><strong>{zone}</strong><span>{t(`zone.${zone}`)}</span></div>
        <div className={styles.markers}>
          {displayed.filter(event => event.originZone === zone).map(event => <button key={event.id} type="button"
            aria-label={t('scout.view_action','View action {{index}}: {{skill}}, {{result}}',{index:event.actionIndex ?? '',skill:t(skillKey(event.skill)),result:event.evaluation === 0 ? t('result.pass','Pass') : event.evaluation === 1 ? '+1' : '-1'})}
            className={`${styles.marker} ${selectedEventId === event.id ? styles.markerSelected : ''}`}
            data-result={event.evaluation} onClick={() => onInspect(event)}>
            <b>{event.actionIndex ?? '•'}</b><span>{t(skillKey(event.skill))}</span><em>{event.evaluation === 0 ? t('result.pass','Pass') : event.evaluation === 1 ? '+1' : '-1'}</em>
          </button>)}
          {currentZone === zone && <div className={styles.draftMarker}><span>{t('scout.draft','Draft')}</span><strong>{draft.skill ? t(skillKey(draft.skill)) : '…'}</strong></div>}
        </div>
      </div>)}
    </div>
    <div className={styles.mapLegend}><span role="status">{currentZone ? `${t('scout.selecting','Selecting')} Z${currentZone}` : t('scout.map_hint','Choose a zone to preview the action. Select a marker to inspect it.')}</span><span>{t('scout.zone_positions','Positions represent court zones')}</span></div>
  </section>;
}
