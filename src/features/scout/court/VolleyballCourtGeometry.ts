import type { ScoutingEvent } from '../../../core/scouting/ScoutingEvent';

/** Full court dimensions in standard FIVB meters */
export const COURT_DIMENSIONS = {
  WIDTH_METERS: 9,
  LENGTH_METERS: 18,
  HALF_LENGTH_METERS: 9,
  ATTACK_ZONE_METERS: 3,
  BACK_ZONE_METERS: 6
} as const;

export interface CourtCellPosition {
  teamSide: 'A' | 'B';
  zone: number;
  row: number; // 0..3 (0: Team A back, 1: Team A front, 2: Team B front, 3: Team B back)
  col: number; // 0..2 (0: Left, 1: Center, 2: Right)
  isFrontRow: boolean;
  xPercent: number; // Center X of the cell in percent (0-100)
  yPercent: number; // Center Y of the cell in percent (0-100)
}

/**
 * Maps a volleyball zone (1-6) on a specific team half to full-court 2D grid coordinates.
 *
 * Orientation model:
 * Team A defends the top half, looking DOWN towards the net.
 * Team B defends the bottom half, looking UP towards the net.
 *
 * Front-row zones (4, 3, 2) are always adjacent to the net:
 * - Team A front row is at row 1 (immediately above the net).
 * - Team B front row is at row 2 (immediately below the net).
 * Across the net:
 * - Team B Zone 4 (left attacker) faces Team A Zone 2 (right blocker).
 * - Team B Zone 3 (middle) faces Team A Zone 3 (middle).
 * - Team B Zone 2 (right attacker) faces Team A Zone 4 (left blocker).
 */
export function zoneToCourtCell(teamSide: 'A' | 'B', zone: number): CourtCellPosition {
  if (zone < 1 || zone > 6) {
    throw new Error(`Invalid volleyball zone: ${zone}. Must be 1-6.`);
  }

  const isFrontRow = zone === 2 || zone === 3 || zone === 4;

  let row = 0;
  let col = 0;
  let xPercent = 50;
  let yPercent = 50;

  if (teamSide === 'B') {
    // Team B is on the bottom half (Row 2: Front adjacent to net, Row 3: Back)
    if (isFrontRow) {
      row = 2;
      // Front row: Z4 (left), Z3 (center), Z2 (right)
      col = zone === 4 ? 0 : zone === 3 ? 1 : 2;
      yPercent = 58.33; // Midway between net (50%) and 3m line (66.67%)
    } else {
      row = 3;
      // Back row: Z5 (left), Z6 (center), Z1 (right)
      col = zone === 5 ? 0 : zone === 6 ? 1 : 2;
      yPercent = 83.33; // Midway between 3m line (66.67%) and baseline (100%)
    }
  } else {
    // Team A is on the top half (Row 0: Back, Row 1: Front adjacent to net)
    if (isFrontRow) {
      row = 1;
      // Facing down towards net: player's right (Z2) is on observer's left (col 0),
      // center (Z3) is col 1, player's left (Z4) is on observer's right (col 2).
      col = zone === 2 ? 0 : zone === 3 ? 1 : 2;
      yPercent = 41.67; // Midway between 3m line (33.33%) and net (50%)
    } else {
      row = 0;
      // Back row: Z1 is col 0, Z6 is col 1, Z5 is col 2
      col = zone === 1 ? 0 : zone === 6 ? 1 : 2;
      yPercent = 16.67; // Midway between baseline (0%) and 3m line (33.33%)
    }
  }

  xPercent = col === 0 ? 16.67 : col === 1 ? 50.0 : 83.33;

  return { teamSide, zone, row, col, isFrontRow, xPercent, yPercent };
}

export interface ZoneHeatmapData {
  teamSide: 'A' | 'B';
  countsByZone: Record<number, number>;
  maxCount: number;
  totalCount: number;
  intensityByZone: Record<number, number>; // Normalized 0.0 to 1.0
}

/**
 * Aggregates scouting events into zone counts and normalized intensity per team side.
 * Note: Since events currently record zone granularity (1-6) rather than continuous (x, y)
 * impact coordinates, heat is calculated at zone density centers without inventing false precision.
 */
export function calculateTeamZoneDensity(
  events: readonly ScoutingEvent[],
  teamSide: 'A' | 'B'
): ZoneHeatmapData {
  const countsByZone: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let totalCount = 0;

  for (const event of events) {
    if (event.teamId === teamSide) {
      const zone = event.originZone ?? event.targetZone;
      if (zone && zone >= 1 && zone <= 6) {
        countsByZone[zone] = (countsByZone[zone] ?? 0) + 1;
        totalCount++;
      }
    }
  }

  const maxCount = Math.max(...Object.values(countsByZone), 0);
  const intensityByZone: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  for (let z = 1; z <= 6; z++) {
    intensityByZone[z] = maxCount > 0 ? countsByZone[z] / maxCount : 0;
  }

  return { teamSide, countsByZone, maxCount, totalCount, intensityByZone };
}
