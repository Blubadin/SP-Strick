import type { AxisState, SemanticControl } from '../../core/controller/ControllerTypes';
import { hapticManager } from '../../core/controller/HapticManager';

export type HoldSelectorPhase =
  | 'CLOSED'
  | 'HOLDING_IDLE'
  | 'HOLDING_SELECTION'
  | 'COMMITTING'
  | 'CANCELLING';

export interface HoldSelectorOptions<T> {
  onCommit: (item: T) => void;
  onCancel: () => void;
  onHighlight?: (item: T | null) => void;
  isZone?: boolean;
}

export const HOLD_SELECTOR_CONFIG = {
  PREVIEW_THRESHOLD_RADIAL: 0.45,
  PREVIEW_THRESHOLD_ZONE: 0.35
};

export class HoldSelectorEngine<T> {
  private phase: HoldSelectorPhase = 'CLOSED';
  private category: string | null = null;
  private openerControl: SemanticControl | null = null;
  private currentSelection: T | null = null;
  private lastHighlightedOption: T | null = null;
  private options: HoldSelectorOptions<T>;

  constructor(options: HoldSelectorOptions<T>) {
    this.options = options;
  }

  public getPhase(): HoldSelectorPhase {
    return this.phase;
  }

  public getCategory(): string | null {
    return this.category;
  }

  public getOpenerControl(): SemanticControl | null {
    return this.openerControl;
  }

  public getCurrentSelection(): T | null {
    return this.currentSelection;
  }

  public getLastHighlightedOption(): T | null {
    return this.lastHighlightedOption;
  }

  public isOpen(): boolean {
    return this.phase === 'HOLDING_IDLE' || this.phase === 'HOLDING_SELECTION';
  }

  public open(category: string, openerControl: SemanticControl, isZone: boolean = false): void {
    this.phase = 'HOLDING_IDLE';
    this.category = category;
    this.openerControl = openerControl;
    this.options.isZone = isZone;
    this.currentSelection = null;
    this.lastHighlightedOption = null;
    this.options.onHighlight?.(null);
  }

  public updateStick(stick: AxisState, resolveItem: (stick: AxisState) => T | null): void {
    if (!this.isOpen()) return;

    const isZone = Boolean(this.options.isZone);
    const threshold = isZone
      ? HOLD_SELECTOR_CONFIG.PREVIEW_THRESHOLD_ZONE
      : HOLD_SELECTOR_CONFIG.PREVIEW_THRESHOLD_RADIAL;

    const isIntentional = isZone
      ? Math.abs(stick.y) >= threshold || Math.abs(stick.x) >= threshold
      : stick.magnitude >= threshold;

    if (isIntentional) {
      const item = resolveItem(stick);
      if (item !== null && item !== this.currentSelection) {
        this.currentSelection = item;
        this.lastHighlightedOption = item;
        this.phase = 'HOLDING_SELECTION';
        hapticManager.tick();
        this.options.onHighlight?.(item);
      }
    }
    // When stick returns to center or neutral:
    // Maintain lastHighlightedOption — do NOT clear, commit, or cancel.
  }

  /**
   * Called when the physical button that opened this selector is released.
   * If a selection was previewed, it commits. If released without preview, it cancels.
   */
  public onOpenerReleased(): void {
    if (!this.isOpen()) return;

    if (this.lastHighlightedOption !== null) {
      this.phase = 'COMMITTING';
      hapticManager.success();
      const committed = this.lastHighlightedOption;
      this.close();
      this.options.onCommit(committed);
    } else {
      this.phase = 'CANCELLING';
      this.close();
      this.options.onCancel();
    }
  }

  public cancel(): void {
    if (!this.isOpen()) return;
    this.phase = 'CANCELLING';
    this.close();
    this.options.onCancel();
  }

  public commit(item: T): void {
    this.phase = 'COMMITTING';
    hapticManager.success();
    this.close();
    this.options.onCommit(item);
  }

  private close(): void {
    this.phase = 'CLOSED';
    this.category = null;
    this.openerControl = null;
    this.currentSelection = null;
    this.lastHighlightedOption = null;
  }

  public destroy(): void {
    this.close();
  }
}
