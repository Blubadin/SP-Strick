export type SemanticControl = 
  | 'FACE_SOUTH' | 'FACE_EAST' | 'FACE_WEST' | 'FACE_NORTH'
  | 'LEFT_BUMPER' | 'RIGHT_BUMPER'
  | 'LEFT_TRIGGER' | 'RIGHT_TRIGGER'
  | 'LEFT_STICK_BUTTON' | 'RIGHT_STICK_BUTTON'
  | 'DPAD_UP' | 'DPAD_RIGHT' | 'DPAD_DOWN' | 'DPAD_LEFT'
  | 'MENU' | 'VIEW';

export type ControllerType = 'xbox' | 'dualsense' | 'dualshock' | 'standard' | 'custom';

export interface AxisState {
  x: number;
  y: number;
  magnitude: number;
  angle: number; // in degrees [0, 360)
}

export interface ButtonState {
  pressed: boolean;
  pressedThisFrame: boolean;
  releasedThisFrame: boolean;
  held: boolean;
}

export interface StickConfig {
  xAxis: number;
  yAxis: number;
  invertX: boolean;
  invertY: boolean;
  deadzone: number;
}

export interface ControllerProfile {
  id: string;
  name: string;
  type: ControllerType;
  detectedIdPatterns?: string[];
  buttons: Partial<Record<SemanticControl, number>>;
  leftStick: StickConfig;
  rightStick?: StickConfig;
  builtIn: boolean;
  createdAt?: string;
  updatedAt?: string;
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
