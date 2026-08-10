import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import type { ReservableAssetType } from './reservations';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Data model + player-side discount display only this phase -- no facility
// "Create Flash Deal" admin screen yet (deals are seeded directly). See
// BOOKING_ENGINE_PHASE1_REPORT.md / the Phase 2 plan for the scope decision.

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
