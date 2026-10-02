import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { applyDeadzone } from './StickNormalizer';
import { ButtonStateMachine } from './ButtonStateMachine';
import {
  getHysteresisSector,
  getBaseSector,
  angularDifference,
  DEFAULT_RADIAL_CONFIG
} from './RadialSelector';
import { detectProfile, STANDARD_PROFILE, XBOX_PROFILE, validateControllerProfile } from './ControllerProfile';
import type { ControllerProfile } from './ControllerTypes';
import { useControllerStore } from './ControllerStore';
import { hapticManager } from './HapticManager';

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

  it('reports a pressed edge for every semantic control that shares an index', () => {
    const duplicateMapping = { FACE_SOUTH: 0, FACE_EAST: 0 } as const;
    const frame = bsm.update([{ pressed: true, value: 1 }], duplicateMapping);

    expect(frame.buttons.FACE_SOUTH.pressedThisFrame).toBe(true);
    expect(frame.buttons.FACE_EAST.pressedThisFrame).toBe(true);
  });
});

describe('Controller Store', () => {
  beforeEach(() => {
    useControllerStore.setState({
      profile: STANDARD_PROFILE,
      profileSelectionMode: 'automatic',
      customProfiles: [],
      hapticsEnabled: true
    });
    hapticManager.setEnabled(true);
  });

  afterEach(() => {
    useControllerStore.getState().setHapticsEnabled(true);
    vi.unstubAllGlobals();
  });

  it('rejects custom profiles with duplicate physical button bindings', () => {
    const duplicateProfile = {
      ...STANDARD_PROFILE,
      id: 'custom-duplicate',
      name: 'Duplicate buttons',
      builtIn: false,
      buttons: { ...STANDARD_PROFILE.buttons, FACE_EAST: STANDARD_PROFILE.buttons.FACE_SOUTH }
    };

    expect(useControllerStore.getState().addCustomProfile(duplicateProfile)).toBe(false);
    expect(useControllerStore.getState().customProfiles).toEqual([]);
  });

  it('hydrates only unique valid custom profiles and re-detects one for the connected device', () => {
    useControllerStore.getState().setConnected(true, 'Hydration Test Pad', 0, null, '');
    const validProfile: ControllerProfile = {
      ...STANDARD_PROFILE,
      id: 'custom-hydrated',
      name: 'Hydrated profile',
      type: 'custom',
      detectedIdPatterns: ['Hydration Test Pad'],
      builtIn: false
    };
    const invalidProfile: ControllerProfile = {
      ...validProfile,
      id: 'custom-invalid',
      buttons: { ...validProfile.buttons, FACE_EAST: validProfile.buttons.FACE_SOUTH }
    };

    const hydrated = useControllerStore.getState().hydrateCustomProfiles([
      validProfile,
      invalidProfile,
      XBOX_PROFILE,
      { ...validProfile, name: 'Duplicate id' }
    ]);

    expect(hydrated).toBe(1);
    expect(useControllerStore.getState().customProfiles).toEqual([validProfile]);
    expect(useControllerStore.getState().profile).toBe(validProfile);
  });

  it('returns validation errors for malformed profile data instead of throwing', () => {
    const malformed = {} as ControllerProfile;

    expect(() => validateControllerProfile(malformed)).not.toThrow();
    expect(validateControllerProfile(malformed).valid).toBe(false);
  });

  it('rejects unknown semantic controls in hydrated profile mappings', () => {
    const malformed = {
      ...STANDARD_PROFILE,
      id: 'custom-unknown-control',
      builtIn: false,
      buttons: { ...STANDARD_PROFILE.buttons, UNKNOWN_CONTROL: 18 }
    } as unknown as ControllerProfile;

    expect(validateControllerProfile(malformed).valid).toBe(false);
  });

  it('keeps built-in profiles immutable through custom profile mutations', () => {
    useControllerStore.getState().setProfile(XBOX_PROFILE);
    useControllerStore.getState().updateCustomProfile({ ...XBOX_PROFILE, name: 'Changed' });
    useControllerStore.getState().deleteCustomProfile(XBOX_PROFILE.id);

    expect(XBOX_PROFILE.name).toBe('Xbox Wireless Controller');
    expect(useControllerStore.getState().profile).toBe(XBOX_PROFILE);
    expect(Object.isFrozen(XBOX_PROFILE.buttons)).toBe(true);
  });

  it('synchronizes the haptic manager when haptics are disabled', () => {
    useControllerStore.getState().setHapticsEnabled(false);

    expect(useControllerStore.getState().hapticsEnabled).toBe(false);
    expect(hapticManager.isEnabled()).toBe(false);
  });

  it('resolves the active connected Gamepad for a haptic call without an explicit argument', async () => {
    const playEffect = vi.fn().mockResolvedValue('complete');
    const gamepad = {
      id: 'Haptic Test Pad',
      index: 1,
      mapping: 'standard',
      connected: true,
      timestamp: 100,
      buttons: [],
      axes: [],
      vibrationActuator: { playEffect },
      hapticActuators: []
    } as unknown as Gamepad;
    useControllerStore.setState({
      state: {
        connected: true,
        id: gamepad.id,
        index: 1,
        mapping: 'standard',
        buttons: useControllerStore.getState().state.buttons,
        leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
        rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
        hapticActuator: null
      }
    });
    vi.stubGlobal('navigator', { getGamepads: () => [null, gamepad] });

    await hapticManager.success();

    expect(playEffect).toHaveBeenCalledOnce();
  });

  it('does not vibrate when the synchronized haptic preference is disabled', async () => {
    const playEffect = vi.fn().mockResolvedValue('complete');
    const gamepad = {
      id: 'Haptic Test Pad', index: 1, mapping: 'standard', connected: true,
      timestamp: 100, buttons: [], axes: [],
      vibrationActuator: { playEffect }, hapticActuators: []
    } as unknown as Gamepad;
    useControllerStore.setState({
      state: {
        ...useControllerStore.getState().state,
        connected: true,
        id: gamepad.id,
        index: 1
      }
    });
    useControllerStore.getState().setHapticsEnabled(false);
    vi.stubGlobal('navigator', { getGamepads: () => [null, gamepad] });

    await hapticManager.success();

    expect(playEffect).not.toHaveBeenCalled();
  });

  it('reports haptics unavailable when the active Gamepad no longer reports connected', () => {
    const gamepad = {
      id: 'Disconnected Haptic Pad', index: 1, mapping: 'standard', connected: false,
      timestamp: 100, buttons: [], axes: [],
      vibrationActuator: { playEffect: vi.fn() }, hapticActuators: []
    } as unknown as Gamepad;
    useControllerStore.setState({
      state: { ...useControllerStore.getState().state, connected: true, id: gamepad.id, index: 1 }
    });
    vi.stubGlobal('navigator', { getGamepads: () => [null, gamepad] });

    expect(hapticManager.isAvailable()).toBe(false);
  });

  it('stores the actual Gamepad mapping metadata supplied during connection', () => {
    useControllerStore.getState().setConnected(true, 'Unmapped USB Pad', 2, null, '');

    expect(useControllerStore.getState().state.mapping).toBe('');
  });

  it('preserves a manually selected custom profile when the controller reconnects', () => {
    const customProfile = {
      ...STANDARD_PROFILE,
      id: 'custom-manual',
      name: 'Manual profile',
      builtIn: false
    };
    useControllerStore.getState().setProfile(customProfile);

    useControllerStore.getState().setConnected(true, 'Xbox Wireless Controller', 0, null, 'standard');

    expect(useControllerStore.getState().profile).toBe(customProfile);
  });

  it('clears stale button edges and stick values when a controller connects', () => {
    useControllerStore.getState().updateState({
      buttons: {
        ...useControllerStore.getState().state.buttons,
        FACE_SOUTH: { pressed: true, pressedThisFrame: true, releasedThisFrame: false, held: false }
      },
      leftStick: { x: 0.5, y: 0, magnitude: 0.5, angle: 0 },
      rightStick: { x: 0, y: 0.5, magnitude: 0.5, angle: 90 }
    });

    useControllerStore.getState().setConnected(true, 'Generic Pad', 0, null, 'standard');

    expect(useControllerStore.getState().state.buttons.FACE_SOUTH.pressedThisFrame).toBe(false);
    expect(useControllerStore.getState().state.leftStick.magnitude).toBe(0);
    expect(useControllerStore.getState().state.rightStick.magnitude).toBe(0);
  });

  it('rejects invalid deadzones and tunes a copy without mutating built-in profiles', () => {
    useControllerStore.getState().setProfile(XBOX_PROFILE);
    useControllerStore.getState().setDeadzone(1.2);
    expect(useControllerStore.getState().profile.leftStick.deadzone).toBe(0.2);

    useControllerStore.getState().setDeadzone(0.35);

    expect(useControllerStore.getState().profile.leftStick.deadzone).toBe(0.35);
    expect(XBOX_PROFILE.leftStick.deadzone).toBe(0.2);
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
