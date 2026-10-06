import type { ScoutingEvent } from '../../core/scouting/ScoutingEvent';
import { useTranslation } from 'react-i18next';
import { VolleyballHeatmap } from './court/VolleyballHeatmap';
import styles from './RallyDisplay.module.css';

export interface CourtMapProps {
  events: ScoutingEvent[];
  teamId: string;
  teamName: string;
  teamA?: string;
  teamB?: string;
  draft: Partial<ScoutingEvent>;
  previewZone?: number | null;
  selectedEventId?: string;
  onInspect: (event: ScoutingEvent) => void;
}

export function CourtMap({
  events,
  teamId,
  teamName,
  teamA,
  teamB,
  draft,
  previewZone,
  selectedEventId,
  onInspect
}: CourtMapProps) {
  const { t } = useTranslation();
  const currentZone = previewZone ?? draft.originZone;
  const resolvedTeamA = teamA || (teamId === 'A' ? teamName : t('team.a', 'Team A'));
  const resolvedTeamB = teamB || (teamId === 'B' ? teamName : t('team.b', 'Team B'));

  return (
    <section className={styles.map} aria-label={t('scout.court_heatmap', 'Court heatmap')}>
      <div className={styles.courtMapWrapper}>
        <VolleyballHeatmap
          events={events}
          teamA={resolvedTeamA}
          teamB={resolvedTeamB}
          activeTeam={teamId as 'A' | 'B'}
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
            : t('scout.heatmap_hint', 'Select any zone to inspect actions. Draft zone is highlighted live.')}
        </span>
        <span>{t('scout.zone_positions', 'Positions represent court zones')}</span>
      </div>
    </section>
  );
}
