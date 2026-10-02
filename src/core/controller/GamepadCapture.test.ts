import { describe, expect, it } from 'vitest';
import type { RawGamepadSnapshot } from './RawGamepadSnapshot';
import { AxisDeltaDetector, getAssignedButtonIndices, RawButtonCapture } from './GamepadCapture';

function snapshot(pressed: boolean[], axes: number[] = []): RawGamepadSnapshot {
  return {
    id: 'Test Pad',
    index: 0,
    mapping: '',
    connected: true,
    timestamp: 1,
    buttons: pressed.map((isPressed) => ({
      pressed: isPressed,
      value: isPressed ? 1 : 0,
      touched: isPressed
    })),
    axes
  };
}

describe('RawButtonCapture', () => {
  it('captures only a new button press and waits for release before the next capture', () => {
    const capture = new RawButtonCapture();
    capture.begin(snapshot([false, false]));

    expect(capture.update(snapshot([true, false]))).toEqual({ kind: 'captured', index: 0 });
    expect(capture.update(snapshot([true, true]))).toBeNull();
    expect(capture.update(snapshot([false, true]))).toBeNull();
    expect(capture.update(snapshot([false, true]))).toBeNull();
    expect(capture.update(snapshot([false, false]))).toBeNull();
    expect(capture.update(snapshot([false, true]))).toEqual({ kind: 'captured', index: 1 });
  });

  it('uses the first observed snapshot as a baseline so a held button is not captured', () => {
    const capture = new RawButtonCapture();
    capture.begin(snapshot([true]));

    expect(capture.update(snapshot([true]))).toBeNull();
    expect(capture.update(snapshot([false]))).toBeNull();
    expect(capture.update(snapshot([true]))).toEqual({ kind: 'captured', index: 0 });
  });

  it('reports duplicate raw indices without treating them as a valid binding', () => {
    const capture = new RawButtonCapture();
    capture.begin(snapshot([false, false]));

    expect(capture.update(snapshot([false, true]), [1])).toEqual({ kind: 'duplicate', index: 1 });
  });
});

describe('getAssignedButtonIndices', () => {
  it('checks only previously captured wizard controls and excludes the current target', () => {
    const capturedWizardButtons = { FACE_SOUTH: 5, FACE_EAST: 2 };

    expect(getAssignedButtonIndices(capturedWizardButtons, 'FACE_WEST')).toEqual([5, 2]);
    expect(getAssignedButtonIndices(capturedWizardButtons, 'FACE_EAST')).toEqual([5]);
  });
});

describe('AxisDeltaDetector', () => {
  it('requires a baseline and movement greater than 0.6', () => {
    const detector = new AxisDeltaDetector();

    expect(detector.detect([0.9, 0])).toBeNull();
    detector.begin([0.1, 0]);
    expect(detector.detect([0.7, 0])).toBeNull();
    expect(detector.detect([0.71, 0])).toEqual({ axisIndex: 0, delta: 0.61, inverted: false });
  });

  it('selects the axis with the largest baseline-relative movement', () => {
    const detector = new AxisDeltaDetector();
    detector.begin([0, 0, 0]);

    expect(detector.detect([0.7, -0.8, 0.1])).toEqual({ axisIndex: 1, delta: -0.8, inverted: true });
  });
});
