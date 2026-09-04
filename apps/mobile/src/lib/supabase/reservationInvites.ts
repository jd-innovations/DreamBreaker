import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER LOOKUP -- reused, not duplicated
// ─────────────────────────────────────────────────────────────────────────────
//
// fetchFriends()/searchPlayers() in playEventInvites.ts already query
// profiles/partner_matches generically -- they have no play_event-specific
// logic, so there's nothing booking-specific to add. Re-exported here so
// booking screens have one import point without a second copy of the query.

export { fetchFriends, searchPlayers, type InvitablePlayer } from './playEventInvites';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Shape mirrors play_event_invites / playEventInvites.ts, with one
// deliberate difference: sending is organizer-only (enforced by the
// "reservation_invites: inviter_can_send" RLS policy), matching the "Find
// Players" spec -- an organizer action, not "any joined participant may
// invite" like play_event_invites allows.

export type ReservationInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export async function fetchInvitedProfileIds(reservationId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('reservation_invites')
    .select('invitee_id')
    .eq('reservation_id', reservationId)
    .in('status', ['pending', 'accepted']);
  return new Set((data ?? []).map(row => row.invitee_id));
}

export async function sendReservationInvite(
  reservationId: string,
  inviterId: string,
  inviteeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('reservation_invites')
    .insert({ reservation_id: reservationId, inviter_id: inviterId, invitee_id: inviteeId });
  if (error) throw error;
}

export async function cancelReservationInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('reservation_invites')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
}

export type ReceivedReservationInvite = {
  id: string;
  status: ReservationInviteStatus;
  created_at: string;
  reservation: {
    id: string;
    facility_id: string;
    asset_type: string;
    asset_id: string;
    time_range: string;
  } | null;
  inviter: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
};

export async function fetchReceivedReservationInvites(userId: string): Promise<ReceivedReservationInvite[]> {
  const { data, error } = await supabase
    .from('reservation_invites')
    .select(`
      id, status, created_at,
      reservation:reservations!reservation_id(id, facility_id, asset_type, asset_id, time_range),
      inviter:profiles!inviter_id(id, full_name, avatar_url)
    `)
    .eq('invitee_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ReceivedReservationInvite[];
}

export type SentReservationInvite = {
  id: string;
  status: ReservationInviteStatus;
  created_at: string;
  invitee: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
};

export async function fetchSentReservationInvites(reservationId: string): Promise<SentReservationInvite[]> {
  const { data, error } = await supabase
    .from('reservation_invites')
    .select(`
      id, status, created_at,
      invitee:profiles!invitee_id(id, full_name, avatar_url)
    `)
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as SentReservationInvite[];
}

// Flips the invite to accepted AND seats the player, atomically, via the
// accept_reservation_invite RPC -- see the migration for the capacity/
// hold-expiry guards this enforces server-side.
export async function acceptReservationInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_reservation_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

export async function declineReservationInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('reservation_invites')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
}
