import { supabase } from '@/lib/supabase';
import type { MarketplaceListingCard, MarketplaceListing } from './listingService';

// Saved ("hearted") listings.
//
// Same shape as hooks/usePlayEventBookmarks and useTournamentBookmarks solve
// for the other two entity types — a save is a row that exists or does not, so
// there is no update path and un-saving is a delete.
//
// Deliberately NOT wired through listingEvents/notifyListingsUpdated: saving is
// private to one viewer and changes nothing about the listing itself, so
// refetching every mounted listing grid on a heart tap would be pure waste.

const TABLE = 'marketplace_saved_listings';

/** Listing ids the signed-in user has saved. */
export async function fetchSavedListingIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from(TABLE).select('listing_id').eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.listing_id));
}

export async function isListingSaved(userId: string, listingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('listing_id')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function saveListing(userId: string, listingId: string): Promise<void> {
  // Idempotent: tapping a heart twice quickly must not error on the composite
  // primary key.
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, listing_id: listingId }, { onConflict: 'user_id,listing_id' });
  if (error) throw error;
}

export async function unsaveListing(userId: string, listingId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId);
  if (error) throw error;
}

/**
 * The saved listings themselves, newest save first.
 *
 * Two queries rather than a join: the embedded-select form would apply the
 * listings RLS inside the join and silently drop rows, which is precisely the
 * case that matters here — a listing the user saved and which has since sold or
 * expired. Fetching ids first and rows second makes that visible, so the caller
 * can tell the difference between "no saves" and "saves that are gone".
 */
export async function fetchSavedListings(userId: string): Promise<{
  listings: MarketplaceListingCard[];
  /** Saved ids whose listing is no longer visible (sold, expired or deleted). */
  unavailableCount: number;
}> {
  const { data: savedRows, error: savedError } = await supabase
    .from(TABLE)
    .select('listing_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (savedError) throw savedError;

  const ids = (savedRows ?? []).map((r) => r.listing_id);
  if (ids.length === 0) return { listings: [], unavailableCount: 0 };

  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*, photos:marketplace_listing_photos(*)')
    .in('id', ids)
    .eq('status', 'active');
  if (error) throw error;

  const rows = (data ?? []) as unknown as (MarketplaceListing & {
    photos: { url: string; sort_order: number }[];
  })[];

  const byId = new Map(rows.map((r) => [r.id, r]));
  // Preserve save order, which the `in` filter does not.
  const listings = ids
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => r != null)
    .map((row) => ({
      ...row,
      primaryPhotoUrl: [...row.photos].sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null,
    })) as MarketplaceListingCard[];

  return { listings, unavailableCount: ids.length - listings.length };
}
