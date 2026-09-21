/**
 * Distance between two points, in miles.
 *
 * Shared because three mobile screens and (as of 2026-09-21) the web
 * matchmaker all needed it, and three of them had hand-rolled their own copy
 * — `useFinderCandidates.haversineMiles`, a private `haversineMiles` in
 * players/[id].tsx, and a `haversineMilesRough` in marketplace.tsx. They agreed
 * on the maths, which is the only reason nobody noticed.
 */

export type LatLng = { lat: number; lng: number };

/** Mean Earth radius. Miles rather than km because every surface displays miles. */
const EARTH_MILES = 3958.8;

export function haversineMiles(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(a));
}

/**
 * Distance when either side's coordinates may be missing.
 *
 * Returns null rather than a sentinel, because the two are not the same thing
 * and conflating them is exactly what broke web's matchmaker: its filter read a
 * missing distance as 999 miles and silently emptied the deck the moment anyone
 * picked a radius.
 */
export function distanceMilesOrNull(
  from: { lat?: number | null; lng?: number | null } | null | undefined,
  to: { lat?: number | null; lng?: number | null } | null | undefined,
): number | null {
  if (from?.lat == null || from?.lng == null || to?.lat == null || to?.lng == null) return null;
  const miles = haversineMiles(
    { lat: from.lat, lng: from.lng },
    { lat: to.lat, lng: to.lng },
  );
  return Number.isFinite(miles) ? miles : null;
}

/**
 * "12 mi" / "0.4 mi" / null.
 *
 * Note the `!= null` rather than a truthiness check at every call site: zero
 * miles is a real, meaningful distance — the same building — and a falsy test
 * silently hides it.
 */
export function formatMiles(miles: number | null | undefined): string | null {
  if (miles == null || !Number.isFinite(miles)) return null;
  if (miles < 1) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}
