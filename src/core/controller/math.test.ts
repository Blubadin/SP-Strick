import { describe, it, expect } from 'vitest';

export function getActiveSegment(angle: number, magnitude: number, optionsCount: number): number | null {
  if (magnitude < 0.55) return null;
  const segmentAngle = 360 / optionsCount;
  let shiftedAngle = (angle + segmentAngle / 2) % 360;
  if (shiftedAngle < 0) shiftedAngle += 360;
  return Math.floor(shiftedAngle / segmentAngle) % optionsCount;
}

export function applyDeadzone(x: number, y: number, deadzone: number) {
  let mag = Math.sqrt(x*x + y*y);
  if (mag < deadzone) {
    return { x: 0, y: 0, magnitude: 0, angle: 0 };
  }
  let normalizedMag = (mag - deadzone) / (1 - deadzone);
  if (normalizedMag > 1) normalizedMag = 1;
  let angle = Math.atan2(y, x) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return { x: (x/mag)*normalizedMag, y: (y/mag)*normalizedMag, magnitude: normalizedMag, angle };
}

describe('Controller Math', () => {
  it('applies deadzone correctly', () => {
    const result1 = applyDeadzone(0.1, 0.1, 0.2);
    expect(result1.magnitude).toBe(0);

    const result2 = applyDeadzone(1, 0, 0.2);
    expect(result2.magnitude).toBe(1);
    expect(result2.angle).toBe(0);

    const result3 = applyDeadzone(0, 1, 0.2);
    expect(result3.magnitude).toBe(1);
    expect(result3.angle).toBe(90);
  });

  it('calculates active segment correctly', () => {
    // 8 options, each 45 deg, centered at 0, 45, 90...
    // Option 0: -22.5 to 22.5
    expect(getActiveSegment(0, 1, 8)).toBe(0);
    expect(getActiveSegment(20, 1, 8)).toBe(0);
    expect(getActiveSegment(45, 1, 8)).toBe(1);
    expect(getActiveSegment(90, 1, 8)).toBe(2);
    
    // Low magnitude should return null
    expect(getActiveSegment(90, 0.3, 8)).toBeNull();
  });
});
