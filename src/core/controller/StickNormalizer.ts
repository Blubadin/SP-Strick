import type { AxisState, ControllerProfile, ControllerState } from './ControllerTypes';

/**
 * Normalizes raw analog stick input with configurable deadzone, inversion, and drift protection.
 */
export function applyDeadzone(
  rawX: number,
  rawY: number,
  deadzone: number = 0.20,
  invertX: boolean = false,
  invertY: boolean = false
): AxisState {
  const x = invertX ? -rawX : rawX;
  const y = invertY ? -rawY : rawY;

  const mag = Math.sqrt(x * x + y * y);
  if (mag <= deadzone) {
    return { x: 0, y: 0, magnitude: 0, angle: 0 };
  }

  // Radial re-scaling to map [deadzone, 1] to [0, 1]
  const normalizedMag = Math.min(1, (mag - deadzone) / (1 - deadzone));

  // Compute angle in degrees [0, 360)
  // In standard screen/gamepad coordinates:
  // x > 0, y = 0 -> 0 deg (Right)
  // x = 0, y > 0 -> 90 deg (Down)
  // x < 0, y = 0 -> 180 deg (Left)
  // x = 0, y < 0 -> 270 deg (Up)
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  if (angle < 0) {
    angle += 360;
  }

  const unitX = x / mag;
  const unitY = y / mag;

  return {
    x: unitX * normalizedMag,
    y: unitY * normalizedMag,
    magnitude: normalizedMag,
    angle
  };
}

/**
 * Resolves the stick for scouting selectors (Skill, Zone/Position, Result, Team, Player).
 * Scouting selection ALWAYS uses Left Stick.
 */
export function getScoutingSelectorStick(
  state: Pick<ControllerState, 'leftStick'>
): AxisState {
  return state.leftStick;
}

export const getScoutingSelectionStick = getScoutingSelectorStick;


/**
 * Resolves the stick for video transport and analog scrubbing (when VIEW modifier is held).
 * Right Stick is preferred when available on the active profile; otherwise Left Stick as fallback.
 */
export function getVideoSeekStick(
  state: Pick<ControllerState, 'leftStick' | 'rightStick'>,
  profile?: Pick<ControllerProfile, 'rightStick'> | null
): AxisState {
  if (profile?.rightStick) {
    return state.rightStick;
  }
  return state.leftStick;
}
