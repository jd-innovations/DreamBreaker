// Haversine distance, shared by the Community Play "nearby" list and any
// future facility/court list. Mirrors mobile's inline distanceMiles() in
// apps/mobile/src/app/(tabs)/nearby.tsx — kept here as a single named export
// instead of duplicated per screen, since web has more than one place that
// will want it (events list now, facilities/courts list later).

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in miles. */
export function distanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Formats a distance for display, matching mobile's "X mi away" copy. */
export function formatDistanceMiles(miles: number): string {
  if (miles < 0.1) return "Nearby";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// Distance filter steps shared by the UI (chip row) — mirrors mobile's
// DISTANCE_STEPS in FindGamesFilterModal.tsx exactly so filter semantics
// stay identical across platforms.
export const DISTANCE_STEPS = ["5 mi", "25 mi", "50 mi", "Any distance"] as const;
export type DistanceStepIndex = 0 | 1 | 2 | 3;

const DISTANCE_STEP_MILES: Record<Exclude<DistanceStepIndex, 3>, number> = {
  0: 5,
  1: 25,
  2: 50,
};

/** Returns the mile cap for a distance-step index, or null for "Any distance". */
export function distanceStepToMiles(step: DistanceStepIndex): number | null {
  if (step === 3) return null;
  return DISTANCE_STEP_MILES[step];
}
