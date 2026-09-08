import { supabase } from '@/lib/supabase';
import type { Tables } from '@shared/database.types';
import type { ReservableAssetType } from './reservations';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Data model + player-side discount display, and (Facility Marketplace Phase 6)
// the manager-side create/edit path that BOOKING_ENGINE_V1_SPEC.md specifies as
// the Flash Deals screen: Asset, Date, Start, End, Discount %, Preview Price,
// Publish. Deals were previously seeded directly; see
// BOOKING_ENGINE_PHASE1_REPORT.md for that original scope decision.
//
// Deals are scoped to an ASSET, never a whole facility: flash_deals_owner_type_check
// permits only 'court' and 'ball_machine', even though the enum also has
// 'facility'. Discount is capped at 1-90 by flash_deals_discount_range.
//
// Overlapping deals on one asset are ALLOWED, and reservation_best_flash_deal()
// takes the highest discount active at the slot start. That is a real feature
// (a weekend promotion can sit under a bigger one-off), so the UI shows a
// manager the other deals on an asset rather than pretending each is alone.

export type FlashDeal = Tables<'flash_deals'>;

export type FlashDealPreview = {
  id:              string;
  discountPercent: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors the server-side reservation_best_flash_deal() RPC that
// create_reservation() itself uses to snapshot pricing -- calling the same
// RPC here (rather than re-deriving the "best active deal" query client-side)
// guarantees the preview a player sees before booking matches what the
// reservation actually gets priced at.
export async function fetchActiveFlashDeal(
  assetType: ReservableAssetType,
  assetId:   string,
  at:        Date | string = new Date(),
): Promise<FlashDealPreview | null> {
  const { data, error } = await supabase
    .rpc('reservation_best_flash_deal', {
      p_asset_type: assetType,
      p_asset_id:   assetId,
      p_at:         new Date(at).toISOString(),
    })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return { id: data.id, discountPercent: data.discount_percent };
}

// For Results-list Flash Deal badges: which of a facility's courts/ball
// machines currently have an active deal. Two id lookups + one flash_deals
// query rather than a join, matching the plain-select style already used by
// fetchFacilities()'s non-proximity path.
export async function fetchFlashDealsForFacility(facilityId: string): Promise<FlashDeal[]> {
  const [{ data: courts, error: courtsError }, { data: machines, error: machinesError }] = await Promise.all([
    supabase.from('courts').select('id').eq('facility_id', facilityId),
    supabase.from('ball_machines').select('id').eq('facility_id', facilityId),
  ]);
  if (courtsError) throw courtsError;
  if (machinesError) throw machinesError;

  const courtIds   = (courts ?? []).map(c => c.id);
  const machineIds = (machines ?? []).map(m => m.id);
  if (courtIds.length === 0 && machineIds.length === 0) return [];

  const nowIso = new Date().toISOString();
  let query = supabase
    .from('flash_deals')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso);

  if (courtIds.length > 0 && machineIds.length > 0) {
    query = query.or(
      `and(owner_type.eq.court,owner_id.in.(${courtIds.join(',')})),and(owner_type.eq.ball_machine,owner_id.in.(${machineIds.join(',')}))`,
    );
  } else if (courtIds.length > 0) {
    query = query.eq('owner_type', 'court').in('owner_id', courtIds);
  } else {
    query = query.eq('owner_type', 'ball_machine').in('owner_id', machineIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE (Phase 6) — manager-or-above, enforced by RLS on flash_deals
// ─────────────────────────────────────────────────────────────────────────────

export const DISCOUNT_MIN = 1;
export const DISCOUNT_MAX = 90;

export type FlashDealInput = {
  ownerType: ReservableAssetType;
  ownerId: string;
  discountPercent: number;
  startsAt: Date;
  endsAt: Date;
};

// The spec's "Preview Price": what a booking of this asset would cost while the
// deal runs. Mirrors create_reservation's arithmetic — rate x hours x
// (100 - discount) / 100, rounded once — so the number a manager approves is
// the number a player is charged.
export function previewPriceCents(
  hourlyRateCents: number,
  discountPercent: number,
  hours = 1,
): number {
  return Math.round(hourlyRateCents * hours * (100 - discountPercent) / 100);
}

/** Every deal on a facility's assets, past and future — the manage list. */
export async function fetchAllFlashDealsForFacility(facilityId: string): Promise<FlashDeal[]> {
  const [{ data: courts, error: courtsError }, { data: machines, error: machinesError }] = await Promise.all([
    supabase.from('courts').select('id').eq('facility_id', facilityId),
    supabase.from('ball_machines').select('id').eq('facility_id', facilityId),
  ]);
  if (courtsError) throw courtsError;
  if (machinesError) throw machinesError;

  const courtIds = (courts ?? []).map(c => c.id);
  const machineIds = (machines ?? []).map(m => m.id);
  const allIds = [...courtIds, ...machineIds];
  if (allIds.length === 0) return [];

  // owner_id alone is enough: a uuid cannot collide across the two tables, and
  // this avoids the or(...) filter string the active-deals query needs.
  const { data, error } = await supabase
    .from('flash_deals')
    .select('*')
    .in('owner_id', allIds)
    .order('starts_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createFlashDeal(input: FlashDealInput, createdBy: string): Promise<FlashDeal> {
  const { data, error } = await supabase
    .from('flash_deals')
    .insert({
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      discount_percent: input.discountPercent,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
      is_active: true,
      // The insert policy allows created_by null OR the caller; setting it
      // explicitly keeps "who published this discount" answerable.
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateFlashDeal(
  id: string,
  patch: Partial<{ discountPercent: number; startsAt: Date; endsAt: Date; isActive: boolean }>,
): Promise<void> {
  // Typed as a partial row, not Record<string, unknown>: the generated update
  // type rejects an open index signature, and that rejection is worth keeping —
  // it is what stops a typo'd column name from silently updating nothing.
  const row: Partial<FlashDeal> = { updated_at: new Date().toISOString() };
  if (patch.discountPercent !== undefined) row.discount_percent = patch.discountPercent;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt.toISOString();
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt.toISOString();
  if (patch.isActive !== undefined) row.is_active = patch.isActive;

  const { error } = await supabase.from('flash_deals').update(row).eq('id', id);
  if (error) throw error;
}

/**
 * Ends a deal without deleting it.
 *
 * reservations.flash_deal_id references this row, so a delete would orphan the
 * pricing history of every booking made under the deal — including the rows a
 * facility gets paid on. Deactivating stops it applying to new bookings and
 * leaves the past intact, the same choice made for retiring a court.
 */
export async function deactivateFlashDeal(id: string): Promise<void> {
  const { error } = await supabase
    .from('flash_deals')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export type DealStatus = 'scheduled' | 'live' | 'ended' | 'off';

export function dealStatus(deal: FlashDeal, now = new Date()): DealStatus {
  if (!deal.is_active) return 'off';
  if (now < new Date(deal.starts_at)) return 'scheduled';
  if (now >= new Date(deal.ends_at)) return 'ended';
  return 'live';
}
