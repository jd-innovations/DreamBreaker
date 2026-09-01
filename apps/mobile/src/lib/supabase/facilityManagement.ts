import { supabase } from '@/lib/supabase';

// Facility Marketplace Phase 2 — running a facility you manage.
//
// No new server work: courts and ball_machines already carry complete manager
// RLS (`is_facility_role_at_least(facility_id, auth.uid(), 'manager')` on
// insert/update/delete, and staff can see inactive rows). This module is the
// caller that never existed.

export type FacilityRole = 'owner' | 'manager' | 'staff';

export type ManagedFacility = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  role: FacilityRole;
  claimStatus: string;
  courtCount: number;
};

export type Court = {
  id: string;
  facilityId: string;
  name: string;
  indoorOutdoor: string | null;
  hourlyRateCents: number | null;
  isActive: boolean;
  sortOrder: number | null;
};

export type StaffMember = {
  userId: string;
  role: FacilityRole;
  fullName: string | null;
  email: string | null;
};

const MESSAGES: Record<string, string> = {
  'row-level security': 'You do not have permission to change this facility.',
  'violates foreign key': 'That facility or court no longer exists.',
  duplicate: 'That already exists.',
};

export function facilityManagementError(err: unknown): string {
  const raw =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  for (const [needle, text] of Object.entries(MESSAGES)) {
    if (raw.toLowerCase().includes(needle)) return text;
  }
  return raw || 'Something went wrong. Please try again.';
}

/**
 * Facilities the signed-in user has a role at.
 *
 * Reads facility_members rather than facilities.owner_user_id: membership is
 * the authority everything downstream checks, and a manager who is not the
 * owner has no owner_user_id row to be found by.
 */
export async function fetchManagedFacilities(): Promise<ManagedFacility[]> {
  const { data, error } = await supabase
    .from('facility_members')
    .select('role, facility_id, facilities!inner(id, name, city, state, claim_status, court_count)');
  if (error) throw error;

  return (data ?? []).map(row => {
    const f = row.facilities as unknown as {
      id: string; name: string; city: string | null; state: string | null;
      claim_status: string; court_count: number;
    };
    return {
      id: f.id,
      name: f.name,
      city: f.city,
      state: f.state,
      role: row.role as FacilityRole,
      claimStatus: f.claim_status,
      courtCount: f.court_count ?? 0,
    };
  });
}

export async function fetchCourts(facilityId: string): Promise<Court[]> {
  const { data, error } = await supabase
    .from('courts')
    .select('id, facility_id, name, indoor_outdoor, hourly_rate_cents, is_active, sort_order')
    .eq('facility_id', facilityId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(c => ({
    id: c.id,
    facilityId: c.facility_id,
    name: c.name,
    indoorOutdoor: c.indoor_outdoor,
    hourlyRateCents: c.hourly_rate_cents,
    isActive: c.is_active,
    sortOrder: c.sort_order,
  }));
}

export async function saveCourt(input: {
  id?: string;
  facilityId: string;
  name: string;
  indoorOutdoor: string;
  hourlyRateCents: number;
  isActive: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const row = {
    facility_id: input.facilityId,
    name: input.name.trim(),
    indoor_outdoor: input.indoorOutdoor,
    hourly_rate_cents: input.hourlyRateCents,
    is_active: input.isActive,
  };

  const { error } = input.id
    ? await supabase.from('courts').update(row).eq('id', input.id)
    : await supabase.from('courts').insert(row);

  return error ? { ok: false, message: facilityManagementError(error) } : { ok: true };
}

/**
 * Retiring a court, not erasing it.
 *
 * Reservations reference courts through reservations.asset_id, so a deleted
 * court would orphan booking history — including the rows a facility gets paid
 * on. Deactivating keeps it out of the booking grid and leaves the past intact.
 */
export async function deactivateCourt(
  courtId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from('courts').update({ is_active: false }).eq('id', courtId);
  return error ? { ok: false, message: facilityManagementError(error) } : { ok: true };
}

export async function fetchStaff(facilityId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('facility_members')
    .select('user_id, role, profiles!inner(full_name, email)')
    .eq('facility_id', facilityId);
  if (error) throw error;
  return (data ?? []).map(row => {
    const p = row.profiles as unknown as { full_name: string | null; email: string | null };
    return { userId: row.user_id, role: row.role as FacilityRole, fullName: p.full_name, email: p.email };
  });
}
