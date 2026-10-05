import type { AxisState } from '../../core/controller/ControllerTypes';
import { hapticManager } from '../../core/controller/HapticManager';

export type SelectorLifecyclePhase =
  | 'CLOSED'
  | 'OPEN_WAITING'
  | 'ARMED'
  | 'RETURNING'
  | 'COMMITTED'
  | 'CANCELLED';

export const TRANSIENT_SELECTOR_CONFIG = {
  IDLE_TIMEOUT_MS: 1000,
  ARM_THRESHOLD_RADIAL: 0.55,
  ARM_THRESHOLD_ZONE: 0.35,
  RELEASE_THRESHOLD: 0.22,
  NEUTRAL_HOLD_MS: 90,
  FAILSAFE_TIMEOUT_MS: 3500
};

export interface TransientSelectorOptions<T> {
  onCommit: (item: T) => void;
  onCancel: () => void;
  onHighlight?: (item: T | null) => void;
  isZone?: boolean;
}

export class TransientSelectorEngine<T> {
  private phase: SelectorLifecyclePhase = 'CLOSED';
  private category: string | null = null;
  private currentSelection: T | null = null;
  private lastValidSelection: T | null = null;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private neutralTimer: ReturnType<typeof setTimeout> | null = null;
  private failsafeTimer: ReturnType<typeof setTimeout> | null = null;

  private options: TransientSelectorOptions<T>;

  constructor(options: TransientSelectorOptions<T>) {
    this.options = options;
  }

  public getPhase(): SelectorLifecyclePhase {
    return this.phase;
  }

  public getCategory(): string | null {
    return this.category;
  }

  public getCurrentSelection(): T | null {
    return this.currentSelection;
  }

  public getLastValidSelection(): T | null {
    return this.lastValidSelection;
  }

  public isOpen(): boolean {
    return this.phase !== 'CLOSED' && this.phase !== 'COMMITTED' && this.phase !== 'CANCELLED';
  }

  public open(category: string, isZone: boolean = false): void {
    this.clearAllTimers();
    this.options.isZone = isZone;
    this.category = category;
    this.currentSelection = null;
    this.lastValidSelection = null;
    this.phase = 'OPEN_WAITING';
    this.options.onHighlight?.(null);

    // 1000ms idle timeout: if stick is not moved, close without committing
    this.idleTimer = setTimeout(() => {
      if (this.phase === 'OPEN_WAITING') {
        this.cancel();
      }
    }, TRANSIENT_SELECTOR_CONFIG.IDLE_TIMEOUT_MS);
  }

  public cancel(): void {
    this.clearAllTimers();
    if (this.isOpen()) {
      this.phase = 'CANCELLED';
      this.options.onCancel();
      this.phase = 'CLOSED';
      this.category = null;
      this.currentSelection = null;
      this.lastValidSelection = null;
    }
  }

  public commit(item: T): void {
    this.clearAllTimers();
    this.phase = 'COMMITTED';
    hapticManager.success();
    this.options.onCommit(item);
    this.phase = 'CLOSED';
    this.category = null;
    this.currentSelection = null;
    this.lastValidSelection = null;
  }

  public updateStick(stick: AxisState, resolveItem: (stick: AxisState) => T | null): void {
    if (!this.isOpen()) return;

    const isZone = Boolean(this.options.isZone);
    const armThreshold = isZone
      ? TRANSIENT_SELECTOR_CONFIG.ARM_THRESHOLD_ZONE
      : TRANSIENT_SELECTOR_CONFIG.ARM_THRESHOLD_RADIAL;
    const releaseThreshold = TRANSIENT_SELECTOR_CONFIG.RELEASE_THRESHOLD;

    const isNeutral = isZone
      ? Math.abs(stick.x) < releaseThreshold && Math.abs(stick.y) < releaseThreshold
      : stick.magnitude < releaseThreshold;

    const isIntentional = isZone
      ? Math.abs(stick.y) >= armThreshold || Math.abs(stick.x) >= armThreshold
      : stick.magnitude >= armThreshold;

    if (this.phase === 'OPEN_WAITING') {
      if (isIntentional) {
        if (this.idleTimer !== null) {
          clearTimeout(this.idleTimer);
          this.idleTimer = null;
        }

        this.phase = 'ARMED';

        // 3.5s failsafe timer to prevent impossible stuck states
        this.failsafeTimer = setTimeout(() => {
          if (this.phase === 'ARMED' || this.phase === 'RETURNING') {
            this.cancel();
          }
        }, TRANSIENT_SELECTOR_CONFIG.FAILSAFE_TIMEOUT_MS);

        const item = resolveItem(stick);
        if (item !== null) {
          this.currentSelection = item;
          this.lastValidSelection = item;
          hapticManager.tick();
          this.options.onHighlight?.(item);
        }
      }
      return;
    }

    if (this.phase === 'ARMED') {
      if (isNeutral) {
        this.phase = 'RETURNING';
        this.neutralTimer = setTimeout(() => {
          if (this.phase === 'RETURNING') {
            if (this.lastValidSelection !== null) {
              this.commit(this.lastValidSelection);
            } else {
              this.cancel();
            }
          }
        }, TRANSIENT_SELECTOR_CONFIG.NEUTRAL_HOLD_MS);
      } else {
        const item = resolveItem(stick);
        if (item !== null && item !== this.currentSelection) {
          this.currentSelection = item;
          this.lastValidSelection = item;
          hapticManager.tick();
          this.options.onHighlight?.(item);
        }
      }
      return;
    }

    if (this.phase === 'RETURNING') {
      if (!isNeutral) {
        // Stick left neutral before hold timer expired - return to ARMED
        if (this.neutralTimer !== null) {
          clearTimeout(this.neutralTimer);
          this.neutralTimer = null;
        }
        this.phase = 'ARMED';
        const item = resolveItem(stick);
        if (item !== null && item !== this.currentSelection) {
          this.currentSelection = item;
          this.lastValidSelection = item;
          hapticManager.tick();
          this.options.onHighlight?.(item);
        }
      }
    }
  }

  private clearAllTimers(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.neutralTimer !== null) {
      clearTimeout(this.neutralTimer);
      this.neutralTimer = null;
    }
    if (this.failsafeTimer !== null) {
      clearTimeout(this.failsafeTimer);
      this.failsafeTimer = null;
    }
  }

  public destroy(): void {
    this.clearAllTimers();
    this.phase = 'CLOSED';
    this.category = null;
  }
}
