import { supabase } from '@/lib/supabase';
import { fetchMyFacilityMemberships } from '@/lib/supabase/facilityMembers';
import type { FacilityMemberRole } from '@/lib/supabase/facilityMembers';

// Facility Marketplace — the small amount that is genuinely new.
//
// This file originally reimplemented court CRUD and member management that
// courts.ts, ballMachines.ts and facilityMembers.ts already provided, including
// a second `deactivateCourt` with the same name. Those are the callers now;
// what remains here is payout status (Phase 3) and one list query.
//
// Reuse note for anything added later: courts.ts and ballMachines.ts already
// cover create / update / deactivate / REACTIVATE / delete, and
// facilityMembers.ts covers add / update-role / remove / leave, with
// facilityRoleAtLeast for rank comparisons. useFacilityRole wraps the last of
// those as isStaffOrAbove / isManagerOrAbove / isOwner.

export type ManagedFacility = {
  id: string;
  name: string;
  role: FacilityMemberRole;
};

/**
 * Facilities the signed-in user has any role at.
 *
 * Thin wrapper over fetchMyFacilityMemberships so the screen gets the shape it
 * renders. Membership is the authority everything downstream checks — a manager
 * who is not the owner has no facilities.owner_user_id row to be found by.
 */
export async function fetchManagedFacilities(userId: string): Promise<ManagedFacility[]> {
  const rows = await fetchMyFacilityMemberships(userId);
  return rows.map(r => ({
    id: r.facility_id,
    name: r.facilityName,
    role: r.role as FacilityMemberRole,
  }));
}

export type PayoutStatus = {
  hasAccount: boolean;
  onboarded: boolean;
  onboardedAt: string | null;
  canManage: boolean;
};

/**
 * Payout readiness for a venue.
 *
 * Deliberately never returns the Stripe account id — that lives in
 * facility_payout_accounts, which has no anon or authenticated policy at all.
 * The screen only needs to know whether the venue can be paid and whether this
 * user is allowed to do something about it.
 */
export async function fetchPayoutStatus(facilityId: string): Promise<PayoutStatus | null> {
  const { data, error } = await supabase.rpc('facility_payout_status', { p_facility_id: facilityId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    hasAccount: !!row.has_account,
    onboarded: !!row.onboarded,
    onboardedAt: row.onboarded_at,
    canManage: !!row.can_manage,
  };
}

const MESSAGES: Record<string, string> = {
  'row-level security': 'You do not have permission to change this facility.',
  'violates foreign key': 'That facility or asset no longer exists.',
  duplicate: 'That already exists.',
};

export function facilityManagementError(err: unknown): string {
  const raw =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : err instanceof Error
        ? err.message
        : '';
  for (const [needle, text] of Object.entries(MESSAGES)) {
    if (raw.toLowerCase().includes(needle)) return text;
  }
  return raw || 'Something went wrong. Please try again.';
}

export type FacilityEarnings = {
  paidCents: number;
  pendingCents: number;
  minimumCents: number;
  lastPaidAt: string | null;
};

/**
 * Owner-facing earnings.
 *
 * pending is what has accrued but not yet been transferred. It has to be shown
 * alongside the minimum, because a facility sitting under the payout floor
 * otherwise concludes it is simply not being paid.
 */
export async function fetchFacilityEarnings(facilityId: string): Promise<FacilityEarnings | null> {
  const { data, error } = await supabase.rpc('facility_earnings', { p_facility_id: facilityId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    paidCents: Number(row.paid_cents ?? 0),
    pendingCents: Number(row.pending_cents ?? 0),
    minimumCents: Number(row.minimum_cents ?? 0),
    lastPaidAt: row.last_paid_at,
  };
}
