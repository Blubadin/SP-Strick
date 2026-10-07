import type { ControllerProfile, ControllerType, SemanticControl } from './ControllerTypes';
import { ALL_SEMANTIC_CONTROLS } from './ButtonStateMachine';

export const STANDARD_MAPPING: Record<SemanticControl, number> = {
  FACE_SOUTH: 0,
  FACE_EAST: 1,
  FACE_WEST: 2,
  FACE_NORTH: 3,
  LEFT_BUMPER: 4,
  RIGHT_BUMPER: 5,
  LEFT_TRIGGER: 6,
  RIGHT_TRIGGER: 7,
  VIEW: 8,
  MENU: 9,
  LEFT_STICK_BUTTON: 10,
  RIGHT_STICK_BUTTON: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  PADDLE_LEFT: 18,
  PADDLE_RIGHT: 19
};

function immutableProfile(profile: ControllerProfile): ControllerProfile {
  return Object.freeze({
    ...profile,
    detectedIdPatterns: profile.detectedIdPatterns
      ? Object.freeze([...profile.detectedIdPatterns]) as unknown as string[]
      : undefined,
    buttons: Object.freeze({ ...profile.buttons }),
    leftStick: Object.freeze({ ...profile.leftStick }),
    rightStick: profile.rightStick ? Object.freeze({ ...profile.rightStick }) : undefined
  }) as ControllerProfile;
}

export const STANDARD_PROFILE: ControllerProfile = immutableProfile({
  id: 'profile_standard',
  name: 'Standard Gamepad',
  type: 'standard',
  buttons: { ...STANDARD_MAPPING },
  leftStick: {
    xAxis: 0,
    yAxis: 1,
    invertX: false,
    invertY: false,
    deadzone: 0.20
  },
  rightStick: {
    xAxis: 2,
    yAxis: 3,
    invertX: false,
    invertY: false,
    deadzone: 0.20
  },
  builtIn: true
});

export const XBOX_PROFILE: ControllerProfile = immutableProfile({
  id: 'profile_xbox',
  name: 'Xbox Wireless Controller',
  type: 'xbox',
  detectedIdPatterns: ['xbox', 'x-input', '045e', 'microsoft'],
  buttons: { ...STANDARD_MAPPING },
  leftStick: {
    xAxis: 0,
    yAxis: 1,
    invertX: false,
    invertY: false,
    deadzone: 0.20
  },
  rightStick: {
    xAxis: 2,
    yAxis: 3,
    invertX: false,
    invertY: false,
    deadzone: 0.20
  },
  builtIn: true
});

export const DUALSENSE_PROFILE: ControllerProfile = immutableProfile({
  id: 'profile_dualsense',
  name: 'PlayStation DualSense',
  type: 'dualsense',
  detectedIdPatterns: ['dualsense', '054c:0ce6', '0ce6', 'ps5'],
  buttons: { ...STANDARD_MAPPING },
  leftStick: {
    xAxis: 0,
    yAxis: 1,
    invertX: false,
    invertY: false,
    deadzone: 0.18
  },
  rightStick: {
    xAxis: 2,
    yAxis: 3,
    invertX: false,
    invertY: false,
    deadzone: 0.18
  },
  builtIn: true
});

export const DUALSHOCK_PROFILE: ControllerProfile = immutableProfile({
  id: 'profile_dualshock',
  name: 'PlayStation DualShock 4',
  type: 'dualshock',
  detectedIdPatterns: ['dualshock', '054c:05c4', '054c:09cc', 'ps4'],
  buttons: { ...STANDARD_MAPPING },
  leftStick: {
    xAxis: 0,
    yAxis: 1,
    invertX: false,
    invertY: false,
    deadzone: 0.18
  },
  rightStick: {
    xAxis: 2,
    yAxis: 3,
    invertX: false,
    invertY: false,
    deadzone: 0.18
  },
  builtIn: true
});

/** WGP12S uses normal Gamepad API indices with ABXY face labels. Same-layout pads are compatible. */
export const WGP12S_PROFILE: ControllerProfile = immutableProfile({
  ...STANDARD_PROFILE,
  id: 'profile_wgp12s',
  name: 'WGP12S compatible',
  detectedIdPatterns: ['wgp12s', 'revolver']
});

export const BUILT_IN_PROFILES: ControllerProfile[] = Object.freeze([WGP12S_PROFILE]) as unknown as ControllerProfile[];

// Retain known legacy ids for validation/migration without exposing vendor choices.
export const LEGACY_BUILT_IN_PROFILE_IDS = [STANDARD_PROFILE.id, XBOX_PROFILE.id, DUALSENSE_PROFILE.id, DUALSHOCK_PROFILE.id];

export interface ControllerProfileValidation {
  valid: boolean;
  errors: string[];
}

const semanticControlSet = new Set<string>(ALL_SEMANTIC_CONTROLS);
const controllerTypes: ControllerType[] = ['xbox', 'dualsense', 'dualshock', 'standard', 'custom'];

/** Validates custom profile values before they can be stored or used for input. */
export function validateControllerProfile(profile: unknown): ControllerProfileValidation {
  const errors: string[] = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { valid: false, errors: ['Profile must be an object.'] };
  }
  const candidate = profile as Partial<ControllerProfile>;
  const ownerByButtonIndex = new Map<number, string>();

  if (!candidate.buttons || typeof candidate.buttons !== 'object' || Array.isArray(candidate.buttons)) {
    errors.push('Profile buttons must be an object.');
  } else {
    for (const [control, index] of Object.entries(candidate.buttons)) {
      if (!semanticControlSet.has(control)) {
        errors.push(`${control} is not a supported semantic control.`);
      }
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
        errors.push(`${control} must use a non-negative integer button index.`);
        continue;
      }
      const existing = ownerByButtonIndex.get(index);
      if (existing) {
        errors.push(`Button index ${index} is assigned to both ${existing} and ${control}.`);
      } else {
        ownerByButtonIndex.set(index, control);
      }
    }
  }

  const stickConfigs = [candidate.leftStick, candidate.rightStick];
  for (const stick of stickConfigs) {
    if (!stick) continue;
    if (!Number.isInteger(stick.xAxis) || stick.xAxis < 0 || !Number.isInteger(stick.yAxis) || stick.yAxis < 0) {
      errors.push('Stick axes must use non-negative integer indexes.');
    }
    if (typeof stick.invertX !== 'boolean' || typeof stick.invertY !== 'boolean') {
      errors.push('Stick inversion values must be booleans.');
    }
    if (!Number.isFinite(stick.deadzone) || stick.deadzone < 0 || stick.deadzone >= 1) {
      errors.push('Stick deadzone must be between 0 and 1.');
    }
  }

  if (typeof candidate.leftStick !== 'object' || candidate.leftStick === null) {
    errors.push('Left stick configuration is required.');
  }
  if (!controllerTypes.includes(candidate.type as ControllerType)) {
    errors.push('Profile type is invalid.');
  }
  if (typeof candidate.builtIn !== 'boolean') errors.push('Profile builtIn flag must be a boolean.');
  if (
    candidate.detectedIdPatterns !== undefined &&
    (!Array.isArray(candidate.detectedIdPatterns) || candidate.detectedIdPatterns.some((pattern) => typeof pattern !== 'string'))
  ) {
    errors.push('Detected id patterns must be an array of strings.');
  }
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) errors.push('Profile id is required.');
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) errors.push('Profile name is required.');

  return { valid: errors.length === 0, errors };
}

/**
 * Detects the most appropriate controller profile given gamepad ID and mapping.
 */
export function detectProfile(
  gamepadId: string = '',
  mapping: string = '',
  customProfiles: ControllerProfile[] = []
): ControllerProfile {
  const lowerId = gamepadId.toLowerCase();

  // 1. Check custom profiles first
  for (const custom of customProfiles) {
    if (custom.detectedIdPatterns?.some(pattern => lowerId.includes(pattern.toLowerCase()))) {
      return custom;
    }
  }

  // Standard semantic indices work across controllers with the same physical layout.
  void mapping;
  return WGP12S_PROFILE;
}

/**
 * Controller glyph resolver for buttons based on active controller type.
 */
export function getControllerGlyph(control: SemanticControl, _type: ControllerType = 'standard'): string {
  const glyphs: Record<SemanticControl, string> = {
    FACE_SOUTH: 'A', FACE_EAST: 'B', FACE_WEST: 'X', FACE_NORTH: 'Y',
    LEFT_BUMPER: 'LB', RIGHT_BUMPER: 'RB', LEFT_TRIGGER: 'LT', RIGHT_TRIGGER: 'RT',
    DPAD_UP: '↑', DPAD_RIGHT: '→', DPAD_DOWN: '↓', DPAD_LEFT: '←',
    VIEW: 'View', MENU: 'Menu', LEFT_STICK_BUTTON: 'L3', RIGHT_STICK_BUTTON: 'R3',
    PADDLE_LEFT: 'ML', PADDLE_RIGHT: 'MR'
  };
  return glyphs[control];
}
