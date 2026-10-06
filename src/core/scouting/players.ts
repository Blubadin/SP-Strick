import type { Player } from '../persistence/database';

/**
 * Returns the active court players (up to 6) in their original Setup order.
 * Isolates lineup and substitution logic so future rotation/lineup features
 * can be plugged in without scattering roster slicing across components.
 */
export function getActiveCourtPlayers(players: Player[]): Player[] {
  return players.slice(0, 6);
}
