import { useTranslation } from 'react-i18next';
import type { ScoutingEvent } from '../../../core/scouting/ScoutingEvent';
import { COURT_ZONE_ORDER, skillKey } from '../rallyDisplay';
import styles from './VolleyballCourt.module.css';

export interface VolleyballCourtProps {
  mode: 'interactive-selector' | 'map';
  selectedZone?: number | null;
  previewZone?: number | null;
  onZoneSelect?: (zone: number) => void;
  // Map mode props:
  events?: ScoutingEvent[];
  teamId?: string;
  selectedEventId?: string;
  onInspectEvent?: (event: ScoutingEvent) => void;
  draft?: Partial<ScoutingEvent>;
  className?: string;
}

export function VolleyballCourt({
  mode,
  selectedZone,
  previewZone,
  onZoneSelect,
  events = [],
  teamId,
  selectedEventId,
  onInspectEvent,
  draft = {},
  className = ''
}: VolleyballCourtProps) {
  const { t } = useTranslation();
  const currentActiveZone = previewZone ?? selectedZone ?? draft.originZone ?? null;
  const displayedEvents = teamId ? events.filter((e) => e.teamId === teamId) : events;

  return (
    <div className={`${styles.courtContainer} ${className}`} data-court-mode={mode}>
      {/* NET Top Line */}
      <div className={styles.netBand}>
        <span>{t('scout.net', 'NET')}</span>
      </div>

      {/* Main Court Grid Surface */}
      <div className={styles.courtGrid}>
        {/* 3m Attack line */}
        <div className={styles.attackLine}>
          <span className={styles.attackLineLabel}>{t('scout.attack_line', '3m LINE')}</span>
        </div>

        {/* Lane dividers */}
        <div className={styles.laneDivider1} />
        <div className={styles.laneDivider2} />

        {/* 6 Zones ordered: Front [4, 3, 2], Back [5, 6, 1] */}
        {COURT_ZONE_ORDER.map((zone) => {
          const isActive = currentActiveZone === zone;
          const zoneEvents = displayedEvents.filter((e) => e.originZone === zone);
          const isDraftZone = draft.originZone === zone || (previewZone === zone && !draft.originZone);

          return (
            <div
              key={zone}
              className={`${styles.zoneCell} ${isActive ? styles.zoneActive : ''}`}
              data-zone={zone}
            >
              {mode === 'interactive-selector' ? (
                <button
                  type="button"
                  className={styles.zoneButton}
                  aria-pressed={isActive}
                  aria-label={`Z${zone} ${t(`zone.${zone}`)}`}
                  onClick={() => onZoneSelect?.(zone)}
                >
                  <b>Z{zone}</b>
                  <span>{t(`zone.${zone}`)}</span>
                </button>
              ) : (
                <>
                  <div className={styles.zoneMapHeading}>
                    <strong>{zone}</strong>
                    <span>{t(`zone.${zone}`)}</span>
                  </div>
                  <div className={styles.markersList}>
                    {zoneEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={`${styles.marker} ${selectedEventId === event.id ? styles.markerSelected : ''}`}
                        data-result={event.evaluation}
                        aria-label={t('scout.view_action', 'View action {{index}}: {{skill}}, {{result}}', {
                          index: event.actionIndex ?? '',
                          skill: t(skillKey(event.skill)),
                          result: event.evaluation === 0 ? t('result.pass', 'Pass') : event.evaluation === 1 ? '+1' : '-1'
                        })}
                        onClick={() => onInspectEvent?.(event)}
                      >
                        <b>{event.actionIndex ?? '•'}</b>
                        <span>{t(skillKey(event.skill))}</span>
                        <em>{event.evaluation === 0 ? t('result.pass', 'Pass') : event.evaluation === 1 ? '+1' : '-1'}</em>
                      </button>
                    ))}
                    {isDraftZone && (
                      <div className={styles.draftMarker}>
                        <span>{t('scout.draft', 'Draft')}</span>
                        <strong>{draft.skill ? t(skillKey(draft.skill)) : '…'}</strong>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Baseline Bottom */}
      <div className={styles.baseline} />
    </div>
  );
}
