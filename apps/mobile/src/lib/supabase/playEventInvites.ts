import { supabase } from '@/lib/supabase';
import { addPlayParticipant, joinEventErrorMessage } from '@/lib/supabase/playEvents';

export type InvitablePlayer = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  dupr: number | null;
  self_rating: string | null;
};

// ─── Friends (real mutual matches) ─────────────────────────────────────────────
// Same source as match/connections.tsx — partner_matches is the only real
// "friends" concept in the app; connectionStore.ts is local mock data and has
// no real profile ids, so it can't back a real invite.

export async function fetchFriends(userId: string): Promise<InvitablePlayer[]> {
  const { data: matches } = await supabase
    .from('partner_matches')
    .select('user_a, user_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (!matches || matches.length === 0) return [];

  const otherIds = matches.map(m => (m.user_a === userId ? m.user_b : m.user_a));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating')
    .in('id', otherIds);

  return profiles ?? [];
}

export async function searchPlayers(userId: string, query: string): Promise<InvitablePlayer[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating')
    .ilike('full_name', `%${trimmed}%`)
    .neq('id', userId)
    .limit(20);

  return data ?? [];
}

// ─── Invites ────────────────────────────────────────────────────────────────

export type PlayEventInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export async function fetchInvitedUserIds(playEventId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('play_event_invites')
    .select('invitee_id')
    .eq('play_event_id', playEventId)
    .in('status', ['pending', 'accepted']);
  return new Set((data ?? []).map(row => row.invitee_id));
}

export async function sendPlayEventInvite(
  playEventId: string,
  inviterId: string,
  inviteeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('play_event_invites')
    .insert({ play_event_id: playEventId, inviter_id: inviterId, invitee_id: inviteeId });
  if (error) throw error;
}

export async function cancelPlayEventInvite(inviteId: string): Promise<void> {
  await supabase
    .from('play_event_invites')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', inviteId);
}

export type ReceivedPlayEventInvite = {
  id: string;
  status: PlayEventInviteStatus;
  created_at: string;
  play_event: {
    id: string;
    name: string;
    event_date: string;
    venue_name: string | null;
    location: string | null;
  } | null;
  inviter: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
};

export async function fetchReceivedInvites(userId: string): Promise<ReceivedPlayEventInvite[]> {
  const { data } = await supabase
    .from('play_event_invites')
    .select(`
      id, status, created_at,
      play_event:play_events!play_event_id(id, name, event_date, venue_name, location),
      inviter:profiles!inviter_id(id, full_name, avatar_url)
    `)
    .eq('invitee_id', userId)
    .order('created_at', { ascending: false });

  return (data ?? []) as unknown as ReceivedPlayEventInvite[];
}

export type SentPlayEventInvite = {
  id: string;
  status: PlayEventInviteStatus;
  created_at: string;
  play_event: {
    id: string;
    name: string;
    event_date: string;
    venue_name: string | null;
    location: string | null;
  } | null;
  invitee: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
};

export async function fetchSentInvites(userId: string): Promise<SentPlayEventInvite[]> {
  const { data } = await supabase
    .from('play_event_invites')
    .select(`
      id, status, created_at,
      play_event:play_events!play_event_id(id, name, event_date, venue_name, location),
      invitee:profiles!invitee_id(id, full_name, avatar_url)
    `)
    .eq('inviter_id', userId)
    .order('created_at', { ascending: false });

  return (data ?? []) as unknown as SentPlayEventInvite[];
}

// Accepting both marks the invite accepted and joins the event roster via the
// existing capacity-checked join_play_event RPC.
export async function acceptPlayEventInvite(
  invite: ReceivedPlayEventInvite,
  userId: string,
  fullName: string,
  email: string,
): Promise<void> {
  if (!invite.play_event) throw new Error('This event no longer exists.');

  try {
    await addPlayParticipant({
      event_id: invite.play_event.id,
      first_name: fullName.split(' ')[0] || fullName,
      email,
      claimed_by: userId,
    });
  } catch (err) {
    throw new Error(joinEventErrorMessage(err));
  }

  await supabase
    .from('play_event_invites')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', invite.id);
}

export async function declinePlayEventInvite(inviteId: string): Promise<void> {
  await supabase
    .from('play_event_invites')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', inviteId);
}
