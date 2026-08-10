import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/lib/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Court inventory for a facility. Deliberately NOT built on court_assignments
// (tournament-only live scoreboard rows, no time-slot/facility columns — see
// BOOKING_ENGINE_AUDIT.md §4). Reservation/availability logic is a later phase;
// this is inventory metadata only.

export type Court = Tables<'courts'>;

export type IndoorOutdoor = 'indoor' | 'outdoor';

export type CreateCourtInput = {
  facilityId:       string;
  name:             string;
  indoorOutdoor:    IndoorOutdoor;
  hourlyRateCents?: number | null;
  amenities?:       string[];
  sortOrder?:       number;
};

export type UpdateCourtInput = Partial<{
  name:             string;
  indoorOutdoor:    IndoorOutdoor;
  hourlyRateCents:  number | null;
  amenities:        string[];
  sortOrder:        number;
  isActive:         boolean;
}>;

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCourts(
  facilityId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<Court[]> {
  let q = supabase
    .from('courts')
    .select('*')
    .eq('facility_id', facilityId);

  if (!opts.includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchCourtById(id: string): Promise<Court | null> {
  const { data, error } = await supabase
    .from('courts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / UPDATE / DELETE
// ─────────────────────────────────────────────────────────────────────────────
// RLS requires facility manager+ (facility_members.role IN ('owner','manager'))
// for all three — enforced server-side, not re-checked here.

export async function createCourt(input: CreateCourtInput): Promise<Court> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('courts')
    .insert({
      facility_id:       input.facilityId,
      name:              input.name,
      indoor_outdoor:    input.indoorOutdoor,
      hourly_rate_cents: input.hourlyRateCents ?? null,
      amenities:         input.amenities ?? [],
      sort_order:        input.sortOrder ?? 0,
      created_by:        user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCourt(id: string, patch: UpdateCourtInput): Promise<Court> {
  const update: TablesUpdate<'courts'> = {};
  if (patch.name !== undefined)            update.name = patch.name;
  if (patch.indoorOutdoor !== undefined)   update.indoor_outdoor = patch.indoorOutdoor;
  if (patch.hourlyRateCents !== undefined) update.hourly_rate_cents = patch.hourlyRateCents;
  if (patch.amenities !== undefined)       update.amenities = patch.amenities;
  if (patch.sortOrder !== undefined)       update.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined)        update.is_active = patch.isActive;

  const { data, error } = await supabase
    .from('courts')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Soft delete — flips is_active=false. Preferred over deleteCourt() once any
// later phase adds reservation rows referencing courts.id, so history and
// past reservations remain intact.
export async function deactivateCourt(id: string): Promise<void> {
  const { error } = await supabase.from('courts').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function reactivateCourt(id: string): Promise<void> {
  const { error } = await supabase.from('courts').update({ is_active: true }).eq('id', id);
  if (error) throw error;
}

// Hard delete. Safe today (nothing references courts.id yet — reservations
// don't exist until a later phase); ON DELETE CASCADE also removes the
// court's asset_photos and operating_hours rows. Prefer deactivateCourt()
// once reservation history needs to survive a court being removed.
export async function deleteCourt(id: string): Promise<void> {
  const { error } = await supabase.from('courts').delete().eq('id', id);
  if (error) throw error;
}
