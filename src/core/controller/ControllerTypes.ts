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
