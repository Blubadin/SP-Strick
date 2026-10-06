import styles from './ControllerHudFeedback.module.css';

export interface ControllerBadge {
  title: string;
  value?: string;
  isSuccess?: boolean;
}

export interface SeekHudState {
  direction: 'backward' | 'forward';
  deltaMs: number;
  speedMultiplier: number;
  currentTimeMs: number;
}

export interface ActionFlash {
  id: string;
  category: string;
  value: string;
  secondary?: string;
}

export function ControllerHudFeedback({
  badge,
  seekState,
  actionFlash
}: {
  badge: ControllerBadge | null;
  seekState: SeekHudState | null;
  actionFlash?: ActionFlash | null;
}) {
  if (!badge && !seekState && !actionFlash) return null;

  const formatClock = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const sec = totalSec % 60;
    const min = Math.floor(totalSec / 60) % 60;
    const hr = Math.floor(totalSec / 3600);
    const clock = hr > 0
      ? `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${clock}.${tenths}`;
  };

  return (
    <div className={styles.container} role="status" aria-live="polite">
      {/* Video Analog Scrub / Seek HUD */}
      {seekState && (
        <div className={styles.seekOverlay} data-testid="seek-hud-overlay">
          <div className={styles.seekHeader}>
            <span>{seekState.direction === 'backward' ? '◀ REWIND' : 'FORWARD ▶'}</span>
            <span className={styles.seekSpeed}>({seekState.speedMultiplier.toFixed(1)}×)</span>
          </div>
          <div className={styles.seekDelta}>
            {seekState.deltaMs >= 0 ? `+${(seekState.deltaMs / 1000).toFixed(1)}s` : `${(seekState.deltaMs / 1000).toFixed(1)}s`}
          </div>
          <div className={styles.seekTime}>{formatClock(seekState.currentTimeMs)}</div>
        </div>
      )}

      {/* Game-Like Action Confirmation Flash */}
      {actionFlash && (
        <div key={actionFlash.id} className={styles.actionFlash} data-testid="action-confirmation-flash">
          <span className={styles.flashCategory}>{actionFlash.category}</span>
          <strong className={styles.flashValue}>{actionFlash.value}</strong>
          {actionFlash.secondary && <span className={styles.flashSecondary}>{actionFlash.secondary}</span>}
        </div>
      )}

      {/* Standard status badge (when no active action flash) */}
      {badge && !actionFlash && (
        <div className={styles.badge} data-testid="controller-hud-badge">
          <span className={styles.badgeTitle}>{badge.title}</span>
          {badge.value && <strong className={styles.badgeValue}>{badge.value}</strong>}
          {badge.isSuccess && <span className={styles.badgeCheck}>✓</span>}
        </div>
      )}
    </div>
  );
}
