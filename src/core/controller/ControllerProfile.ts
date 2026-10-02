import type { ControllerProfile, ControllerType, SemanticControl } from './ControllerTypes';

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
  DPAD_RIGHT: 15
};

export const STANDARD_PROFILE: ControllerProfile = {
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
};

export const XBOX_PROFILE: ControllerProfile = {
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
};

export const DUALSENSE_PROFILE: ControllerProfile = {
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
};

export const DUALSHOCK_PROFILE: ControllerProfile = {
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
};

export const BUILT_IN_PROFILES: ControllerProfile[] = [
  XBOX_PROFILE,
  DUALSENSE_PROFILE,
  DUALSHOCK_PROFILE,
  STANDARD_PROFILE
];

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

  // 2. Xbox detection (prioritized over generic 'wireless controller')
  if (XBOX_PROFILE.detectedIdPatterns?.some(p => lowerId.includes(p))) {
    return XBOX_PROFILE;
  }

  // 3. DualSense detection
  if (DUALSENSE_PROFILE.detectedIdPatterns?.some(p => lowerId.includes(p))) {
    return DUALSENSE_PROFILE;
  }

  // 4. DualShock detection
  if (DUALSHOCK_PROFILE.detectedIdPatterns?.some(p => lowerId.includes(p))) {
    return DUALSHOCK_PROFILE;
  }

  // 5. Standard Gamepad API fallback
  if (mapping === 'standard') {
    return STANDARD_PROFILE;
  }

  return STANDARD_PROFILE;
}

/**
 * Controller glyph resolver for buttons based on active controller type.
 */
export function getControllerGlyph(control: SemanticControl, type: ControllerType): string {
  if (type === 'xbox') {
    switch (control) {
      case 'FACE_SOUTH': return 'A';
      case 'FACE_EAST': return 'B';
      case 'FACE_WEST': return 'X';
      case 'FACE_NORTH': return 'Y';
      case 'LEFT_BUMPER': return 'LB';
      case 'RIGHT_BUMPER': return 'RB';
      case 'LEFT_TRIGGER': return 'LT';
      case 'RIGHT_TRIGGER': return 'RT';
      case 'DPAD_UP': return '↑';
      case 'DPAD_RIGHT': return '→';
      case 'DPAD_DOWN': return '↓';
      case 'DPAD_LEFT': return '←';
      case 'VIEW': return 'View';
      case 'MENU': return 'Menu';
      case 'LEFT_STICK_BUTTON': return 'LS';
      case 'RIGHT_STICK_BUTTON': return 'RS';
    }
  }

  if (type === 'dualsense' || type === 'dualshock') {
    switch (control) {
      case 'FACE_SOUTH': return '✕';
      case 'FACE_EAST': return '○';
      case 'FACE_WEST': return '□';
      case 'FACE_NORTH': return '△';
      case 'LEFT_BUMPER': return 'L1';
      case 'RIGHT_BUMPER': return 'R1';
      case 'LEFT_TRIGGER': return 'L2';
      case 'RIGHT_TRIGGER': return 'R2';
      case 'DPAD_UP': return '↑';
      case 'DPAD_RIGHT': return '→';
      case 'DPAD_DOWN': return '↓';
      case 'DPAD_LEFT': return '←';
      case 'VIEW': return 'Share';
      case 'MENU': return 'Options';
      case 'LEFT_STICK_BUTTON': return 'L3';
      case 'RIGHT_STICK_BUTTON': return 'R3';
    }
  }

  // Neutral / Standard
  switch (control) {
    case 'FACE_SOUTH': return 'South';
    case 'FACE_EAST': return 'East';
    case 'FACE_WEST': return 'West';
    case 'FACE_NORTH': return 'North';
    case 'LEFT_BUMPER': return 'L1';
    case 'RIGHT_BUMPER': return 'R1';
    case 'LEFT_TRIGGER': return 'L2';
    case 'RIGHT_TRIGGER': return 'R2';
    case 'DPAD_UP': return '↑';
    case 'DPAD_RIGHT': return '→';
    case 'DPAD_DOWN': return '↓';
    case 'DPAD_LEFT': return '←';
    case 'VIEW': return 'Select';
    case 'MENU': return 'Start';
    case 'LEFT_STICK_BUTTON': return 'L3';
    case 'RIGHT_STICK_BUTTON': return 'R3';
  }
}
