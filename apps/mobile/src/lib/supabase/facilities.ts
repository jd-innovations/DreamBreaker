import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

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

export type SuggestFacilityInput = {
  // Required
  name:        string;
  address:     string;
  city:        string;
  state:       string;
  latitude:    number;
  longitude:   number;
  // Optional
  postal_code?:         string;
  phone?:               string;
  website?:             string;
  description?:         string;
  court_count?:         number;
  indoor_courts?:       number;
  outdoor_courts?:      number;
  surface_type?:        string;
  lighting?:            boolean;
  restrooms?:           boolean;
  water?:               boolean;
  parking?:             boolean;
  public_access?:       boolean;
  membership_required?: boolean;
  bookable_by_public?:  boolean;
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
// SUGGEST FACILITY (authenticated insert)
// ─────────────────────────────────────────────────────────────────────────────
// verified and claim_status are never accepted from input — always forced here.

export async function suggestFacility(input: SuggestFacilityInput): Promise<Facility> {
  const { data, error } = await supabase
    .from('facilities')
    .insert({
      name:                input.name,
      address:             input.address,
      city:                input.city,
      state:               input.state.toUpperCase(),
      latitude:            input.latitude,
      longitude:           input.longitude,
      postal_code:         input.postal_code         ?? null,
      phone:               input.phone               ?? null,
      website:             input.website             ?? null,
      description:         input.description         ?? null,
      court_count:         input.court_count         ?? 0,
      indoor_courts:       input.indoor_courts       ?? 0,
      outdoor_courts:      input.outdoor_courts      ?? 0,
      surface_type:        input.surface_type        ?? null,
      lighting:            input.lighting            ?? false,
      restrooms:           input.restrooms           ?? false,
      water:               input.water               ?? false,
      parking:             input.parking             ?? false,
      public_access:       input.public_access       ?? true,
      membership_required: input.membership_required ?? false,
      bookable_by_public:  input.bookable_by_public  ?? false,
      // Always forced — user input cannot override these:
      verified:            false,
      claim_status:        'unclaimed',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}


// ─────────────────────────────────────────────────────────────────────────────
// CLAIM FACILITY (submit claim for admin review)
// ─────────────────────────────────────────────────────────────────────────────
// Sets claim_status = 'pending'. Does not set owner_user_id — that is done by
// admin on approval. RLS: only authenticated users; owner update policy applies
// only when owner_user_id = auth.uid(), which means unclaimed facilities cannot
// be updated by the owner policy. The authenticated insert policy covers
// suggestFacility, but the claim update needs a separate check.
//
// RLS ISSUE: The current "owner update" policy requires owner_user_id = auth.uid().
// An unclaimed facility has owner_user_id = null, so the policy blocks this update.
// The admin policy allows it, but a regular user cannot claim without admin.
//
// WORKAROUND until a dedicated RLS policy is added:
//   This function will throw a permission error for non-admin users on unclaimed
//   facilities. A future migration should add:
//     create policy "facilities: authenticated claim"
//       on public.facilities for update
//       using (auth.uid() is not null and claim_status = 'unclaimed')
//       with check (claim_status = 'pending' and owner_user_id is null);
//   Track this gap — do not silently swallow the error here.

export async function claimFacility(facilityId: string): Promise<void> {
  const { error } = await supabase
    .from('facilities')
    .update({ claim_status: 'pending' })
    .eq('id', facilityId)
    .eq('claim_status', 'unclaimed'); // safety: never overwrite pending/claimed

  if (error) throw error;
}


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
