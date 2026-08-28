import { supabase } from '@/lib/supabase';
import type { Tables, Database } from '@shared/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// facility_members is the junction table that gives a facility (an
// organization, per BOOKING_ENGINE_V1_SPEC.md) OWNER/MANAGER/STAFF members.
// It mirrors the group_members / conversation_participants role-junction
// pattern already used elsewhere in this codebase — no new global auth role
// was introduced (public.profiles.role is untouched).

export type FacilityMember     = Tables<'facility_members'>;
export type FacilityMemberRole = Database['public']['Enums']['facility_member_role'];

const ROLE_RANK: Record<FacilityMemberRole, number> = { owner: 3, manager: 2, staff: 1 };

export function facilityRoleRank(role: FacilityMemberRole): number {
  return ROLE_RANK[role];
}

export function facilityRoleAtLeast(role: FacilityMemberRole | null, min: FacilityMemberRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchFacilityMembers(facilityId: string): Promise<FacilityMember[]> {
  const { data, error } = await supabase
    .from('facility_members')
    .select('*')
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Sort client-side by role rank so callers always see owner → manager →
  // staff, independent of insertion order.
  return (data ?? []).sort((a, b) => facilityRoleRank(b.role) - facilityRoleRank(a.role));
}

export type MyFacilityMembership = FacilityMember & {
  facilityName: string;
};

export async function fetchMyFacilityMemberships(userId: string): Promise<MyFacilityMembership[]> {
  const { data, error } = await supabase
    .from('facility_members')
    .select('*, facilities(name)')
    .eq('user_id', userId);

  if (error) throw error;

  return (data ?? []).map(row => {
    const { facilities: facility, ...member } = row as typeof row & { facilities: { name: string } | null };
    return { ...(member as FacilityMember), facilityName: facility?.name ?? '' };
  });
}

export async function fetchMyRoleAtFacility(
  facilityId: string,
  userId: string,
): Promise<FacilityMemberRole | null> {
  const { data, error } = await supabase
    .from('facility_members')
    .select('role')
    .eq('facility_id', facilityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP OWNER MEMBERSHIP
// ─────────────────────────────────────────────────────────────────────────────
// facilities.owner_user_id (the existing single-owner claim column) is the
// only source of truth for "who may seed the first facility_members row".
// RLS policy "facility_members: bootstrap owner self insert" enforces this
// server-side — this call fails for anyone who isn't already
// facilities.owner_user_id for this facility.

export async function bootstrapOwnerMembership(facilityId: string, userId: string): Promise<FacilityMember> {
  const { data, error } = await supabase
    .from('facility_members')
    .insert({ facility_id: facilityId, user_id: userId, role: 'owner', created_by: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE MEMBERS (owner: any role; manager: staff only — enforced by RLS)
// ─────────────────────────────────────────────────────────────────────────────

export async function addFacilityMember(
  facilityId: string,
  userId: string,
  role: FacilityMemberRole,
  addedByUserId: string,
): Promise<FacilityMember> {
  const { data, error } = await supabase
    .from('facility_members')
    .insert({ facility_id: facilityId, user_id: userId, role, created_by: addedByUserId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateFacilityMemberRole(
  facilityId: string,
  userId: string,
  role: FacilityMemberRole,
): Promise<void> {
  const { error } = await supabase
    .from('facility_members')
    .update({ role })
    .eq('facility_id', facilityId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function removeFacilityMember(facilityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('facility_members')
    .delete()
    .eq('facility_id', facilityId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Self-service leave — same underlying delete, named separately so call
// sites read intent-first (a staff member leaving vs. an owner removing them).
export async function leaveFacility(facilityId: string, userId: string): Promise<void> {
  return removeFacilityMember(facilityId, userId);
}
