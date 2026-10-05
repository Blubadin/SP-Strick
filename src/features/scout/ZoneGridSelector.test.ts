import { describe, expect, it } from 'vitest';
import { getGridZone } from './ZoneGridSelector';

describe('rectangular volleyball zone selection', () => {
  it.each([
    [-1, -1, 4], [0, -1, 3], [1, -1, 2],
    [-1, 1, 5], [0, 1, 6], [1, 1, 1]
  ])('maps (%s,%s) to court zone %s', (x, y, zone) => {
    expect(getGridZone(x, y)).toBe(zone);
  });

  it('cancels on centered or horizontal-only input rather than retaining an old selection', () => {
    expect(getGridZone(0, 0)).toBeNull();
    expect(getGridZone(.1, .1)).toBeNull();
    expect(getGridZone(1, 0)).toBeNull();
  });

  it('rejects invalid input and selects the middle column for near-vertical input', () => {
    expect(getGridZone(Number.NaN, 1)).toBeNull();
    expect(getGridZone(0.25, -0.8)).toBe(3);
    expect(getGridZone(-0.25, .8)).toBe(6);
  });
});
