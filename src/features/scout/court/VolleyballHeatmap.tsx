import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScoutingEvent } from '../../../core/scouting/ScoutingEvent';
import {
  calculateTeamZoneDensity,
  zoneToCourtCell
} from './VolleyballCourtGeometry';
import { skillKey } from '../rallyDisplay';
import styles from './VolleyballHeatmap.module.css';

export interface VolleyballHeatmapProps {
  events: readonly ScoutingEvent[];
  teamA?: string;
  teamB?: string;
  activeTeam?: 'A' | 'B';
  draft?: Partial<ScoutingEvent>;
  previewZone?: number | null;
  selectedEventId?: string;
  onInspectEvent?: (event: ScoutingEvent) => void;
  className?: string;
}

const ALL_ZONES = [1, 2, 3, 4, 5, 6] as const;

function formatEventClock(ms?: number): string {
  if (ms === undefined) return '';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function VolleyballHeatmap({
  events,
  teamA = 'Team A',
  teamB = 'Team B',
  activeTeam = 'A',
  draft = {},
  previewZone,
  selectedEventId,
  onInspectEvent,
  className = ''
}: VolleyballHeatmapProps) {
  const { t } = useTranslation();
  const [inspectedZone, setInspectedZone] = useState<{
    teamSide: 'A' | 'B';
    zone: number;
  } | null>(null);

  const densityA = calculateTeamZoneDensity(events, 'A');
  const densityB = calculateTeamZoneDensity(events, 'B');
  const totalActions = densityA.totalCount + densityB.totalCount;

  // Active draft / preview zone indicators
  const currentDraftZone = previewZone ?? draft.originZone ?? null;
  const currentDraftTeam = activeTeam;

  const handleZoneClick = (teamSide: 'A' | 'B', zone: number) => {
    if (inspectedZone?.teamSide === teamSide && inspectedZone?.zone === zone) {
      setInspectedZone(null);
    } else {
      setInspectedZone({ teamSide, zone });
    }
  };

  const inspectedZoneEvents = inspectedZone
    ? events.filter(
        (e) =>
          e.teamId === inspectedZone.teamSide &&
          (e.originZone === inspectedZone.zone || e.targetZone === inspectedZone.zone)
      )
    : [];

  const allCourtCells = [
    ...ALL_ZONES.map((zone) => ({ teamSide: 'A' as const, zone })),
    ...ALL_ZONES.map((zone) => ({ teamSide: 'B' as const, zone }))
  ];

  return (
    <div className={`${styles.heatmapContainer} ${className}`} aria-label={t('scout.court_heatmap', 'Volleyball court heatmap')}>
      {/* Top Heading */}
      <div className={styles.teamHeading}>
        <span className={styles.teamBadge}>
          {teamA} ({densityA.totalCount})
        </span>
        <span>VS</span>
        <span className={styles.teamBadge}>
          {teamB} ({densityB.totalCount})
        </span>
      </div>

      {/* Main Full Court Graphic */}
      <div className={styles.courtSurface}>
        {/* Court Boundary Lines SVG */}
        <svg
          className={styles.courtSvg}
          viewBox="0 0 100 200"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Team A 3m attack line (y = 33.33% of 200 = 66.67) */}
          <line x1="0" y1="66.67" x2="100" y2="66.67" className={styles.attackLine} />
          {/* Center Net Line (y = 50% of 200 = 100) */}
          <line x1="0" y1="100" x2="100" y2="100" className={styles.netLine} />
          {/* Team B 3m attack line (y = 66.67% of 200 = 133.33) */}
          <line x1="0" y1="133.33" x2="100" y2="133.33" className={styles.attackLine} />
          {/* Vertical Lane Dividers (x = 33.33 and x = 66.67) */}
          <line x1="33.33" y1="0" x2="33.33" y2="200" className={styles.courtLine} />
          <line x1="66.67" y1="0" x2="66.67" y2="200" className={styles.courtLine} />
        </svg>

        {/* Center Net Band Overlay */}
        <div className={styles.netBand}>
          <span className={styles.netLabel}>{t('scout.net', 'NET')}</span>
        </div>

        {/* Interactive Zone Cells (4 rows × 3 cols) */}
        <div className={styles.cellsGrid}>
          {allCourtCells.map(({ teamSide, zone }) => {
            const cell = zoneToCourtCell(teamSide, zone);
            const density = teamSide === 'A' ? densityA : densityB;
            const count = density.countsByZone[zone] ?? 0;
            const intensity = density.intensityByZone[zone] ?? 0;
            const isDraft =
              currentDraftTeam === teamSide && currentDraftZone === zone;
            const isSelectedCell =
              inspectedZone?.teamSide === teamSide && inspectedZone?.zone === zone;
            const hasInspectedEvent = events.some(
              (e) =>
                e.id === selectedEventId &&
                e.teamId === teamSide &&
                e.originZone === zone
            );

            return (
              <button
                key={`${teamSide}-${zone}`}
                type="button"
                className={styles.zoneCell}
                style={{
                  gridRow: cell.row + 1,
                  gridColumn: cell.col + 1
                }}
                aria-selected={isSelectedCell}
                aria-label={`${teamSide === 'A' ? teamA : teamB} Z${zone}: ${count} ${t('scout.actions', 'actions')}`}
                onClick={() => handleZoneClick(teamSide, zone)}
              >
                {/* Soft Heat Glow */}
                {intensity > 0 && (
                  <span
                    className={styles.heatGlow}
                    style={{
                      '--heat-opacity': Math.min(0.85, intensity * 0.75 + 0.1)
                    } as React.CSSProperties}
                  />
                )}

                {/* Draft Zone Outline */}
                {isDraft && <span className={styles.draftRing} aria-label={t('scout.draft_zone', 'Draft zone')} />}

                {/* Selected Event Marker */}
                {hasInspectedEvent && (
                  <span className={styles.inspectedMarker} aria-label={t('scout.inspected_marker', 'Inspected action')} />
                )}

                <div className={styles.zoneMeta}>
                  <span className={styles.zoneBadge}>Z{zone}</span>
                  {count > 0 && <span className={styles.actionCount}>{count}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty State Caption */}
      {totalActions === 0 && (
        <p className={styles.emptyHeatmapHint}>
          {t('scout.heatmap_empty', 'Heatmap builds as actions are recorded')}
        </p>
      )}

      {/* Inspected Zone Detail Drawer */}
      {inspectedZone && (
        <section className={styles.detailSection} aria-label={t('scout.zone_details', 'Zone details')}>
          <div className={styles.detailHeader}>
            <strong>
              {inspectedZone.teamSide === 'A' ? teamA : teamB} · Z{inspectedZone.zone} ({inspectedZoneEvents.length}{' '}
              {t('scout.actions', 'actions')})
            </strong>
            <button
              type="button"
              className={styles.closeDetailBtn}
              onClick={() => setInspectedZone(null)}
              aria-label={t('common.close', 'Close')}
            >
              ✕
            </button>
          </div>

          <div className={styles.eventList}>
            {inspectedZoneEvents.length === 0 ? (
              <span className={styles.emptyHeatmapHint}>
                {t('scout.no_events_in_zone', 'No recorded actions in this zone.')}
              </span>
            ) : (
              inspectedZoneEvents.map((event) => {
                const isSelected = selectedEventId === event.id;
                const resultText =
                  event.evaluation === 1 ? '+1' : event.evaluation === -1 ? '−1' : t('result.pass', 'Pass');
                const timeText = formatEventClock(event.videoTimeMs);

                return (
                  <button
                    key={event.id}
                    type="button"
                    className={`${styles.eventRow} ${isSelected ? styles.eventRowSelected : ''}`}
                    onClick={() => onInspectEvent?.(event)}
                    aria-label={`Inspect ${t(skillKey(event.skill))} ${resultText}`}
                  >
                    <span>
                      <strong>#{event.actionIndex ?? '•'}</strong> {t(skillKey(event.skill))} <em>{resultText}</em>
                    </span>
                    {timeText && <time>{timeText}</time>}
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
