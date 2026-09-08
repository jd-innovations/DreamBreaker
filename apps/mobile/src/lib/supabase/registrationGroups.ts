import { supabase } from '@/lib/supabase';

// Per-player payment obligations for doubles/mixed teams
// (supabase/migrations/20260817010000_registration_team_payment_groups.sql).
//
// The rule this module exists to make visible in the UI: one player paying
// does NOT put their partner in the draw. Each player owes their own entry
// fee, each has their own payment_state, and the team is only 'confirmed'
// once every member has reached 'paid'. Nothing here writes payment state —
// the only mutation exposed is declining an invite, which cannot move money.

export type RegistrationGroupStatus =
  | 'forming'
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'expired';

export type RegistrationMemberState =
  | 'invited'
  | 'pending_payment'
  | 'paid'
  | 'declined'
  | 'expired';

export type RegistrationGroupMember = {
  id: string;
  userId: string;
  name: string;
  role: 'initiator' | 'partner';
  paymentState: RegistrationMemberState;
  amountDueCents: number;
  amountPaidCents: number;
  registrationId: string | null;
  expiresAt: string | null;
};

export type RegistrationGroup = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  divisionId: string;
  divisionName: string;
  divisionLevel: string;
  eventDate: string;
  venue: string;
  city: string;
  state: string;
  status: RegistrationGroupStatus;
  requiredMemberCount: number;
  expiresAt: string | null;
  members: RegistrationGroupMember[];
};

type GroupRow = {
  id: string;
  tournament_id: string;
  division_id: string;
  status: string;
  required_member_count: number;
  expires_at: string | null;
  tournaments: { name: string; venue_name: string | null; city: string; state: string; event_date: string } | null;
  divisions: { name: string; skill_min: number | null; skill_max: number | null } | null;
  registration_group_members: {
    id: string;
    user_id: string;
    role: string;
    payment_state: string;
    amount_due_cents: number;
    amount_paid_cents: number;
    registration_id: string | null;
    expires_at: string | null;
    profiles: { full_name: string | null } | null;
  }[] | null;
};

const GROUP_SELECT = `
  id, tournament_id, division_id, status, required_member_count, expires_at,
  tournaments(name, venue_name, city, state, event_date),
  divisions(name, skill_min, skill_max),
  registration_group_members(
    id, user_id, role, payment_state, amount_due_cents, amount_paid_cents, registration_id, expires_at,
    profiles!registration_group_members_user_id_fkey(full_name)
  )
`.trim();

function rowToGroup(row: GroupRow): RegistrationGroup {
  const div = row.divisions;
  const level = div?.skill_min != null && div?.skill_max != null ? `${div.skill_min}-${div.skill_max}` : '';

  return {
    id:                  row.id,
    tournamentId:        row.tournament_id,
    tournamentName:      row.tournaments?.name ?? '',
    divisionId:          row.division_id,
    divisionName:        div?.name ?? '',
    divisionLevel:       level,
    eventDate:           row.tournaments?.event_date ?? '',
    venue:               row.tournaments?.venue_name ?? '',
    city:                row.tournaments?.city ?? '',
    state:               row.tournaments?.state ?? '',
    status:              row.status as RegistrationGroupStatus,
    requiredMemberCount: row.required_member_count,
    expiresAt:           row.expires_at,
    members: (row.registration_group_members ?? []).map(m => ({
      id:              m.id,
      userId:          m.user_id,
      name:            m.profiles?.full_name ?? '',
      role:            m.role as RegistrationGroupMember['role'],
      paymentState:    m.payment_state as RegistrationMemberState,
      amountDueCents:  m.amount_due_cents,
      amountPaidCents: m.amount_paid_cents,
      registrationId:  m.registration_id,
      expiresAt:       m.expires_at,
    })),
  };
}

// ─── Derived, display-safe summaries ──────────────────────────────────────────

export function memberFor(group: RegistrationGroup, userId: string): RegistrationGroupMember | null {
  return group.members.find(m => m.userId === userId) ?? null;
}

export function teammatesOf(group: RegistrationGroup, userId: string): RegistrationGroupMember[] {
  return group.members.filter(m => m.userId !== userId);
}

/**
 * The one line of copy the whole feature turns on. Deliberately never says a
 * team is set while any member is still unpaid.
 */
export function teamStatusLabel(group: RegistrationGroup, userId: string): string {
  const me = memberFor(group, userId);
  const others = teammatesOf(group, userId);

  if (group.status === 'confirmed') return 'Team confirmed — all players paid';
  if (group.status === 'cancelled') return 'Team cancelled';

  if (others.some(m => m.paymentState === 'declined')) return 'Partner declined — pick a new partner';
  if (others.some(m => m.paymentState === 'expired')) return 'Partner invite expired';

  if (me?.paymentState === 'paid') {
    const pending = others.filter(m => m.paymentState !== 'paid');
    if (pending.length > 0) {
      const who = pending[0].name || 'Your partner';
      return `You're paid — waiting on ${who} to pay their entry fee`;
    }
    return 'Team confirmed — all players paid';
  }

  if (me?.paymentState === 'declined') return 'You declined this invite';
  if (me?.paymentState === 'expired')  return 'Your invite expired';

  return 'Your entry fee is still due';
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Every team the user belongs to. RLS ("registration_groups: member read") scopes this. */
export async function fetchRegistrationGroupsForUser(userId: string): Promise<RegistrationGroup[]> {
  const { data: memberships } = await supabase
    .from('registration_group_members')
    .select('group_id')
    .eq('user_id', userId);

  const groupIds = (memberships ?? []).map(m => m.group_id as string);
  if (groupIds.length === 0) return [];

  const { data, error } = await supabase
    .from('registration_groups')
    .select(GROUP_SELECT)
    .in('id', groupIds)
    .neq('status', 'cancelled');

  if (error || !data) return [];
  return (data as unknown as GroupRow[]).map(rowToGroup);
}

/** Teams where THIS user still owes their own entry fee. */
export async function fetchOpenTeamObligations(userId: string): Promise<RegistrationGroup[]> {
  const groups = await fetchRegistrationGroupsForUser(userId);
  return groups.filter(g => {
    const me = memberFor(g, userId);
    return me != null && (me.paymentState === 'invited' || me.paymentState === 'pending_payment');
  });
}

export async function fetchRegistrationGroup(groupId: string): Promise<RegistrationGroup | null> {
  const { data, error } = await supabase
    .from('registration_groups')
    .select(GROUP_SELECT)
    .eq('id', groupId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToGroup(data as unknown as GroupRow);
}

/** Director view — RLS ("registration_groups: director read own tournament") scopes this. */
export async function fetchRegistrationGroupsForTournament(tournamentId: string): Promise<RegistrationGroup[]> {
  const { data, error } = await supabase
    .from('registration_groups')
    .select(GROUP_SELECT)
    .eq('tournament_id', tournamentId);

  if (error || !data) return [];
  return (data as unknown as GroupRow[]).map(rowToGroup);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Declines the caller's own unpaid invite. The RPC is SECURITY DEFINER and
 * scoped to auth.uid(); it cannot touch an already-paid obligation, another
 * player's row, or any money column.
 */
export async function declineTeamInvite(groupId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('decline_registration_group_invite', { p_group_id: groupId });
  if (error) return false;
  return data === true;
}
