/**
 * One way to read and label a player's skill rating.
 *
 * Two separate mistakes were spread across the match/* screens and the chat
 * header before this existed:
 *
 * 1. `p.dupr ?? parseFloat(p.self_rating) ?? 0` renders an UNRATED player as
 *    "0.0", which reads as a real and very bad score rather than as absent.
 * 2. A self-rating displayed under a "DUPR" label passes off a number the
 *    player chose themselves as a verified one.
 *
 * useFinderCandidates.ts already solved both with a rating source; this lifts
 * that logic out so every surface agrees.
 *
 * The icon belongs with this too: pickleball ratings use `speedometer-outline`
 * across the app (Home, Games, Tournaments, Partner, player profiles). A star
 * means a review score — facility ratings from Google — and using it for a
 * skill rating conflates the two.
 */

export type RatingSource = 'dupr' | 'self' | 'none';

export type PlayerRating = {
  /** 0 when `source` is 'none'. Never render this without checking the source. */
  value: number;
  source: RatingSource;
};

export function resolvePlayerRating(
  dupr: number | null | undefined,
  selfRating: string | number | null | undefined,
): PlayerRating {
  if (dupr != null) return { value: dupr, source: 'dupr' };

  const selfNum = typeof selfRating === 'number' ? selfRating
    : selfRating ? Number.parseFloat(selfRating)
      : NaN;
  if (Number.isFinite(selfNum)) return { value: selfNum, source: 'self' };

  return { value: 0, source: 'none' };
}

/** "3.7 DUPR" | "3.7 Self" | "Unrated". */
export function formatPlayerRating({ value, source }: PlayerRating): string {
  if (source === 'none') return 'Unrated';
  return `${value.toFixed(1)} ${source === 'dupr' ? 'DUPR' : 'Self'}`;
}

/** Bare number for tight layouts: "3.7", or "—" when there is no rating. */
export function formatPlayerRatingShort({ value, source }: PlayerRating): string {
  return source === 'none' ? '—' : value.toFixed(1);
}
