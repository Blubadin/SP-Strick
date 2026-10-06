import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForGamepadConnections } from './GamepadDetector';
import { setDirectVideoSeekEnabled, setVideoModifierContextEnabled, startGamepadPolling, stopGamepadPolling } from './GamepadPoller';
import { intentDispatcher } from './ControllerIntent';
import { STANDARD_PROFILE } from './ControllerProfile';
import { useControllerStore } from './ControllerStore';
import { createInitialButtonMap } from './ButtonStateMachine';
import { usePreferencesStore, DEFAULT_PREFERENCES } from '../preferences/PreferencesStore';
import { rawGamepadSnapshotStore } from './RawGamepadSnapshot';

function makeGamepad() {
  return {
    id: 'Test Standard Pad',
    index: 0,
    mapping: 'standard',
    connected: true,
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
    vibrationActuator: null,
    hapticActuators: []
  } as unknown as Gamepad;
}

describe('GamepadPoller state publication', () => {
  let gamepad: Gamepad;
  let stepFrame: (timestamp?: number) => void;
  let cleanupDetector: (() => void) | null;
  let unsubscribe: (() => void) | null;
  let intents: string[];
  let emitGamepadEvent: (type: string) => void;

  beforeEach(() => {
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES });
    setVideoModifierContextEnabled(false);
    setDirectVideoSeekEnabled(false);
    gamepad = makeGamepad();
    const callbacks: Array<FrameRequestCallback> = [];
    vi.stubGlobal('navigator', { getGamepads: () => [gamepad] });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const listeners = new Map<string, (event: Event) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type)
    });
    emitGamepadEvent = (type: string) =>
      listeners.get(type)?.({ gamepad } as unknown as Event);
    stepFrame = (timestamp = 0) => callbacks.shift()?.(timestamp);
    cleanupDetector = null;
    intents = [];
    useControllerStore.setState({
      profile: STANDARD_PROFILE,
      profileSelectionMode: 'automatic',
      state: {
        connected: false,
        id: null,
        index: null,
        mapping: null,
        buttons: createInitialButtonMap(),
        leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
        rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
        hapticActuator: null
      }
    });
    unsubscribe = intentDispatcher.subscribe((intent) => intents.push(intent.type));
  });

  afterEach(() => {
    stopGamepadPolling();
    cleanupDetector?.();
    unsubscribe?.();
    rawGamepadSnapshotStore.reset();
    vi.unstubAllGlobals();
  });

  it('routes trigger and Pass shortcuts once per press', () => {
    cleanupDetector = listenForGamepadConnections();
    startGamepadPolling();
    stepFrame();
    for (const index of [4, 7, 15]) {
      (gamepad.buttons as GamepadButton[])[index] = { pressed: true, touched: true, value: 1 };
    }
    stepFrame();
    stepFrame();
    expect(intents).toEqual(expect.arrayContaining([
      'OPEN_RADIAL', 'QUICK_RESULT_NEUTRAL'
    ]));
    expect(intents.filter(type => type === 'QUICK_RESULT_NEUTRAL')).toHaveLength(2);
    expect(intents.filter(type => type === 'OPEN_RADIAL')).toHaveLength(1);
    expect(intents).toHaveLength(3);
  });

  it('toggles focus mode on VIEW tap', () => {
    cleanupDetector = listenForGamepadConnections();
    startGamepadPolling();
    stepFrame(0);
    (gamepad.buttons as GamepadButton[])[8] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    expect(intents).toContain('TOGGLE_FOCUS_MODE');
  });

  it('toggles video playback on quick R1 release without chord', () => {
    cleanupDetector = listenForGamepadConnections();
    startGamepadPolling();
    stepFrame(0);
    // Press R1 (button 5)
    (gamepad.buttons as GamepadButton[])[5] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    expect(intents).not.toContain('TOGGLE_VIDEO_PLAYBACK');
    // Release R1
    (gamepad.buttons as GamepadButton[])[5] = { pressed: false, touched: false, value: 0 };
    stepFrame(50);
    expect(intents.filter(type => type === 'TOGGLE_VIDEO_PLAYBACK')).toHaveLength(1);
  });

  it('dispatches R1 + L2 chord to rewind 3s (-3000ms) without triggering team toggle or play toggle', () => {
    cleanupDetector = listenForGamepadConnections();
    const received: Array<{ type: string; deltaMs?: number }> = [];
    const stopListening = intentDispatcher.subscribe(intent => received.push(intent));
    startGamepadPolling();
    stepFrame(0);
    // Hold R1 (button 5)
    (gamepad.buttons as GamepadButton[])[5] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    // Tap L2 (button 6)
    (gamepad.buttons as GamepadButton[])[6] = { pressed: true, touched: true, value: 1 };
    stepFrame(50);
    expect(received).toContainEqual({ type: 'VIDEO_CONTROL_SEEK', deltaMs: -3000 });
    // Release R1 and L2
    (gamepad.buttons as GamepadButton[])[5] = { pressed: false, touched: false, value: 0 };
    (gamepad.buttons as GamepadButton[])[6] = { pressed: false, touched: false, value: 0 };
    stepFrame(80);
    stopListening();
    expect(intents.filter(type => type === 'TOGGLE_VIDEO_PLAYBACK')).toHaveLength(0);
    expect(intents.filter(type => type === 'TOGGLE_ACTIVE_TEAM')).toHaveLength(0);
  });

  it('dispatches R1 + R2 chord to advance 5s (+5000ms) without triggering pass or play toggle', () => {
    cleanupDetector = listenForGamepadConnections();
    const received: Array<{ type: string; deltaMs?: number }> = [];
    const stopListening = intentDispatcher.subscribe(intent => received.push(intent));
    startGamepadPolling();
    stepFrame(0);
    // Hold R1 (button 5)
    (gamepad.buttons as GamepadButton[])[5] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    // Tap R2 (button 7)
    (gamepad.buttons as GamepadButton[])[7] = { pressed: true, touched: true, value: 1 };
    stepFrame(50);
    expect(received).toContainEqual({ type: 'VIDEO_CONTROL_SEEK', deltaMs: 5000 });
    // Release R1 and R2
    (gamepad.buttons as GamepadButton[])[5] = { pressed: false, touched: false, value: 0 };
    (gamepad.buttons as GamepadButton[])[7] = { pressed: false, touched: false, value: 0 };
    stepFrame(80);
    stopListening();
    expect(intents.filter(type => type === 'TOGGLE_VIDEO_PLAYBACK')).toHaveLength(0);
    expect(intents.filter(type => type === 'QUICK_RESULT_NEUTRAL')).toHaveLength(0);
  });

  it('toggles active team on L2 press alone', () => {
    cleanupDetector = listenForGamepadConnections();
    startGamepadPolling();
    stepFrame(0);
    (gamepad.buttons as GamepadButton[])[6] = { pressed: true, touched: true, value: 1 };
    stepFrame(20);
    expect(intents).toContain('TOGGLE_ACTIVE_TEAM');
  });

  it('performs direct analog scrub with RS X (right = forward, left = rewind) without holding VIEW', () => {
    cleanupDetector = listenForGamepadConnections();
    setDirectVideoSeekEnabled(true);
    const received: Array<{ type: string; deltaMs?: number }> = [];
    const stopListening = intentDispatcher.subscribe(intent => received.push(intent));
    startGamepadPolling();
    stepFrame(0);

    // Deflect Right Stick X past deadzone to the right (+0.8 => forward)
    (gamepad.axes as number[])[2] = 0.8;
    stepFrame(20);
    expect(received).toContainEqual({ type: 'VIDEO_SEEK_STARTED' });

    // Step frame past throttle interval (90ms)
    stepFrame(120);
    const analogSeeks = received.filter(i => i.type === 'VIDEO_ANALOG_SEEK');
    expect(analogSeeks.length).toBeGreaterThan(0);
    expect((analogSeeks[0] as { deltaMs: number }).deltaMs).toBeGreaterThan(0);

    // Return RS to neutral
    (gamepad.axes as number[])[2] = 0.0;
    stepFrame(130);
    expect(received).toContainEqual({ type: 'VIDEO_SEEK_ENDED' });

    stopListening();
  });

  it('supports legacy video modifier when VIEW is configured to TOGGLE_VIDEO_PLAYBACK', () => {
    cleanupDetector = listenForGamepadConnections();
    usePreferencesStore.setState({ gameplayBindings: { ...DEFAULT_PREFERENCES.gameplayBindings, VIEW: 'TOGGLE_VIDEO_PLAYBACK' } });
    setVideoModifierContextEnabled(true);
    startGamepadPolling();
    stepFrame(0);
    (gamepad.buttons as GamepadButton[])[8] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    expect(intents).toContain('VIDEO_CONTROL_ENTER');
    setVideoModifierContextEnabled(false);
    expect(intents.at(-1)).toBe('VIDEO_CONTROL_EXIT');
  });

  it('consumes unsupported controls while legacy VIEW modifier is active', () => {
    cleanupDetector = listenForGamepadConnections();
    usePreferencesStore.setState({ gameplayBindings: { ...DEFAULT_PREFERENCES.gameplayBindings, VIEW: 'TOGGLE_VIDEO_PLAYBACK' } });
    setVideoModifierContextEnabled(true);
    startGamepadPolling();
    stepFrame(0);
    (gamepad.buttons as GamepadButton[])[8] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    (gamepad.buttons as GamepadButton[])[4] = { pressed: true, touched: true, value: 1 };
    stepFrame(20);
    expect(intents).not.toContain('PLAYER');
  });

  it('keeps a customized VIEW binding as its configured gameplay action', () => {
    cleanupDetector = listenForGamepadConnections();
    usePreferencesStore.setState({ gameplayBindings: { ...DEFAULT_PREFERENCES.gameplayBindings, VIEW: 'BOOKMARK_MOMENT' } });
    startGamepadPolling();
    stepFrame(0);
    (gamepad.buttons as GamepadButton[])[8] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    expect(intents).toEqual(['BOOKMARK_MOMENT']);
  });

  it('exits an active legacy video modifier when polling stops or the controller disconnects', () => {
    cleanupDetector = listenForGamepadConnections();
    usePreferencesStore.setState({ gameplayBindings: { ...DEFAULT_PREFERENCES.gameplayBindings, VIEW: 'TOGGLE_VIDEO_PLAYBACK' } });
    setVideoModifierContextEnabled(true);
    startGamepadPolling();
    stepFrame(0);
    (gamepad.buttons as GamepadButton[])[8] = { pressed: true, touched: true, value: 1 };
    stepFrame(10);
    stopGamepadPolling();
    expect(intents.filter(type => type === 'VIDEO_CONTROL_EXIT')).toHaveLength(1);
    intents = [];
    startGamepadPolling();
    stepFrame(20);
    (gamepad.buttons as GamepadButton[])[8] = { pressed: true, touched: true, value: 1 };
    stepFrame(30);
    (gamepad as { connected: boolean }).connected = false;
    stepFrame(40);
    expect(intents.filter(type => type === 'VIDEO_CONTROL_EXIT')).toHaveLength(1);
  });
  it('uses gameplay shortcuts independently of calibrated physical indices', () => {
    cleanupDetector = listenForGamepadConnections();
    useControllerStore.getState().setProfile({ ...STANDARD_PROFILE, buttons: { ...STANDARD_PROFILE.buttons, LEFT_TRIGGER: 17 } });
    usePreferencesStore.setState({ gameplayBindings: {
      ...DEFAULT_PREFERENCES.gameplayBindings,
      LEFT_TRIGGER: 'BOOKMARK_MOMENT', RIGHT_STICK_BUTTON: 'CLEAR_CURRENT_ACTION'
    } });
    (gamepad.buttons as GamepadButton[])[17] = { pressed: true, touched: true, value: 1 };
    startGamepadPolling();
    stepFrame();
    expect(intents).toEqual(['BOOKMARK_MOMENT']);
  });

  it('identifies the physical opener when a gameplay shortcut opens a wheel', () => {
    cleanupDetector = listenForGamepadConnections();
    usePreferencesStore.setState({ gameplayBindings: { ...DEFAULT_PREFERENCES.gameplayBindings, LEFT_TRIGGER: 'SKILL' } });
    const received: unknown[] = [];
    const stopListening = intentDispatcher.subscribe(intent => received.push(intent));
    (gamepad.buttons as GamepadButton[])[6] = { pressed: true, touched: true, value: 1 };
    startGamepadPolling();
    stepFrame();
    stopListening();
    expect(received).toEqual([{ type: 'OPEN_RADIAL', category: 'SKILL', control: 'LEFT_TRIGGER' }]);
  });

  it('publishes right-stick movement even when the left stick is idle', () => {
    cleanupDetector = listenForGamepadConnections();
    expect(useControllerStore.getState().state.mapping).toBe('standard');
    startGamepadPolling();
    stepFrame();

    expect(rawGamepadSnapshotStore.getSnapshot()).toMatchObject({
      id: 'Test Standard Pad',
      index: 0,
      mapping: 'standard',
      connected: true
    });

    (gamepad.axes as number[])[2] = 0.9;
    stepFrame();

    expect(useControllerStore.getState().state.rightStick.x).toBeGreaterThan(0.8);
  });

  it('clears one-frame button edges from the published store on the next poll', () => {
    cleanupDetector = listenForGamepadConnections();
    startGamepadPolling();
    stepFrame();
    (gamepad.buttons as GamepadButton[])[0] = { pressed: true, touched: true, value: 1 };
    stepFrame();
    expect(useControllerStore.getState().state.buttons.FACE_SOUTH.pressedThisFrame).toBe(true);

    stepFrame();

    expect(useControllerStore.getState().state.buttons.FACE_SOUTH.pressedThisFrame).toBe(false);
  });

  it('resets button edge history across a disconnect and reconnect', () => {
    cleanupDetector = listenForGamepadConnections();
    startGamepadPolling();
    stepFrame();
    (gamepad.buttons as GamepadButton[])[0] = { pressed: true, touched: true, value: 1 };
    stepFrame();
    expect(intents.filter((type) => type === 'OPEN_RADIAL')).toHaveLength(1);

    (gamepad as { connected: boolean }).connected = false;
    emitGamepadEvent('gamepaddisconnected');
    (gamepad as { connected: boolean }).connected = true;
    emitGamepadEvent('gamepadconnected');
    stepFrame();
    expect(intents.filter((type) => type === 'OPEN_RADIAL')).toHaveLength(2);
  });

  it('direct Right Stick analog seek operates without VIEW in LIVE_SCOUT context', () => {
    cleanupDetector = listenForGamepadConnections();
    setDirectVideoSeekEnabled(true);
    startGamepadPolling();
    stepFrame(0);

    // Deflect Right Stick horizontally to the right
    (gamepad.axes as number[])[2] = 0.8;
    stepFrame(10);
    expect(intents).toContain('VIDEO_SEEK_STARTED');

    // Advance past throttle threshold
    stepFrame(110);
    expect(intents).toContain('VIDEO_ANALOG_SEEK');

    // Return RS to neutral
    (gamepad.axes as number[])[2] = 0;
    stepFrame(120);
    expect(intents).toContain('VIDEO_SEEK_ENDED');
  });

  it('direct Right Stick seek is blocked when directVideoSeekEnabled is false (e.g. selector open)', () => {
    cleanupDetector = listenForGamepadConnections();
    setDirectVideoSeekEnabled(false);
    startGamepadPolling();
    stepFrame(0);

    (gamepad.axes as number[])[2] = 0.8;
    stepFrame(10);
    expect(intents).not.toContain('VIDEO_SEEK_STARTED');
    expect(intents).not.toContain('VIDEO_ANALOG_SEEK');
  });
});
