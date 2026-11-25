// Public court directory (/courts) — data and URL helpers. Phase 1, 2026-11-25.
//
// Everything here reads with the cookie-free anon client (ogClient): these
// pages are for signed-out visitors and crawlers, RLS ("facilities: public
// read") decides what they see, and no visitor session is needed. Pure helpers
// (slugs, search sanitising, quality rules) are exported separately so they can
// be unit-tested without a database.
//
// URL shape: /courts/<state>/<city>/<slug>, e.g.
//   /courts/fl/sarasota/payne-park-sarasota-fl
// <state> is the lowercase USPS code, <city> is citySlug(city), <slug> is
// facilities.slug (regenerated clean in 20261125100000_facility_slug_fix.sql).

import { unstable_cache } from "next/cache";
import { ogClient } from "@/lib/og/client";
import { STATE_NAMES, citySlug, searchWords } from "./places";

export {
  STATE_NAMES, stateFromParam, citySlug, stateHref, cityHref, facilityHref, searchWords, courtSummary,
} from "./places";

// ─────────────────────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Slugs and URLs
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Search input
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────────────────

export type CourtListing = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string;
  state: string;
  court_count: number | null;
  indoor_courts: number | null;
  outdoor_courts: number | null;
  lighting: boolean | null;
  public_access: boolean | null;
  photo_url: string | null;
};

const LISTING_COLUMNS =
  "id, name, slug, address, city, state, court_count, indoor_courts, outdoor_courts, lighting, public_access, " +
  "facility_photos!facility_photos_facility_id_fkey(url, is_primary)";

type ListingRow = Omit<CourtListing, "photo_url"> & { facility_photos: { url: string; is_primary: boolean }[] | null };

function toListing(row: ListingRow): CourtListing {
  const photos = row.facility_photos ?? [];
  const primary = photos.find((p) => p.is_primary) ?? photos[0] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { facility_photos: _photos, ...rest } = row;
  return { ...rest, photo_url: primary?.url ?? null };
}

/** Rows with no slug, city or state cannot have a URL; they are left out of every list. */
function hasUrl(r: { slug: string | null; city: string | null; state: string | null }): boolean {
  return !!(r.slug && r.city && r.state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Directory index (states and cities with counts)
// ─────────────────────────────────────────────────────────────────────────────

/** `spellings`: every raw city value sharing the slug ("St. Pete" / "St Pete", case variants). */
export type CityCount = { city: string; slug: string; count: number; spellings: string[] };
export type StateCount = { state: string; name: string; count: number };

/** PostgREST returns at most 1,000 rows per request; read state/city in pages. */
async function readAllPlaces(): Promise<{ state: string; city: string }[]> {
  const db = ogClient();
  const out: { state: string; city: string }[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db
      .from("facilities")
      .select("state, city, slug")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) if (hasUrl(r)) out.push({ state: r.state!.toUpperCase(), city: r.city!.trim() });
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Every state and city with its facility count. One read of ~2k short rows,
 * cached for an hour: the index changes when an import or approval lands, and
 * an hour's lag on a count is fine.
 */
export const getDirectoryIndex = unstable_cache(
  async (): Promise<{ states: StateCount[]; cities: Record<string, CityCount[]> }> => {
    const places = await readAllPlaces();
    const byState = new Map<string, Map<string, CityCount>>();
    for (const { state, city } of places) {
      if (!STATE_NAMES[state]) continue;
      const slug = citySlug(city);
      if (!slug) continue;
      const cities = byState.get(state) ?? new Map<string, CityCount>();
      const c = cities.get(slug) ?? { city, slug, count: 0, spellings: [] };
      c.count += 1;
      if (!c.spellings.includes(city)) c.spellings.push(city);
      cities.set(slug, c);
      byState.set(state, cities);
    }
    const states: StateCount[] = [];
    const cities: Record<string, CityCount[]> = {};
    for (const [state, map] of byState) {
      const list = [...map.values()].sort((a, b) => a.city.localeCompare(b.city));
      cities[state] = list;
      states.push({ state, name: STATE_NAMES[state], count: list.reduce((n, c) => n + c.count, 0) });
    }
    states.sort((a, b) => a.name.localeCompare(b.name));
    return { states, cities };
  },
  ["courts-directory-index-v2"],
  { revalidate: 3600 },
);

// ─────────────────────────────────────────────────────────────────────────────
// Lists
// ─────────────────────────────────────────────────────────────────────────────

/** Facilities in one city, matched on every raw spelling that shares its slug. */
export async function listCity(state: string, spellings: string[]): Promise<CourtListing[]> {
  const db = ogClient();
  const { data, error } = await db
    .from("facilities")
    .select(LISTING_COLUMNS)
    .eq("state", state)
    .in("city", spellings.slice(0, 20))
    .order("court_count", { ascending: false, nullsFirst: false })
    .order("name")
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as ListingRow[]).filter(hasUrl).map(toListing);
}

/** Text search over name, city, ZIP and address. Every word must match one of them. */
export async function searchCourts(q: string): Promise<CourtListing[]> {
  const words = searchWords(q);
  if (words.length === 0) return [];
  let query = ogClient().from("facilities").select(LISTING_COLUMNS);
  for (const w of words) {
    const like = `%${w}%`;
    const clauses = [`name.ilike.${like}`, `city.ilike.${like}`, `postal_code.ilike.${like}`, `address.ilike.${like}`];
    if (/^[A-Za-z]{2}$/.test(w) && STATE_NAMES[w.toUpperCase()]) clauses.push(`state.eq.${w.toUpperCase()}`);
    query = query.or(clauses.join(","));
  }
  const { data, error } = await query
    .order("court_count", { ascending: false, nullsFirst: false })
    .order("name")
    .limit(60);
  if (error) throw error;
  return ((data ?? []) as unknown as ListingRow[]).filter(hasUrl).map(toListing);
}

// ─────────────────────────────────────────────────────────────────────────────
// One facility
// ─────────────────────────────────────────────────────────────────────────────

export type CourtDetail = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  court_count: number | null;
  indoor_courts: number | null;
  outdoor_courts: number | null;
  surface_type: string | null;
  lighting: boolean | null;
  restrooms: boolean | null;
  water: boolean | null;
  parking: boolean | null;
  public_access: boolean | null;
  membership_required: boolean | null;
  reservation_required: boolean | null;
  open_play_available: boolean | null;
  lessons_available: boolean | null;
  pro_shop: boolean | null;
  wheelchair_accessible: boolean | null;
  hours_summary: string | null;
  booking_url: string | null;
  data_source: string | null;
  verified: boolean | null;
  business_status: string | null;
  updated_at: string | null;
  photos: string[];
};

const DETAIL_COLUMNS =
  "id, name, slug, address, address_line_2, city, state, postal_code, latitude, longitude, phone, website, " +
  "description, court_count, indoor_courts, outdoor_courts, surface_type, lighting, restrooms, water, parking, " +
  "public_access, membership_required, reservation_required, open_play_available, lessons_available, pro_shop, " +
  "wheelchair_accessible, hours_summary, booking_url, data_source, verified, business_status, updated_at, " +
  "facility_photos!facility_photos_facility_id_fkey(url, is_primary)";

type DetailRow = Omit<CourtDetail, "photos"> & { facility_photos: { url: string; is_primary: boolean }[] | null };

function toDetail(row: DetailRow): CourtDetail {
  const photos = [...(row.facility_photos ?? [])]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((p) => p.url);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { facility_photos: _p, ...rest } = row;
  return { ...rest, latitude: rest.latitude == null ? null : Number(rest.latitude), longitude: rest.longitude == null ? null : Number(rest.longitude), photos };
}

export async function getCourtBySlug(slug: string): Promise<CourtDetail | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const { data, error } = await ogClient().from("facilities").select(DETAIL_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  const row = data as unknown as DetailRow | null;
  return row && hasUrl(row) ? toDetail(row) : null;
}

export async function getCourtById(id: string): Promise<CourtDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await ogClient().from("facilities").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as unknown as DetailRow | null;
  return row && hasUrl(row) ? toDetail(row) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page quality (what search engines are asked to index)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A facility page is worth indexing when it says more than a name: an address
 * plus either a court count or a photo. Thin rows still get a page (shares and
 * in-site links work) but carry noindex, so hundreds of near-empty pages do not
 * count against the site.
 */
export function isIndexable(f: Pick<CourtDetail, "address" | "court_count" | "photos">): boolean {
  return !!f.address && ((f.court_count ?? 0) > 0 || f.photos.length > 0);
}

