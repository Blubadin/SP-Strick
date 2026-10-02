import type { ZoneOption } from './volleyball.types';

/**
 * Standard Volleyball Court Zone definitions:
 * NET
 * 4  3  2  (Front row)
 * 5  6  1  (Back row)
 */
export const VOLLEYBALL_ZONES: ZoneOption[] = [
  { id: 1, i18nKey: 'zone.1', gridRow: 2, gridCol: 3, order: 0 },
  { id: 2, i18nKey: 'zone.2', gridRow: 1, gridCol: 3, order: 1 },
  { id: 3, i18nKey: 'zone.3', gridRow: 1, gridCol: 2, order: 2 },
  { id: 4, i18nKey: 'zone.4', gridRow: 1, gridCol: 1, order: 3 },
  { id: 5, i18nKey: 'zone.5', gridRow: 2, gridCol: 1, order: 4 },
  { id: 6, i18nKey: 'zone.6', gridRow: 2, gridCol: 2, order: 5 }
];

export function getZoneOption(zoneId: number): ZoneOption | undefined {
  return VOLLEYBALL_ZONES.find((z) => z.id === zoneId);
}
