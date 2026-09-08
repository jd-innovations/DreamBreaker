import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@shared/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Ball machine inventory for a facility. Confirmed in BOOKING_ENGINE_AUDIT.md
// §5 as an entirely new domain object — nothing pre-existing to reuse or
// extend. Mirrors courts.ts's shape/conventions so both asset types read the
// same way, per the spec's "future asset types reuse the same engine" intent.

export type BallMachine = Tables<'ball_machines'>;

export type CreateBallMachineInput = {
  facilityId:       string;
  name:             string;
  hourlyRateCents?: number | null;
  description?:     string | null;
  sortOrder?:       number;
};

export type UpdateBallMachineInput = Partial<{
  name:             string;
  hourlyRateCents:  number | null;
  description:      string | null;
  sortOrder:        number;
  isActive:         boolean;
}>;

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchBallMachines(
  facilityId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<BallMachine[]> {
  let q = supabase
    .from('ball_machines')
    .select('*')
    .eq('facility_id', facilityId);

  if (!opts.includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchBallMachineById(id: string): Promise<BallMachine | null> {
  const { data, error } = await supabase
    .from('ball_machines')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / UPDATE / DELETE
// ─────────────────────────────────────────────────────────────────────────────
// RLS requires facility manager+ for all three — enforced server-side.

export async function createBallMachine(input: CreateBallMachineInput): Promise<BallMachine> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('ball_machines')
    .insert({
      facility_id:       input.facilityId,
      name:              input.name,
      hourly_rate_cents: input.hourlyRateCents ?? null,
      description:       input.description ?? null,
      sort_order:        input.sortOrder ?? 0,
      created_by:        user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBallMachine(id: string, patch: UpdateBallMachineInput): Promise<BallMachine> {
  const update: TablesUpdate<'ball_machines'> = {};
  if (patch.name !== undefined)            update.name = patch.name;
  if (patch.hourlyRateCents !== undefined) update.hourly_rate_cents = patch.hourlyRateCents;
  if (patch.description !== undefined)     update.description = patch.description;
  if (patch.sortOrder !== undefined)       update.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined)        update.is_active = patch.isActive;

  const { data, error } = await supabase
    .from('ball_machines')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Soft delete — see courts.ts's deactivateCourt() for the same reasoning.
export async function deactivateBallMachine(id: string): Promise<void> {
  const { error } = await supabase.from('ball_machines').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function reactivateBallMachine(id: string): Promise<void> {
  const { error } = await supabase.from('ball_machines').update({ is_active: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteBallMachine(id: string): Promise<void> {
  const { error } = await supabase.from('ball_machines').delete().eq('id', id);
  if (error) throw error;
}
