/**
 * A tournament's real capacity and spots left.
 *
 * `tournaments.draw_size` is set at creation and never kept in step with the
 * divisions added afterwards (RATE LAS VEGAS OPEN - DEMO: draw_size 120, its
 * divisions hold 308), while `spots_filled` counts every division. So with
 * divisions, capacity is their total; without, the tournament's own draw size.
 * Spots left never goes below zero. Shared by web and mobile.
 */
export function tournamentCapacity(drawSize: number, divisionDrawSizes: readonly number[] = []): number {
  const divTotal = divisionDrawSizes.reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);
  return divTotal > 0 ? divTotal : Math.max(0, drawSize || 0);
}

export function spotsLeft(capacity: number, filled: number): number {
  return Math.max(0, capacity - Math.max(0, filled || 0));
}

/** Percent filled, 0-100, for a fill bar. */
export function fillPercent(capacity: number, filled: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, filled) / capacity) * 100));
}
