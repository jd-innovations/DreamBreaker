import * as Location from 'expo-location';

/**
 * Turning coordinates into a place, and a place into coordinates.
 *
 * Extracted from app/onboarding/area-recommendations.tsx, which owned the only
 * copies. That was fine while onboarding was the only screen that set a
 * location — and it was, which is the problem: `profiles.location_lat/lng` had
 * exactly one writer in the whole app, so a player who moved, denied location
 * permission at signup, or onboarded from the wrong city had no way to ever
 * correct it. Location Settings needs the same helpers to fix that.
 */

export type PlaceEstimate = {
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Where someone lands when every lookup fails. A real place rather than
 * nulls, because the onboarding screens it feeds render area statistics and
 * "0 players near null" is worse than a plausible default the user can change.
 *
 * Do NOT use this as a fallback when SAVING a location — writing a guess into
 * a profile is how someone ends up permanently listed in a town they have
 * never visited. Save paths check for null and refuse instead.
 */
export const FALLBACK_AREA: PlaceEstimate = {
  city: 'Lakewood Ranch',
  state: 'FL',
  lat: 27.3864,
  lng: -82.4346,
};

/** Coordinates → city/state. Falls back to FALLBACK_AREA's labels, never its coords. */
export async function describeCoords(lat: number, lng: number): Promise<PlaceEstimate> {
  let city: string | null = null;
  let state: string | null = null;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (place) {
      city = place.city ?? place.subregion ?? place.district ?? null;
      state = place.region ?? null;
    }
  } catch {
    // Reverse geocoding unavailable (offline / no provider).
  }
  return {
    city: city ?? FALLBACK_AREA.city,
    state: state ?? FALLBACK_AREA.state,
    lat,
    lng,
  };
}

/** Rough position from the network, for when there is no permission or no fix. */
export async function estimateFromIp(): Promise<PlaceEstimate> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('ip_lookup_failed');
    const row = await response.json() as {
      city?: string;
      region_code?: string;
      region?: string;
      latitude?: number;
      longitude?: number;
    };
    return {
      city: row.city ?? FALLBACK_AREA.city,
      state: row.region_code ?? row.region ?? FALLBACK_AREA.state,
      lat: typeof row.latitude === 'number' ? row.latitude : FALLBACK_AREA.lat,
      lng: typeof row.longitude === 'number' ? row.longitude : FALLBACK_AREA.lng,
    };
  } catch {
    return FALLBACK_AREA;
  }
}

/**
 * A typed place name → coordinates, for people who want to set an area other
 * than where they are standing.
 *
 * Returns null rather than a fallback on failure. A search that quietly
 * resolved to Lakewood Ranch because the geocoder was offline would save the
 * wrong city under the user's own instruction, which is worse than telling
 * them it did not work.
 *
 * The result is round-tripped through reverseGeocodeAsync so the stored city
 * and state are the geocoder's canonical spelling rather than whatever was
 * typed — "st pete" and "Saint Petersburg" should not become two places.
 */
export async function searchPlace(query: string): Promise<PlaceEstimate | null> {
  const term = query.trim();
  if (term.length < 3) return null;

  try {
    const [hit] = await Location.geocodeAsync(term);
    if (!hit) return null;
    const described = await describeCoords(hit.latitude, hit.longitude);
    return { ...described, lat: hit.latitude, lng: hit.longitude };
  } catch {
    return null;
  }
}
