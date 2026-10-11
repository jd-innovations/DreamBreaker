// Decorative stock photography used as backdrops and as the placeholder for
// tournaments that have no cover image of their own.
//
// These are design assets, not sample data. They were extracted from
// `src/data/mock-data.ts` when that file was deleted in item 6.1 — everything
// else in it was fabricated tournaments, players and match results that could
// be mistaken for real records. Image URLs cannot be, so they live here.

/** Full-bleed hero backdrop on the public landing page. */
export const HERO_IMG =
  "https://images.unsplash.com/photo-1618551763300-dc7eb8ce3560?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwxfHxwaWNrbGViYWxsJTIwYWN0aW9uJTIwcG9ydHJhaXR8ZW58MHx8fHwxNzgxMjYzMzI0fDA&ixlib=rb-4.1.0&q=85";

/** Generic court photo, used where a tournament has no `cover_img_url`. */
export const COURT_IMG =
  "https://images.unsplash.com/photo-1737477004595-e9b659bb44ca?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHw0fHxwaWNrbGViYWxsJTIwYWN0aW9uJTIwcG9ydHJhaXR8ZW58MHx8fHwxNzgxMjYzMzI0fDA&ixlib=rb-4.1.0&q=85";

/**
 * The default cover for any event or tournament without one of its own.
 * The SAME photo as the app (apps/mobile/assets/images/default-court-cover.jpg,
 * copied to web/public/images/). Before 2026-10-11 web used a different
 * Unsplash photo for tournaments and no image at all for Community Play, so
 * one event looked different in each app. Replace both files together.
 */
export const DEFAULT_EVENT_COVER = "/images/default-court-cover.jpg";

/** The uploaded cover when there is one, otherwise the shared default. */
export function eventCover(url: string | null | undefined): string {
  return url && url.length > 0 ? url : DEFAULT_EVENT_COVER;
}
