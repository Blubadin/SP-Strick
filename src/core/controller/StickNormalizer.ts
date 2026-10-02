import type { AxisState } from './ControllerTypes';

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
