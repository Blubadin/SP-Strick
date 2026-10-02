/**
 * Pure mathematical functions for radial menu sector selection with angular hysteresis
 * and center deadzone/cancelation mechanics.
 */

export interface RadialSelectorConfig {
  activationThreshold: number; // e.g. 0.55
  deactivationThreshold: number; // e.g. 0.25 (drop to cancel/center)
  hysteresisDegrees: number; // e.g. 5 degrees buffer before crossing boundary
}

export const DEFAULT_RADIAL_CONFIG: RadialSelectorConfig = {
  activationThreshold: 0.55,
  deactivationThreshold: 0.25,
  hysteresisDegrees: 5
};

/**
 * Returns smallest angular difference in degrees between two angles in [0, 360)
 * Result is in [-180, 180]
 */
export function angularDifference(a: number, b: number): number {
  let diff = (a - b) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;
  return diff;
}

/**
 * Get the nominal base sector for a given angle [0, 360) and sector count.
 * Sector 0 is centered around angle 0 (Right).
 */
export function getBaseSector(angle: number, numSectors: number): number {
  if (numSectors <= 0) return 0;
  const sectorSpan = 360 / numSectors;
  // Shift angle by halfSpan so sector 0 is centered at 0 deg (or 0 deg is midpoint)
  let normalized = (angle + sectorSpan / 2) % 360;
  if (normalized < 0) normalized += 360;
  return Math.floor(normalized / sectorSpan) % numSectors;
}

/**
 * Computes the active sector taking into account:
 * 1. Activation magnitude threshold (stick must be flicked outward)
 * 2. Return to center deactivation (stick flicked back to neutral cancels selection)
 * 3. Angular hysteresis when transitioning between adjacent sectors to prevent edge jitter
 */
export function getHysteresisSector(
  angle: number,
  magnitude: number,
  numSectors: number,
  currentSector: number | null,
  config: RadialSelectorConfig = DEFAULT_RADIAL_CONFIG
): number | null {
  if (numSectors <= 0) return null;

  // 1. If not yet active, require stick to pass activation threshold
  if (currentSector === null) {
    if (magnitude < config.activationThreshold) {
      return null;
    }
    return getBaseSector(angle, numSectors);
  }

  // 2. If stick returns near center, cancel active selection
  if (magnitude < config.deactivationThreshold) {
    return null;
  }

  // 3. Current sector is active. Check if angle has crossed into a new sector beyond hysteresis.
  const sectorSpan = 360 / numSectors;
  const halfSpan = sectorSpan / 2;
  const currentCenterAngle = (currentSector * sectorSpan) % 360;

  // Angular distance from current sector's center
  const distFromCenter = Math.abs(angularDifference(angle, currentCenterAngle));

  // If still within current sector's extended boundary (+ hysteresis), maintain current selection
  if (distFromCenter <= halfSpan + config.hysteresisDegrees) {
    return currentSector;
  }

  // Otherwise, angle has decisively moved to a new sector
  return getBaseSector(angle, numSectors);
}
