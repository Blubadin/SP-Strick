import { describe, it, expect, beforeEach } from 'vitest';
import { applyDeadzone } from './StickNormalizer';
import { ButtonStateMachine } from './ButtonStateMachine';
import {
  getHysteresisSector,
  getBaseSector,
  angularDifference,
  DEFAULT_RADIAL_CONFIG
} from './RadialSelector';
import { detectProfile } from './ControllerProfile';

describe('StickNormalizer (applyDeadzone)', () => {
  it('suppresses input within deadzone', () => {
    const res = applyDeadzone(0.1, 0.1, 0.2);
    expect(res.magnitude).toBe(0);
    expect(res.x).toBe(0);
    expect(res.y).toBe(0);
  });

  it('normalizes magnitude and angle correctly outside deadzone', () => {
    // Exact right (X=1, Y=0)
    const right = applyDeadzone(1.0, 0.0, 0.2);
    expect(right.magnitude).toBe(1.0);
    expect(right.angle).toBe(0);
    expect(right.x).toBe(1.0);

    // Exact down (X=0, Y=1)
    const down = applyDeadzone(0.0, 1.0, 0.2);
    expect(down.magnitude).toBe(1.0);
    expect(down.angle).toBe(90);

    // Exact left (X=-1, Y=0)
    const left = applyDeadzone(-1.0, 0.0, 0.2);
    expect(left.magnitude).toBe(1.0);
    expect(left.angle).toBe(180);

    // Exact up (X=0, Y=-1)
    const up = applyDeadzone(0.0, -1.0, 0.2);
    expect(up.magnitude).toBe(1.0);
    expect(up.angle).toBe(270);
  });

  it('handles axis inversion', () => {
    const res = applyDeadzone(1.0, -1.0, 0.1, true, true);
    // inverted: X becomes -1.0, Y becomes 1.0 (down-left)
    expect(res.angle).toBe(135);
  });
});

describe('RadialSelector (Sector & Hysteresis)', () => {
  it('calculates base sector correctly for 8 sectors', () => {
    // 8 sectors = 45 degrees each.
    // Sector 0 is centered at 0 deg: covers [337.5, 22.5]
    expect(getBaseSector(0, 8)).toBe(0);
    expect(getBaseSector(15, 8)).toBe(0);
    expect(getBaseSector(355, 8)).toBe(0);

    // Sector 1 centered at 45 deg: covers [22.5, 67.5]
    expect(getBaseSector(45, 8)).toBe(1);
    expect(getBaseSector(30, 8)).toBe(1);

    // Sector 2 centered at 90 deg
    expect(getBaseSector(90, 8)).toBe(2);
  });

  it('calculates angular difference with wrap-around near 0/360', () => {
    expect(angularDifference(10, 350)).toBe(20);
    expect(angularDifference(350, 10)).toBe(-20);
    expect(angularDifference(180, 0)).toBe(180);
  });

  it('requires activation magnitude to initiate sector selection', () => {
    // Low magnitude (< 0.55) returns null
    const noSelection = getHysteresisSector(45, 0.4, 8, null, DEFAULT_RADIAL_CONFIG);
    expect(noSelection).toBeNull();

    // High magnitude (>= 0.55) selects sector
    const selected = getHysteresisSector(45, 0.6, 8, null, DEFAULT_RADIAL_CONFIG);
    expect(selected).toBe(1);
  });

  it('cancels selection if stick returns to center neutral', () => {
    // Currently at sector 1, magnitude drops below deactivation threshold (0.25)
    const cancelled = getHysteresisSector(45, 0.15, 8, 1, DEFAULT_RADIAL_CONFIG);
    expect(cancelled).toBeNull();
  });

  it('prevents jitter across boundary using hysteresis', () => {
    // Sector 0 boundary is 22.5 degrees.
    // At 24 degrees (just across boundary), without hysteresis it would be sector 1.
    // But with hysteresis (5 deg), sector 0 is held up to 27.5 deg!
    const held = getHysteresisSector(24, 0.8, 8, 0, DEFAULT_RADIAL_CONFIG);
    expect(held).toBe(0);

    // Once decisively crossing boundary beyond hysteresis (e.g. 29 degrees), it switches to sector 1
    const switched = getHysteresisSector(29, 0.8, 8, 0, DEFAULT_RADIAL_CONFIG);
    expect(switched).toBe(1);
  });
});

describe('ButtonStateMachine', () => {
  let bsm: ButtonStateMachine;
  const mapping = { FACE_SOUTH: 0, FACE_EAST: 1 };

  beforeEach(() => {
    bsm = new ButtonStateMachine();
  });

  it('detects pressedThisFrame and held', () => {
    // Frame 1: button 0 pressed
    const frame1 = bsm.update([{ pressed: true, value: 1 }], mapping);
    expect(frame1.buttons.FACE_SOUTH.pressed).toBe(true);
    expect(frame1.buttons.FACE_SOUTH.pressedThisFrame).toBe(true);
    expect(frame1.buttons.FACE_SOUTH.held).toBe(false);

    // Frame 2: button 0 remains held
    const frame2 = bsm.update([{ pressed: true, value: 1 }], mapping);
    expect(frame2.buttons.FACE_SOUTH.pressed).toBe(true);
    expect(frame2.buttons.FACE_SOUTH.pressedThisFrame).toBe(false);
    expect(frame2.buttons.FACE_SOUTH.held).toBe(true);
  });

  it('detects releasedThisFrame', () => {
    // Frame 1: pressed
    bsm.update([{ pressed: true, value: 1 }], mapping);

    // Frame 2: released
    const frame2 = bsm.update([{ pressed: false, value: 0 }], mapping);
    expect(frame2.buttons.FACE_SOUTH.pressed).toBe(false);
    expect(frame2.buttons.FACE_SOUTH.releasedThisFrame).toBe(true);
    expect(frame2.buttons.FACE_SOUTH.held).toBe(false);
  });

  it('resets state completely on disconnect', () => {
    // Pressed before disconnect
    bsm.update([{ pressed: true, value: 1 }], mapping);
    bsm.reset();

    // Reconnected while still pressed -> treated as fresh press, not stuck
    const frameAfterReset = bsm.update([{ pressed: true, value: 1 }], mapping);
    expect(frameAfterReset.buttons.FACE_SOUTH.pressedThisFrame).toBe(true);
    expect(frameAfterReset.buttons.FACE_SOUTH.held).toBe(false);
  });
});

describe('Controller Profile Detection', () => {
  it('detects Xbox controller by ID pattern', () => {
    const prof = detectProfile('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', 'standard');
    expect(prof.type).toBe('xbox');
  });

  it('detects DualSense controller by ID pattern', () => {
    const prof = detectProfile('DualSense Wireless Controller (054c:0ce6)', 'standard');
    expect(prof.type).toBe('dualsense');
  });

  it('falls back to Standard profile for generic standard controllers', () => {
    const prof = detectProfile('Generic USB Joystick', 'standard');
    expect(prof.type).toBe('standard');
  });
});
