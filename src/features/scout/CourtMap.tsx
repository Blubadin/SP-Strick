import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';
import { useTranslation } from 'react-i18next';
import { VolleyballCourt } from './court/VolleyballCourt';
import styles from './RallyDisplay.module.css';

export interface CourtMapProps {
  events: ScoutingEvent[];
  teamId: string;
  teamName: string;
  draft: Partial<ScoutingEvent>;
  previewZone?: number | null;
  selectedEventId?: string;
  onInspect: (event: ScoutingEvent) => void;
}

export function CourtMap({
  events,
  teamId,
  teamName,
  draft,
  previewZone,
  selectedEventId,
  onInspect
}: CourtMapProps) {
  const { t } = useTranslation();
  const displayed = events.filter((event) => event.teamId === teamId);
  const currentZone = previewZone ?? draft.originZone;

  return (
    <section className={styles.map} aria-label={t('scout.court_map', 'Court map')}>
      <div className={styles.mapHeading}>
        <strong>{teamName}</strong>
        <span>
          {t('scout.court_map', 'Court map')} · {displayed.length} {t('scout.actions', 'actions')}
        </span>
      </div>

      <div className={styles.courtMapWrapper}>
        <VolleyballCourt
          mode="map"
          events={events}
          teamId={teamId}
          draft={draft}
          previewZone={previewZone}
          selectedEventId={selectedEventId}
          onInspectEvent={onInspect}
        />
      </div>

      <div className={styles.mapLegend}>
        <span role="status">
          {currentZone
            ? `${t('scout.selecting', 'Selecting')} Z${currentZone}`
            : t('scout.map_hint', 'Choose a zone to preview the action. Select a marker to inspect it.')}
        </span>
        <span>{t('scout.zone_positions', 'Positions represent court zones')}</span>
      </div>
    </section>
  );
}
