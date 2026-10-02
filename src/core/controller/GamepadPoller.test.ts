import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForGamepadConnections } from './GamepadDetector';
import { startGamepadPolling, stopGamepadPolling } from './GamepadPoller';
import { intentDispatcher } from './ControllerIntent';
import { STANDARD_PROFILE } from './ControllerProfile';
import { useControllerStore } from './ControllerStore';
import { createInitialButtonMap } from './ButtonStateMachine';
import { rawGamepadSnapshotStore } from './RawGamepadSnapshot';

function makeGamepad() {
  return {
    id: 'Test Standard Pad',
    index: 0,
    mapping: 'standard',
    connected: true,
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
    vibrationActuator: null,
    hapticActuators: []
  } as unknown as Gamepad;
}

describe('GamepadPoller state publication', () => {
  let gamepad: Gamepad;
  let stepFrame: () => void;
  let cleanupDetector: (() => void) | null;
  let unsubscribe: (() => void) | null;
  let intents: string[];
  let emitGamepadEvent: (type: string) => void;

  beforeEach(() => {
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
    stepFrame = () => callbacks.shift()?.(0);
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
});
