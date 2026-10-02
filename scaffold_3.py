import os

base_dir = "c:/Users/Sport-Science-R3909/Documents/Sp strick"

files = {
    "src/core/controller/ControllerTypes.ts": """
export type SemanticControl = 
  | 'FACE_SOUTH' | 'FACE_EAST' | 'FACE_WEST' | 'FACE_NORTH'
  | 'LEFT_BUMPER' | 'RIGHT_BUMPER'
  | 'LEFT_TRIGGER' | 'RIGHT_TRIGGER'
  | 'LEFT_STICK_BUTTON' | 'RIGHT_STICK_BUTTON'
  | 'DPAD_UP' | 'DPAD_RIGHT' | 'DPAD_DOWN' | 'DPAD_LEFT'
  | 'MENU' | 'VIEW';

export interface AxisState {
  x: number;
  y: number;
  magnitude: number;
  angle: number;
}

export interface ButtonState {
  pressed: boolean;
  pressedThisFrame: boolean;
  releasedThisFrame: boolean;
  held: boolean;
}

export interface ControllerState {
  connected: boolean;
  id: string | null;
  index: number | null;
  buttons: Record<SemanticControl, ButtonState>;
  leftStick: AxisState;
  rightStick: AxisState;
  hapticActuator: GamepadHapticActuator | null;
}

export interface ControllerProfile {
  id: string;
  name: string;
  type: 'xbox' | 'dualsense' | 'dualshock' | 'standard' | 'custom';
  mapping: Record<SemanticControl, number>;
  leftStickIndexX: number;
  leftStickIndexY: number;
  rightStickIndexX: number;
  rightStickIndexY: number;
  deadzone: number;
}
""",

    "src/core/controller/ControllerStore.ts": """
import { create } from 'zustand';
import { ControllerState, SemanticControl, ButtonState, ControllerProfile } from './ControllerTypes';

const defaultButtonState = (): ButtonState => ({ pressed: false, pressedThisFrame: false, releasedThisFrame: false, held: false });
const defaultButtons = () => {
  const controls: SemanticControl[] = [
    'FACE_SOUTH', 'FACE_EAST', 'FACE_WEST', 'FACE_NORTH',
    'LEFT_BUMPER', 'RIGHT_BUMPER', 'LEFT_TRIGGER', 'RIGHT_TRIGGER',
    'LEFT_STICK_BUTTON', 'RIGHT_STICK_BUTTON',
    'DPAD_UP', 'DPAD_RIGHT', 'DPAD_DOWN', 'DPAD_LEFT',
    'MENU', 'VIEW'
  ];
  const b: any = {};
  controls.forEach(c => b[c] = defaultButtonState());
  return b as Record<SemanticControl, ButtonState>;
};

export const STANDARD_PROFILE: ControllerProfile = {
  id: 'standard',
  name: 'Standard Gamepad',
  type: 'standard',
  mapping: {
    FACE_SOUTH: 0, FACE_EAST: 1, FACE_WEST: 2, FACE_NORTH: 3,
    LEFT_BUMPER: 4, RIGHT_BUMPER: 5, LEFT_TRIGGER: 6, RIGHT_TRIGGER: 7,
    VIEW: 8, MENU: 9, LEFT_STICK_BUTTON: 10, RIGHT_STICK_BUTTON: 11,
    DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15
  },
  leftStickIndexX: 0,
  leftStickIndexY: 1,
  rightStickIndexX: 2,
  rightStickIndexY: 3,
  deadzone: 0.20
};

interface Store {
  state: ControllerState;
  profile: ControllerProfile;
  setConnected: (connected: boolean, id: string | null, index: number | null, haptic: GamepadHapticActuator | null) => void;
  updateState: (newState: Partial<ControllerState>) => void;
}

export const useControllerStore = create<Store>((set) => ({
  state: {
    connected: false,
    id: null,
    index: null,
    buttons: defaultButtons(),
    leftStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
    rightStick: { x: 0, y: 0, magnitude: 0, angle: 0 },
    hapticActuator: null,
  },
  profile: STANDARD_PROFILE,
  setConnected: (connected, id, index, haptic) => set((s) => ({
    state: { ...s.state, connected, id, index, hapticActuator: haptic }
  })),
  updateState: (newState) => set((s) => ({
    state: { ...s.state, ...newState }
  }))
}));
""",

    "src/core/controller/GamepadDetector.ts": """
import { useControllerStore } from './ControllerStore';

export function listenForGamepadConnections() {
  window.addEventListener("gamepadconnected", (e) => {
    const gp = e.gamepad;
    // @ts-ignore
    const haptic = gp.vibrationActuator || null;
    useControllerStore.getState().setConnected(true, gp.id, gp.index, haptic);
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    const state = useControllerStore.getState().state;
    if (state.index === e.gamepad.index) {
      useControllerStore.getState().setConnected(false, null, null, null);
    }
  });
}
""",
    "src/core/controller/GamepadPoller.ts": """
import { useControllerStore } from './ControllerStore';
import { SemanticControl, ButtonState, AxisState } from './ControllerTypes';

let pollingFrame: number | null = null;
let lastButtons: Record<number, boolean> = {};

function applyDeadzone(x: number, y: number, deadzone: number): AxisState {
  let mag = Math.sqrt(x*x + y*y);
  if (mag < deadzone) {
    return { x: 0, y: 0, magnitude: 0, angle: 0 };
  }
  let normalizedMag = (mag - deadzone) / (1 - deadzone);
  if (normalizedMag > 1) normalizedMag = 1;
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  // Gamepad Y is inverted (up is -1). We usually want Up as 270 or 90 depending on convention.
  // Standard Math.atan2: Right=0, Down=90, Left=180, Up=270 (if y is positive-down).
  return { x: (x/mag)*normalizedMag, y: (y/mag)*normalizedMag, magnitude: normalizedMag, angle };
}

export function startGamepadPolling() {
  const poll = () => {
    const { state, profile, updateState } = useControllerStore.getState();
    if (state.connected && state.index !== null) {
      const gp = navigator.getGamepads()[state.index];
      if (gp) {
        const newButtons: Record<SemanticControl, ButtonState> = { ...state.buttons };
        
        Object.entries(profile.mapping).forEach(([semantic, physical]) => {
          const btn = gp.buttons[physical];
          const isPressed = btn ? (typeof btn === 'object' ? btn.pressed : btn > 0) : false;
          const wasPressed = lastButtons[physical] || false;
          
          newButtons[semantic as SemanticControl] = {
            pressed: isPressed,
            pressedThisFrame: isPressed && !wasPressed,
            releasedThisFrame: !isPressed && wasPressed,
            held: isPressed && wasPressed
          };
          
          lastButtons[physical] = isPressed;
        });

        const leftX = gp.axes[profile.leftStickIndexX] || 0;
        const leftY = gp.axes[profile.leftStickIndexY] || 0;
        const rightX = gp.axes[profile.rightStickIndexX] || 0;
        const rightY = gp.axes[profile.rightStickIndexY] || 0;

        const leftStick = applyDeadzone(leftX, leftY, profile.deadzone);
        const rightStick = applyDeadzone(rightX, rightY, profile.deadzone);

        updateState({ buttons: newButtons, leftStick, rightStick });
        
        // Dispatch custom events for semantic intents if needed, or state machine will read from store
      }
    }
    pollingFrame = requestAnimationFrame(poll);
  };
  pollingFrame = requestAnimationFrame(poll);
}

export function stopGamepadPolling() {
  if (pollingFrame !== null) {
    cancelAnimationFrame(pollingFrame);
    pollingFrame = null;
  }
}

export function triggerHaptic(duration: number = 100, strong: number = 0.5, weak: number = 0.5) {
  const state = useControllerStore.getState().state;
  if (state.hapticActuator) {
    // @ts-ignore
    state.hapticActuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: duration,
      weakMagnitude: weak,
      strongMagnitude: strong
    }).catch(() => {}); // ignore if failed
  }
}
"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
