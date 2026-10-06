import { describe, expect, it } from 'vitest';
import {
  calculateTeamZoneDensity,
  zoneToCourtCell
} from './VolleyballCourtGeometry';
import type { ScoutingEvent } from '../../../core/scouting/ScoutingEvent';

function mockEvent(teamId: 'A' | 'B', originZone: number): ScoutingEvent {
  return {
    id: `ev-${Math.random()}`,
    sport: 'volleyball',
    matchId: 'm-1',
    sessionId: 's-1',
    setNumber: 1,
    teamId,
    skill: 'attack',
    originZone,
    evaluation: 1,
    timestamp: Date.now(),
    createdAt: new Date().toISOString(),
    inputSource: 'controller'
  };
}

describe('VolleyballCourtGeometry', () => {
  describe('zoneToCourtCell opposing side orientation', () => {
    it('places front-row zones (4, 3, 2) adjacent to the net for both teams', () => {
      // Team A front-row (row 1, immediately above the net at row 1.5)
      for (const zone of [2, 3, 4]) {
        const cell = zoneToCourtCell('A', zone);
        expect(cell.isFrontRow).toBe(true);
        expect(cell.row).toBe(1);
      }

      // Team B front-row (row 2, immediately below the net)
      for (const zone of [2, 3, 4]) {
        const cell = zoneToCourtCell('B', zone);
        expect(cell.isFrontRow).toBe(true);
        expect(cell.row).toBe(2);
      }
    });

    it('aligns tactical positions correctly across the net', () => {
      // Team B left attacker (Z4) hits toward Team A right blocker (Z2)
      const bZone4 = zoneToCourtCell('B', 4);
      const aZone2 = zoneToCourtCell('A', 2);
      expect(bZone4.col).toBe(0);
      expect(aZone2.col).toBe(0);

      // Middle vs Middle (Z3 vs Z3)
      const bZone3 = zoneToCourtCell('B', 3);
      const aZone3 = zoneToCourtCell('A', 3);
      expect(bZone3.col).toBe(1);
      expect(aZone3.col).toBe(1);

      // Team B right attacker (Z2) hits toward Team A left blocker (Z4)
      const bZone2 = zoneToCourtCell('B', 2);
      const aZone4 = zoneToCourtCell('A', 4);
      expect(bZone2.col).toBe(2);
      expect(aZone4.col).toBe(2);
    });

    it('places back-row zones (5, 6, 1) near the baseline for both teams', () => {
      // Team A back row at row 0 (top baseline)
      for (const zone of [1, 6, 5]) {
        const cell = zoneToCourtCell('A', zone);
        expect(cell.isFrontRow).toBe(false);
        expect(cell.row).toBe(0);
      }

      // Team B back row at row 3 (bottom baseline)
      for (const zone of [5, 6, 1]) {
        const cell = zoneToCourtCell('B', zone);
        expect(cell.isFrontRow).toBe(false);
        expect(cell.row).toBe(3);
      }
    });

    it('throws error for invalid zones', () => {
      expect(() => zoneToCourtCell('A', 0)).toThrow();
      expect(() => zoneToCourtCell('B', 7)).toThrow();
    });
  });

  describe('calculateTeamZoneDensity (Requirement 97)', () => {
    it('correctly aggregates counts and normalizes intensity independently per side', () => {
      const events: ScoutingEvent[] = [
        // Team A: Z4 × 4, Z2 × 2, Z6 × 1
        mockEvent('A', 4),
        mockEvent('A', 4),
        mockEvent('A', 4),
        mockEvent('A', 4),
        mockEvent('A', 2),
        mockEvent('A', 2),
        mockEvent('A', 6),
        // Team B: Z1 × 3, Z3 × 1
        mockEvent('B', 1),
        mockEvent('B', 1),
        mockEvent('B', 1),
        mockEvent('B', 3)
      ];

      const densityA = calculateTeamZoneDensity(events, 'A');
      expect(densityA.countsByZone[4]).toBe(4);
      expect(densityA.countsByZone[2]).toBe(2);
      expect(densityA.countsByZone[6]).toBe(1);
      expect(densityA.countsByZone[1]).toBe(0);
      expect(densityA.maxCount).toBe(4);

      // Verify A intensities
      expect(densityA.intensityByZone[4]).toBe(1.0); // Highest
      expect(densityA.intensityByZone[2]).toBe(0.5);
      expect(densityA.intensityByZone[6]).toBe(0.25);
      expect(densityA.intensityByZone[1]).toBe(0);

      // Verify B normalized independently
      const densityB = calculateTeamZoneDensity(events, 'B');
      expect(densityB.countsByZone[1]).toBe(3);
      expect(densityB.countsByZone[3]).toBe(1);
      expect(densityB.maxCount).toBe(3);

      expect(densityB.intensityByZone[1]).toBe(1.0);
      expect(densityB.intensityByZone[3]).toBeCloseTo(0.333, 2);
      expect(densityB.intensityByZone[4]).toBe(0);
    });

    it('handles zero events safely without NaN', () => {
      const density = calculateTeamZoneDensity([], 'A');
      expect(density.maxCount).toBe(0);
      expect(density.totalCount).toBe(0);
      for (let z = 1; z <= 6; z++) {
        expect(density.intensityByZone[z]).toBe(0);
      }
    });
  });
});
