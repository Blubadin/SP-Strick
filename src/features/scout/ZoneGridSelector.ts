/** Stick directions match the court, rather than angular sectors around a wheel. */
export function getGridZone(x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) < 0.35) return null;
  const column = x < -0.35 ? 0 : x > 0.35 ? 2 : 1;
  return (y < 0 ? [4, 3, 2] : [5, 6, 1])[column];
}
