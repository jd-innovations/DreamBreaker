import { supabase } from '@/lib/supabase';
import type { Tables, Database } from '@shared/database.types';
import {
  DEFAULT_FREE_LISTING_LIMIT,
  generateListingTitle,
  normalizeModelName,
  type MarketplaceCondition,
} from './constants';
import { notifyListingsUpdated } from './listingEvents';

export type MarketplaceListing = Tables<'marketplace_listings'>;
export type MarketplaceListingPhoto = Tables<'marketplace_listing_photos'>;

/** The public handoff spot, joined from facilities via pickup_facility_id. */
export type ListingPickupFacility = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type MarketplaceListingWithPhotos = MarketplaceListing & {
  photos: MarketplaceListingPhoto[];
  pickupFacility: ListingPickupFacility | null;
};

export type MarketplaceListingCard = MarketplaceListing & {
  primaryPhotoUrl: string | null;
};

const LISTING_WITH_PHOTOS_SELECT = '*, photos:marketplace_listing_photos(*)';

// ── Fetch / search ───────────────────────────────────────────────────────────

export type ListingSort = 'newest' | 'price_asc' | 'price_desc';

export type FetchListingsParams = {
  query?: string;
  brand?: string;
  condition?: MarketplaceCondition;
  minPriceCents?: number;
  maxPriceCents?: number;
  sort?: ListingSort;
  sellerId?: string; // "My Listings" — includes non-active statuses for that seller
  /** Same "offers this" semantics as fetchListingsNearby. */
  offers?: 'local_pickup' | 'shipping';
  limit?: number;
};

export async function fetchListings(params: FetchListingsParams = {}): Promise<MarketplaceListingCard[]> {
  let q = supabase.from('marketplace_listings').select(LISTING_WITH_PHOTOS_SELECT);

  if (params.sellerId) {
    q = q.eq('seller_id', params.sellerId);
  } else {
    q = q.eq('status', 'active');
  }
  if (params.brand) q = q.eq('brand', params.brand);
  if (params.condition) q = q.eq('condition', params.condition);
  if (params.minPriceCents != null) q = q.gte('asking_price_cents', params.minPriceCents);
  if (params.maxPriceCents != null) q = q.lte('asking_price_cents', params.maxPriceCents);
  if (params.query) q = q.or(`title.ilike.%${params.query}%,brand.ilike.%${params.query}%,model.ilike.%${params.query}%`);
  // Mirrors the RPC's fulfillment_filter: 'both' satisfies either side, so a
  // listing offering both is never hidden by one of them.
  if (params.offers) q = q.in('fulfillment', [params.offers, 'both']);

  switch (params.sort) {
    case 'price_asc':  q = q.order('asking_price_cents', { ascending: true }); break;
    case 'price_desc': q = q.order('asking_price_cents', { ascending: false }); break;
    default:            q = q.order('created_at', { ascending: false }); break;
  }
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) throw error;

  return (data as unknown as MarketplaceListingWithPhotos[]).map((row) => ({
    ...row,
    primaryPhotoUrl: [...row.photos].sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null,
  }));
}

// ── Proximity search ─────────────────────────────────────────────────────────
// Phase 1 of MARKETPLACE_MAP_AUDIT.md. Replaces the client-side haversine pass
// the browse grid used to run over every fetched listing (§4.2): the database
// now does the distance work through search_listings_nearby, the same
// ST_DWithin + GiST shape facilities have used all along.
//
// Deliberately a SEPARATE function from fetchListings rather than a parameter
// on it. fetchListings is also what "My Listings" uses, and that has to return
// the seller's non-active listings; the RPC is active-only by design. Merging
// the two would mean one of those callers gets the wrong rows.

export type ListingDistanceFields = {
  location_precision: Database['public']['Enums']['marketplace_location_precision'] | null;
  fulfillment: Database['public']['Enums']['marketplace_fulfillment'];
  pickup_facility_id: string | null;
  /** Null when the listing has no pickup coordinate yet — see fetchListingsNearby. */
  distance_meters: number | null;
};

export type MarketplaceListingNearby = MarketplaceListingCard & ListingDistanceFields & {
  distanceMiles: number | null;
};

export type FetchListingsNearbyParams = {
  lat: number;
  lng: number;
  radiusMiles: number;
  query?: string;
  brand?: string;
  condition?: MarketplaceCondition;
  minPriceCents?: number;
  maxPriceCents?: number;
  /**
   * Keep listings that have no pickup coordinate. Defaults to true, and must
   * stay that way until every listing carries one: excluding them is exactly
   * the defect Phase 0 fixed, where picking any radius emptied the grid because
   * no listing in production had coordinates.
   */
  includeUnlocated?: boolean;
  /**
   * What the BUYER needs, not the listing's stored value: 'local_pickup'
   * matches listings marked local_pickup OR both, 'shipping' matches shipping
   * OR both. Undefined means no constraint.
   */
  offers?: 'local_pickup' | 'shipping';
  limit?: number;
};

const METERS_PER_MILE = 1609.344;

export async function fetchListingsNearby(
  params: FetchListingsNearbyParams,
): Promise<MarketplaceListingNearby[]> {
  const { data, error } = await supabase.rpc('search_listings_nearby', {
    lat: params.lat,
    lng: params.lng,
    radius_meters: params.radiusMiles * METERS_PER_MILE,
    search_query: params.query ?? undefined,
    brand_filter: params.brand ?? undefined,
    condition_filter: params.condition ?? undefined,
    min_price_cents: params.minPriceCents ?? undefined,
    max_price_cents: params.maxPriceCents ?? undefined,
    include_unlocated: params.includeUnlocated ?? true,
    result_limit: params.limit ?? 100,
    fulfillment_filter: params.offers ?? undefined,
  });
  if (error) throw error;

  const rows = (data ?? []) as (MarketplaceListing & ListingDistanceFields)[];
  if (rows.length === 0) return [];

  // The RPC returns listing columns only. Photos come from one batched query
  // rather than a join, so the function keeps a fixed, reviewable column list
  // (audit §5.5) instead of returning whole rows.
  const { data: photoRows, error: photoError } = await supabase
    .from('marketplace_listing_photos')
    .select('listing_id, url, sort_order')
    .in('listing_id', rows.map((r) => r.id))
    .order('sort_order', { ascending: true });
  if (photoError) throw photoError;

  // Rows arrive sort_order-ascending, so the first seen per listing is primary.
  const primaryByListing = new Map<string, string>();
  for (const p of photoRows ?? []) {
    if (!primaryByListing.has(p.listing_id)) primaryByListing.set(p.listing_id, p.url);
  }

  return rows.map((row) => ({
    ...row,
    primaryPhotoUrl: primaryByListing.get(row.id) ?? null,
    distanceMiles: row.distance_meters == null ? null : row.distance_meters / METERS_PER_MILE,
  }));
}

export async function fetchListingDetail(id: string): Promise<MarketplaceListingWithPhotos | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select(
      `${LISTING_WITH_PHOTOS_SELECT}, pickup_facility:facilities!marketplace_listings_pickup_facility_id_fkey(id, name, city, state, address, latitude, longitude)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as MarketplaceListingWithPhotos & {
    pickup_facility: (Omit<ListingPickupFacility, 'latitude' | 'longitude'> & {
      latitude: number | string;
      longitude: number | string;
    }) | null;
  };
  const f = row.pickup_facility;
  return {
    ...row,
    photos: [...row.photos].sort((a, b) => a.sort_order - b.sort_order),
    // facilities.latitude/longitude are numeric in Postgres, so PostgREST hands
    // them back as strings.
    pickupFacility: f ? { ...f, latitude: Number(f.latitude), longitude: Number(f.longitude) } : null,
  };
}

// ── Listing limit (narrow free-tier bolt-on, not a general entitlement system) ─

export async function fetchActiveListingCount(sellerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('marketplace_listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .in('status', ['active', 'pending']);
  if (error) throw error;
  return count ?? 0;
}

/**
 * The seller's effective cap: an explicit profiles override, else the member
 * allowance, else the free one.
 *
 * Reads the RPC rather than profiles.marketplace_listing_limit directly,
 * because that column is now only the OVERRIDE -- it is null for almost
 * everyone, and reading it alone reported the free limit to paying members.
 * marketplace_listing_limit_for() derives the answer from is_paid_member() at
 * call time, so an expiring membership needs no write to take effect.
 *
 * This is display only. The cap is enforced by trg_enforce_listing_limit on
 * insert, which is what makes it a real limit rather than a suggestion -- until
 * 2026-09-11 nothing on the server checked it at all.
 */
export async function fetchListingLimit(sellerId: string): Promise<number> {
  const { data, error } = await supabase.rpc('marketplace_listing_limit_for', {
    p_user_id: sellerId,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : DEFAULT_FREE_LISTING_LIMIT;
}

export async function canCreateListing(sellerId: string): Promise<{ allowed: boolean; activeCount: number; limit: number }> {
  const [activeCount, limit] = await Promise.all([
    fetchActiveListingCount(sellerId),
    fetchListingLimit(sellerId),
  ]);
  return { allowed: activeCount < limit, activeCount, limit };
}

// ── Create / update / status ─────────────────────────────────────────────────

export type CreateListingInput = {
  id: string; // pre-generated client-side (see draftListingId()) — photos upload against this id before the row exists
  sellerId: string;
  brand: string;
  model: string;
  condition: MarketplaceCondition;
  askingPriceCents: number;
  minOfferCents: number;
  description: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationLat: number | null;
  locationLng: number | null;
  /**
   * Where the paddle changes hands — a PUBLIC place the seller picked, never
   * their home. 'facility' is the preferred path: the server derives the
   * coordinate from the facilities row and ignores whatever is sent here, so a
   * modified client cannot pin an exact address. See the trigger
   * fn_marketplace_sync_listing_location.
   */
  pickupSource: Database['public']['Enums']['marketplace_pickup_source'] | null;
  pickupFacilityId: string | null;
  fulfillment: Database['public']['Enums']['marketplace_fulfillment'];
  photoUrls: string[]; // already-uploaded URLs, in display order
};

export async function publishListing(input: CreateListingInput): Promise<MarketplaceListing> {
  const title = generateListingTitle(input.brand, normalizeModelName(input.model));

  const { data: listing, error } = await supabase
    .from('marketplace_listings')
    .insert({
      id: input.id,
      seller_id: input.sellerId,
      brand: input.brand,
      model: normalizeModelName(input.model),
      title,
      condition: input.condition,
      asking_price_cents: input.askingPriceCents,
      min_offer_cents: input.minOfferCents,
      description: input.description,
      location_city: input.locationCity,
      location_state: input.locationState,
      // For 'facility' these two are ignored — the trigger overwrites them from
      // the facility record. Sent anyway so the row is sane if the trigger is
      // ever missing on a branch database.
      location_lat: input.locationLat,
      location_lng: input.locationLng,
      pickup_source: input.pickupSource,
      pickup_facility_id: input.pickupFacilityId,
      fulfillment: input.fulfillment,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;

  const { error: photosError } = await supabase.from('marketplace_listing_photos').insert(
    input.photoUrls.map((url, i) => ({ listing_id: input.id, url, sort_order: i })),
  );
  if (photosError) throw photosError;

  // Every mounted listing surface refetches. Without this the Marketplace tab
  // keeps showing the grid it loaded on mount -- publishing ends on a
  // router.replace() to the detail screen, so the tab is never remounted.
  notifyListingsUpdated();
  return listing;
}

export async function updateListing(id: string, updates: Partial<{
  brand: string;
  model: string;
  condition: MarketplaceCondition;
  askingPriceCents: number;
  minOfferCents: number;
  description: string | null;
  /** Pass null to clear the pickup court and fall back to city/state only. */
  pickupFacilityId: string | null;
  fulfillment: Database['public']['Enums']['marketplace_fulfillment'];
  locationCity: string | null;
  locationState: string | null;
}>): Promise<void> {
  const patch: Partial<MarketplaceListing> = {};
  if (updates.brand !== undefined) patch.brand = updates.brand;
  if (updates.model !== undefined) {
    patch.model = normalizeModelName(updates.model);
  }
  if (updates.condition !== undefined) patch.condition = updates.condition;
  if (updates.askingPriceCents !== undefined) patch.asking_price_cents = updates.askingPriceCents;
  if (updates.minOfferCents !== undefined) patch.min_offer_cents = updates.minOfferCents;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.fulfillment !== undefined) patch.fulfillment = updates.fulfillment;
  if (updates.locationCity !== undefined) patch.location_city = updates.locationCity;
  if (updates.locationState !== undefined) patch.location_state = updates.locationState;
  if (updates.pickupFacilityId !== undefined) {
    patch.pickup_facility_id = updates.pickupFacilityId;
    // Setting pickup_source is what makes the trigger re-derive the coordinate
    // from the facility. Clearing the court clears the coordinate with it,
    // rather than leaving the listing pinned to a court it no longer names.
    patch.pickup_source = updates.pickupFacilityId ? 'facility' : null;
    if (!updates.pickupFacilityId) {
      patch.location_lat = null;
      patch.location_lng = null;
      patch.location_precision = null;
    }
  }

  if (updates.brand !== undefined || updates.model !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from('marketplace_listings')
      .select('brand, model')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    const brand = (patch.brand as string | undefined) ?? current.brand;
    const model = (patch.model as string | undefined) ?? current.model;
    patch.title = generateListingTitle(brand, model);
  }

  const { error } = await supabase.from('marketplace_listings').update(patch).eq('id', id);
  if (error) throw error;
  notifyListingsUpdated();
}

export async function setListingStatus(
  id: string,
  status: MarketplaceListing['status'],
): Promise<void> {
  const { error } = await supabase.from('marketplace_listings').update({ status }).eq('id', id);
  if (error) throw error;
  // Covers deleteListing() too, which routes through here.
  notifyListingsUpdated();
}

/**
 * Push a listing's expiry out another 60 days, and bring it back from
 * 'expired' if it had lapsed. Owner-only, enforced in the RPC — it reports
 * "listing not found" for someone else's id as well as a missing one, so the
 * error cannot be used to probe which listing ids exist.
 */
/**
 * Replace a listing's photo set, in display order.
 *
 * Full replace rather than a diff, because marketplace_listing_photos has
 * owner INSERT and DELETE policies but no UPDATE policy — so sort_order cannot
 * be edited in place, and reordering has to be expressed as delete + insert
 * anyway. Delete runs first for the same reason: a partial insert leaves fewer
 * photos, whereas insert-then-delete could momentarily double them.
 *
 * The storage objects are NOT touched here. The caller owns that, because only
 * it knows which URLs the user actually removed versus merely reordered —
 * deleting a file that is still referenced would break a live listing.
 */
export async function setListingPhotos(listingId: string, urls: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from('marketplace_listing_photos')
    .delete()
    .eq('listing_id', listingId);
  if (delError) throw delError;

  if (urls.length > 0) {
    const { error: insError } = await supabase.from('marketplace_listing_photos').insert(
      urls.map((url, i) => ({ listing_id: listingId, url, sort_order: i })),
    );
    if (insError) throw insError;
  }

  notifyListingsUpdated();
}

export async function renewListing(id: string): Promise<void> {
  const { error } = await supabase.rpc('renew_listing', { p_listing_id: id });
  if (error) throw error;
  notifyListingsUpdated();
}

export async function deleteListing(id: string): Promise<void> {
  await setListingStatus(id, 'deleted');
}

// ── Report Listing ───────────────────────────────────────────────────────────
// Reuses the existing user_reports pipeline (reported_id = seller) rather than
// a marketplace-specific reports table; related_listing_id ties it to the
// listing being reported.

export type ListingReportReason = Database['public']['Enums']['report_reason'];

export async function reportListing(params: {
  reporterId: string;
  sellerId: string;
  listingId: string;
  reason: ListingReportReason;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: params.reporterId,
    reported_id: params.sellerId,
    related_listing_id: params.listingId,
    reason: params.reason,
    notes: params.notes ?? null,
  });
  if (error) throw error;
}
