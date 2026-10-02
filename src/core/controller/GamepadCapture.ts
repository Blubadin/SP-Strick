import type { RawGamepadSnapshot } from './RawGamepadSnapshot';

export type RawButtonCaptureResult =
  | { kind: 'captured'; index: number }
  | { kind: 'duplicate'; index: number };

export function getAssignedButtonIndices(
  buttons: Readonly<Record<string, number | undefined>>,
  exceptControl: string
): number[] {
  return Object.entries(buttons)
    .filter(([control, index]) => control !== exceptControl && Number.isInteger(index))
    .map(([, index]) => index as number);
}

/** Captures raw rising edges and enforces release of each captured button. */
export class RawButtonCapture {
  private previousPressed: boolean[] = [];
  private initialized = false;
  private awaitingReleaseIndex: number | null = null;

  /** Call when entering a listening step to baseline buttons that are already held. */
  public begin(snapshot: RawGamepadSnapshot | null): void {
    this.previousPressed = snapshot?.buttons.map((button) => button.pressed) ?? [];
    this.initialized = snapshot !== null;
    this.awaitingReleaseIndex = null;
  }

  /** Returns only a fresh press; a duplicate is reported so the caller can explain it. */
  public update(
    snapshot: RawGamepadSnapshot,
    assignedIndices: readonly number[] = []
  ): RawButtonCaptureResult | null {
    const currentPressed = snapshot.buttons.map((button) => button.pressed);
    if (!this.initialized) {
      this.previousPressed = currentPressed;
      this.initialized = true;
      return null;
    }

    if (this.awaitingReleaseIndex !== null) {
      const capturedIndex = this.awaitingReleaseIndex;
      this.previousPressed = currentPressed;
      if (!currentPressed[capturedIndex]) this.awaitingReleaseIndex = null;
      return null;
    }

    const index = currentPressed.findIndex(
      (pressed, buttonIndex) => pressed && !this.previousPressed[buttonIndex]
    );
    this.previousPressed = currentPressed;
    if (index < 0) return null;

    this.awaitingReleaseIndex = index;
    return assignedIndices.includes(index)
      ? { kind: 'duplicate', index }
      : { kind: 'captured', index };
  }
}

export interface AxisMovement {
  axisIndex: number;
  delta: number;
  inverted: boolean;
}

/** Finds a deliberate raw-axis movement relative to a captured neutral baseline. */
export class AxisDeltaDetector {
  private baseline: number[] | null = null;

  public begin(axes: readonly number[]): void {
    this.baseline = [...axes];
  }

  public detect(axes: readonly number[], threshold: number = 0.6): AxisMovement | null {
    if (!this.baseline) return null;

    let largest: AxisMovement | null = null;
    for (let index = 0; index < Math.min(axes.length, this.baseline.length); index++) {
      const delta = axes[index] - this.baseline[index];
      if (Math.abs(delta) > threshold && (!largest || Math.abs(delta) > Math.abs(largest.delta))) {
        largest = { axisIndex: index, delta, inverted: delta < 0 };
      }
    }
    return largest;
  }

  public reset(): void {
    this.baseline = null;
  }
}
