import { supabase } from '@/lib/supabase';
import type { Tables, Database } from '@/lib/database.types';
import {
  DEFAULT_FREE_LISTING_LIMIT,
  generateListingTitle,
  normalizeModelName,
  type MarketplaceCondition,
} from './constants';

export type MarketplaceListing = Tables<'marketplace_listings'>;
export type MarketplaceListingPhoto = Tables<'marketplace_listing_photos'>;

export type MarketplaceListingWithPhotos = MarketplaceListing & {
  photos: MarketplaceListingPhoto[];
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

export async function fetchListingDetail(id: string): Promise<MarketplaceListingWithPhotos | null> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select(LISTING_WITH_PHOTOS_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as MarketplaceListingWithPhotos;
  return { ...row, photos: [...row.photos].sort((a, b) => a.sort_order - b.sort_order) };
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

export async function fetchListingLimit(sellerId: string): Promise<number> {
  const { data, error } = await supabase
    .from('profiles')
    .select('marketplace_listing_limit')
    .eq('id', sellerId)
    .maybeSingle();
  if (error) throw error;
  return data?.marketplace_listing_limit ?? DEFAULT_FREE_LISTING_LIMIT;
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
      location_lat: input.locationLat,
      location_lng: input.locationLng,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;

  const { error: photosError } = await supabase.from('marketplace_listing_photos').insert(
    input.photoUrls.map((url, i) => ({ listing_id: input.id, url, sort_order: i })),
  );
  if (photosError) throw photosError;

  return listing;
}

export async function updateListing(id: string, updates: Partial<{
  brand: string;
  model: string;
  condition: MarketplaceCondition;
  askingPriceCents: number;
  minOfferCents: number;
  description: string | null;
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
}

export async function setListingStatus(
  id: string,
  status: MarketplaceListing['status'],
): Promise<void> {
  const { error } = await supabase.from('marketplace_listings').update({ status }).eq('id', id);
  if (error) throw error;
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
