import { supabase } from '@/lib/supabase';
import type { Tables } from '@shared/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type Facility      = Tables<'facilities'>;
export type FacilityPhoto = Tables<'facility_photos'>;

// Convenience union for UI access-type badges.
export type FacilityAccessType =
  | 'public'         // public_access=true,  membership_required=false
  | 'membership'     // public_access=true,  membership_required=true
  | 'private';       // public_access=false

export function facilityAccessType(f: Facility): FacilityAccessType {
  if (!f.public_access)       return 'private';
  if (f.membership_required)  return 'membership';
  return 'public';
}

export type FacilitySearchParams = {
  lat?:          number;
  lng?:          number;
  radiusMiles?:  number;
  query?:        string;   // matches name/city/state/postal_code/address (ilike)
  city?:         string;
  state?:        string;
  publicOnly?:   boolean;  // if true, only public_access=true (physical public access)
  bookableOnly?: boolean;  // if true, only bookable_by_public=true (Booking Engine gate)
  verifiedOnly?: boolean;  // if true, only verified=true
  limit?:        number;
};

// Local type for the search_facilities_nearby RPC return rows.
// Mirrors the SQL RETURNS TABLE definition in migration 20260629000002.
// distance_meters is appended by the RPC; it is not a column in facilities.
type NearbyFacilityRow = Omit<Facility, 'coords'> & {
  distance_meters: number;
};



const MILES_TO_METERS = 1609.344;

// ─────────────────────────────────────────────────────────────────────────────
// FETCH FACILITIES (list / search)
// ─────────────────────────────────────────────────────────────────────────────
//
// When lat + lng + radiusMiles are all provided, uses the search_facilities_nearby
// PostGIS RPC (added in migration 20260629000002). Results are ordered by
// distance_meters ascending and include a distanceMeters field.
//
// Without location params, falls back to a plain SELECT ordered verified→name.

export type FacilityWithPrimaryPhoto = Facility & {
  primaryPhotoUrl: string | null;
  distanceMeters?: number;   // only present when fetched via proximity RPC
};

// Batch-loads the primary photo URL for each facility id (falling back to the
// first photo when none is marked primary). Used by the proximity RPC path,
// which — unlike the plain-select path — can't embed facility_photos in a
// single PostGIS RPC call.
async function fetchPrimaryPhotosByFacilityId(facilityIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (facilityIds.length === 0) return result;

  const { data, error } = await supabase
    .from('facility_photos')
    .select('facility_id, url, is_primary')
    .in('facility_id', facilityIds)
    .order('is_primary', { ascending: false });

  if (error || !data) return result;

  // Rows are ordered primary-first per facility, so the first row seen per
  // facility_id is the one to keep.
  for (const photo of data) {
    if (!result.has(photo.facility_id)) result.set(photo.facility_id, photo.url);
  }
  return result;
}

export async function fetchFacilities(
  params: FacilitySearchParams = {},
): Promise<FacilityWithPrimaryPhoto[]> {
  const { lat, lng, radiusMiles, query, city, state, publicOnly, bookableOnly, verifiedOnly, limit = 50 } = params;

  // ── Proximity path: use PostGIS RPC ────────────────────────────────────────
  if (lat != null && lng != null && radiusMiles != null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('search_facilities_nearby', {
      lat,
      lng,
      radius_meters:  radiusMiles * MILES_TO_METERS,
      search_query:   query         ?? null,
      verified_only:  verifiedOnly  ?? false,
      public_only:    publicOnly    ?? false,
      bookable_only:  bookableOnly  ?? false,
      result_limit:   limit,
    });

    if (error) throw error;

    const rows = (data ?? []) as NearbyFacilityRow[];
    const primaryPhotoById = await fetchPrimaryPhotosByFacilityId(rows.map(r => r.id));

    return rows.map(row => ({
      ...(row as unknown as Facility),
      coords:         null,   // coords is geography — not returned by RPC; null is safe here
      primaryPhotoUrl: primaryPhotoById.get(row.id) ?? null,
      distanceMeters:  row.distance_meters,
    }));
  }

  // ── Non-proximity path: plain SELECT ───────────────────────────────────────
  let q = supabase
    .from('facilities')
    .select('*, facility_photos!facility_photos_facility_id_fkey(url, is_primary)');

  if (query) {
    const like = `%${query}%`;
    q = q.or(
      `name.ilike.${like},city.ilike.${like},state.ilike.${like},postal_code.ilike.${like},address.ilike.${like}`,
    );
  }
  if (city)         q = q.ilike('city', city);
  if (state)        q = q.eq('state', state.toUpperCase());
  if (publicOnly)   q = q.eq('public_access', true);
  if (bookableOnly) q = q.eq('bookable_by_public', true);
  if (verifiedOnly) q = q.eq('verified', true);

  q = q.order('verified', { ascending: false })
       .order('name',     { ascending: true })
       .limit(limit);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map(row => {
    const photos  = (row.facility_photos ?? []) as { url: string; is_primary: boolean }[];
    const primary = photos.find(p => p.is_primary) ?? photos[0] ?? null;
    const { facility_photos: _photos, ...facility } = row as typeof row & { facility_photos: unknown };
    return {
      ...(facility as Facility),
      primaryPhotoUrl: primary?.url ?? null,
    };
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// TIERED SEARCH (in-radius first, then everywhere else)
// ─────────────────────────────────────────────────────────────────────────────
//
// Nearby's court search needs two things that pull against each other: results
// ordered by how close they are, and the ability to find a court outside the
// current radius at all. Doing it as one query means picking one — dropping
// lat/lng to search globally loses distance and distance ordering entirely,
// which is what the search box used to do.
//
// So: two passes over the SAME proximity RPC. `near` is the user's real
// radius; `wider` is everything else, found with a deliberately huge radius
// rather than the non-proximity plain-SELECT path. That distinction matters —
// the plain SELECT applies its LIMIT after ordering by name, so a national
// fallback through it would return the alphabetically-first N matches and no
// amount of client-side sorting could recover the nearest ones. Going through
// the RPC lets Postgres order by distance first, so the limit slices the
// CLOSEST out-of-radius matches, and every row still carries distance_meters.
//
// Callers that just want a plain search keep using fetchFacilities directly —
// this is additive, nothing else changes shape.

/**
 * Effectively "anywhere" for a US + territories directory (CONUS is ~2,800 mi
 * corner to corner; PR is ~1,600 mi from Miami, HI ~2,400 mi from CA). Big
 * enough that the second tier is a true fallback, not another radius the user
 * has to think about.
 */
export const WIDE_SEARCH_RADIUS_MILES = 6000;

export type TieredFacilityResults = {
  /** Matches inside the caller's own radius, nearest first. */
  near: FacilityWithPrimaryPhoto[];
  /** Matches outside it, nearest first. Never repeats anything in `near`. */
  wider: FacilityWithPrimaryPhoto[];
};

export async function searchFacilitiesTiered(params: {
  lat: number;
  lng: number;
  radiusMiles: number;
  query: string;
  limit?: number;
}): Promise<TieredFacilityResults> {
  const { lat, lng, radiusMiles, query, limit = 50 } = params;

  const [near, wide] = await Promise.all([
    fetchFacilities({ lat, lng, radiusMiles, query, limit }),
    fetchFacilities({ lat, lng, radiusMiles: WIDE_SEARCH_RADIUS_MILES, query, limit }),
  ]);

  // The wide pass is a superset of the near one by definition — subtract.
  const nearIds = new Set(near.map(f => f.id));
  return { near, wider: wide.filter(f => !nearIds.has(f.id)) };
}


// ─────────────────────────────────────────────────────────────────────────────
// FETCH FACILITY BY ID
// ─────────────────────────────────────────────────────────────────────────────

export type FacilityDetail = Facility & {
  photos: FacilityPhoto[];
  primaryPhotoUrl: string | null;
};

export async function fetchFacilityById(id: string): Promise<FacilityDetail | null> {
  const { data, error } = await supabase
    .from('facilities')
    .select('*, facility_photos!facility_photos_facility_id_fkey(*)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }

  const photos = (data.facility_photos ?? []) as FacilityPhoto[];
  const primary = photos.find(p => p.is_primary) ?? photos[0] ?? null;
  const { facility_photos: _photos, ...facility } = data as typeof data & { facility_photos: unknown };

  return {
    ...(facility as Facility),
    photos,
    primaryPhotoUrl: primary?.url ?? null,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// FETCH FACILITY PLAY EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export type FacilityPlayEvent = Tables<'play_events'>;

export async function fetchFacilityPlayEvents(facilityId: string): Promise<FacilityPlayEvent[]> {
  // Local calendar date, not UTC — event_date has no timezone, and
  // toISOString() drifts a day off local "today" outside UTC.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .eq('facility_id', facilityId)
    // Private two-player matches are not part of a venue's public schedule.
    .neq('event_type', 'practice')
    .gte('event_date', today)
    .not('status', 'in', '("cancelled","completed")')
    .order('event_date', { ascending: true });

  if (error) throw error;
  return data ?? [];
}


// ─────────────────────────────────────────────────────────────────────────────
// FETCH FACILITY TOURNAMENTS
// ─────────────────────────────────────────────────────────────────────────────

export type FacilityTournament = {
  id:              string;
  name:            string;
  slug:            string | null;
  city:            string | null;
  state:           string | null;
  event_date:      string;
  status:          string | null;
  entry_fee_cents: number | null;
  draw_size:       number | null;
  spots_filled:    number | null;
  format:          string | null;
  cover_img_url:   string | null;
};

export async function fetchFacilityTournaments(facilityId: string): Promise<FacilityTournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, slug, city, state, event_date, status, entry_fee_cents, draw_size, spots_filled, format, cover_img_url')
    .eq('facility_id', facilityId)
    .not('status', 'in', '("draft","pending_approval","cancelled")')
    .order('event_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as FacilityTournament[];
}


// ─────────────────────────────────────────────────────────────────────────────
// SUGGEST / CLAIM FACILITY — removed 2026-11-25
// ─────────────────────────────────────────────────────────────────────────────
// suggestFacility() and claimFacility() wrote to facilities directly through two
// RLS policies that let any signed-in user add a live venue or rewrite most
// columns of any unclaimed one. Neither had a caller; both policies were dropped
// in 20261125090000_facilities_close_direct_writes.sql. Claiming is the
// facility_manager_applications flow; new locations and edits will go through a
// review table that only an admin applies.


// ─────────────────────────────────────────────────────────────────────────────
// PHOTO HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchFacilityPhotos(facilityId: string): Promise<FacilityPhoto[]> {
  const { data, error } = await supabase
    .from('facility_photos')
    .select('*')
    .eq('facility_id', facilityId)
    .order('is_primary', { ascending: false }) // primary first
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addFacilityPhoto(
  facilityId: string,
  url: string,
  isPrimary = false,
): Promise<FacilityPhoto> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('facility_photos')
    .insert({
      facility_id: facilityId,
      url,
      is_primary:  isPrimary,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
