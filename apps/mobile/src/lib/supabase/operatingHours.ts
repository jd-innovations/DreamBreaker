import { supabase } from '@/lib/supabase';
import type { Tables, Database } from '@/lib/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Structured operating hours — one row per (owner, day_of_week). Replaces the
// free-text facilities.hours_summary gap identified in BOOKING_ENGINE_AUDIT.md
// §3. A single polymorphic table serves the facility itself, a specific
// court, or a specific ball machine (owner_type/owner_id), instead of three
// near-identical hours tables — the same "one asset engine" intent as the
// spec's reservation engine.

export type OperatingHours = Tables<'operating_hours'>;
export type OperatingHoursOwnerType = Database['public']['Enums']['facility_asset_owner_type'];

export type DayHours = {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, matches JS Date#getDay()
  isClosed: boolean;
  openTime: string | null;  // 'HH:MM' or 'HH:MM:SS'
  closeTime: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchOperatingHours(
  ownerType: OperatingHoursOwnerType,
  ownerId: string,
): Promise<OperatingHours[]> {
  const { data, error } = await supabase
    .from('operating_hours')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .order('day_of_week', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// UPSERT (whole week at once)
// ─────────────────────────────────────────────────────────────────────────────
// RLS requires facility manager+ on the resolved facility (via
// facility_id_for_owner()) — enforced server-side.

export async function upsertOperatingHours(
  ownerType: OperatingHoursOwnerType,
  ownerId: string,
  days: DayHours[],
): Promise<OperatingHours[]> {
  const rows = days.map(d => ({
    owner_type:  ownerType,
    owner_id:    ownerId,
    day_of_week: d.dayOfWeek,
    is_closed:   d.isClosed,
    open_time:   d.isClosed ? null : d.openTime,
    close_time:  d.isClosed ? null : d.closeTime,
  }));

  const { data, error } = await supabase
    .from('operating_hours')
    .upsert(rows, { onConflict: 'owner_type,owner_id,day_of_week' })
    .select();

  if (error) throw error;
  return data ?? [];
}

export async function clearOperatingHours(
  ownerType: OperatingHoursOwnerType,
  ownerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('operating_hours')
    .delete()
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId);

  if (error) throw error;
}
