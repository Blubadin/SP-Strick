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

export function ControllerHudFeedback({
  badge,
  seekState
}: {
  badge: ControllerBadge | null;
  seekState: SeekHudState | null;
}) {
  if (!badge && !seekState) return null;

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
      {seekState && (
        <div className={styles.seekOverlay} data-testid="seek-hud-overlay">
          <div className={styles.seekHeader}>
            {seekState.direction === 'backward' ? '◀ RS SEEK' : 'RS SEEK ▶'}
            <span>({seekState.speedMultiplier.toFixed(1)}×)</span>
          </div>
          <div className={styles.seekDelta}>
            {seekState.deltaMs >= 0 ? `+${(seekState.deltaMs / 1000).toFixed(1)}s` : `${(seekState.deltaMs / 1000).toFixed(1)}s`}
          </div>
          <div className={styles.seekTime}>{formatClock(seekState.currentTimeMs)}</div>
        </div>
      )}

      {badge && (
        <div className={styles.badge} data-testid="controller-hud-badge">
          <span className={styles.badgeTitle}>{badge.title}</span>
          {badge.value && <strong className={styles.badgeValue}>{badge.value}</strong>}
          {badge.isSuccess && <span className={styles.badgeCheck}>✓</span>}
        </div>
      )}
    </div>
  );
}
