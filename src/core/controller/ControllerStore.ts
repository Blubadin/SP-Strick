import { create } from 'zustand';
import type { ControllerState, SemanticControl, ButtonState, ControllerProfile } from './ControllerTypes';

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

export const useControllerStore = create<Store>((set: any) => ({
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
  setConnected: (connected: boolean, id: string | null, index: number | null, haptic: GamepadHapticActuator | null) => set((s: any) => ({
    state: { ...s.state, connected, id, index, hapticActuator: haptic }
  })),
  updateState: (newState: Partial<ControllerState>) => set((s: any) => ({
    state: { ...s.state, ...newState }
  }))
}));
