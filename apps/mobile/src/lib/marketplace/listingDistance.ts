// Distance filtering for the Marketplace grid.
//
// Extracted from (tabs)/marketplace.tsx during Phase 0 of
// MARKETPLACE_MAP_AUDIT.md (v3) so the radius rule is testable without an RN
// test environment. Deliberately dependency-free — no react-native, no supabase
// client — which is what lets vitest import it directly (see
// apps/mobile/vitest.config.mts, which is narrow on purpose).
//
// SCOPE NOTE: the audit records four independent haversine implementations
// (§1.7) and folds them into one lib/geo.ts in Phase 2. This is not that
// consolidation — it moves the Marketplace copy out of the screen so the
// defect below can have a test, and Phase 2 will absorb it along with the
// other three.

export type Coordinates = { lat: number; lng: number };

/** Just the coordinate fields — structural, so any listing row shape fits. */
export type ListingCoordinates = {
  location_lat: number | null;
  location_lng: number | null;
};

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

/**
 * Filter listings to those within `radiusMiles` of `origin`.
 *
 * A listing with no coordinates is KEPT, not dropped. This is the Phase 0 fix
 * for MARKETPLACE_MAP_AUDIT.md §4.2:
 *
 *   The previous rule excluded any listing whose coordinates were null once a
 *   radius was picked. That reads as reasonable — distance to an unknown point
 *   cannot be measured — but production has zero listings with coordinates
 *   (verified 2026-09-08: 2 listings, 1 active, 0 with a non-null
 *   location_lat), so selecting *any* radius emptied the grid every time.
 *
 *   The root cause is upstream: create/index.tsx copies the seller's profile
 *   coordinate, and profile coordinates are only ever written during
 *   onboarding, so most sellers have none to copy. Phase 1 replaces that with
 *   an explicitly chosen public pickup coordinate; until then, "distance
 *   unknown" must not mean "hide it".
 *
 * Trade-off, stated plainly: an un-located listing can appear under a 5-mile
 * filter while actually being far away. That is strictly better than a filter
 * that returns nothing at all, and it stops being reachable once Phase 1 gives
 * every listing a coordinate.
 *
 * Returns the input array unchanged when there is nothing to filter by, so the
 * caller keeps referential equality on the common path.
 */
export function filterListingsByRadius<T extends ListingCoordinates>(
  listings: T[],
  origin: Coordinates | null,
  radiusMiles: number | null,
): T[] {
  if (radiusMiles == null || origin == null) return listings;

  return listings.filter((listing) => {
    if (listing.location_lat == null || listing.location_lng == null) return true;
    return (
      haversineMiles(origin.lat, origin.lng, listing.location_lat, listing.location_lng) <=
      radiusMiles
    );
  });
}
