import { supabase } from '@/lib/supabase';

export type GroupInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type GroupInviteCandidate = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  dupr: number | null;
  self_rating: string | null;
  location_city: string | null;
};

export type ReceivedGroupInvite = {
  id: string;
  status: GroupInviteStatus;
  created_at: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
};

export type ReceivedGroupInviteDetails = ReceivedGroupInvite & {
  group: {
    id: string;
    name: string;
    image_url: string | null;
    privacy: string | null;
  } | null;
  inviter: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
};

export type SentGroupInviteDetails = ReceivedGroupInvite & {
  group: {
    id: string;
    name: string;
    image_url: string | null;
    privacy: string | null;
  } | null;
  invitee: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
};

type SupabaseLikeError = { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };

const GROUP_INVITES_SETUP_MESSAGE = 'Group invites need a database update before they can be used.';

function groupInvitesTable() {
  return (supabase as any).from('group_invites');
}

function isGroupInvitesMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as SupabaseLikeError;
  return e.code === 'PGRST205'
    || (typeof e.message === 'string' && e.message.includes("'public.group_invites'"));
}

function inviteError(error: unknown, fallback: string): Error {
  if (isGroupInvitesMissing(error)) return new Error(GROUP_INVITES_SETUP_MESSAGE);
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const e = error as SupabaseLikeError;
    const parts = [e.message, e.details, e.hint, e.code]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length) return new Error(parts.join(' '));
  }
  return new Error(fallback);
}

function logMissingGroupInvites() {
  console.warn('[groupInvites] public.group_invites is missing from Supabase schema cache. Apply migration 20260712010000_group_invites.sql.');
}

export async function fetchGroupInvitedUserIds(groupId: string): Promise<Set<string>> {
  const { data, error } = await groupInvitesTable()
    .select('invitee_id')
    .eq('group_id', groupId)
    .in('status', ['pending', 'accepted']);

  if (isGroupInvitesMissing(error)) {
    logMissingGroupInvites();
    return new Set();
  }
  if (error) throw inviteError(error, 'Could not load group invites.');
  return new Set((data ?? []).map((row: { invitee_id: string }) => row.invitee_id));
}

async function fetchConnectedUserIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('partner_matches')
    .select('user_a, user_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  return (data ?? []).map(match => (match.user_a === userId ? match.user_b : match.user_a));
}

async function fetchGroupMemberUserIds(groupId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('status', ['active', 'pending']);

  return new Set((data ?? []).map(row => row.user_id));
}

export async function fetchGroupInviteCandidates(
  groupId: string,
  userId: string,
): Promise<GroupInviteCandidate[]> {
  const [connectedIds, memberIds, invitedIds] = await Promise.all([
    fetchConnectedUserIds(userId),
    fetchGroupMemberUserIds(groupId),
    fetchGroupInvitedUserIds(groupId),
  ]);

  const candidateIds = connectedIds.filter(id => id !== userId && !memberIds.has(id) && !invitedIds.has(id));
  if (!candidateIds.length) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating, location_city')
    .in('id', candidateIds)
    .order('full_name', { ascending: true });

  if (error) throw inviteError(error, 'Could not load invite candidates.');
  return data ?? [];
}

export async function sendGroupInvite(
  groupId: string,
  inviterId: string,
  inviteeId: string,
): Promise<void> {
  const { error } = await groupInvitesTable()
    .insert({ group_id: groupId, inviter_id: inviterId, invitee_id: inviteeId });

  if (error) throw inviteError(error, 'Could not send group invite.');
}

export async function fetchReceivedGroupInvites(userId: string): Promise<ReceivedGroupInviteDetails[]> {
  const { data, error } = await groupInvitesTable()
    .select(`
      id, status, created_at, group_id, inviter_id, invitee_id,
      group:groups!group_id(id, name, image_url, privacy),
      inviter:profiles!inviter_id(id, full_name, avatar_url)
    `)
    .eq('invitee_id', userId)
    .order('created_at', { ascending: false });

  if (isGroupInvitesMissing(error)) {
    logMissingGroupInvites();
    return [];
  }
  if (error) throw inviteError(error, 'Could not load received group invites.');
  return (data ?? []) as ReceivedGroupInviteDetails[];
}

export async function fetchSentGroupInvites(userId: string): Promise<SentGroupInviteDetails[]> {
  const { data, error } = await groupInvitesTable()
    .select(`
      id, status, created_at, group_id, inviter_id, invitee_id,
      group:groups!group_id(id, name, image_url, privacy),
      invitee:profiles!invitee_id(id, full_name, avatar_url)
    `)
    .eq('inviter_id', userId)
    .order('created_at', { ascending: false });

  if (isGroupInvitesMissing(error)) {
    logMissingGroupInvites();
    return [];
  }
  if (error) throw inviteError(error, 'Could not load sent group invites.');
  return (data ?? []) as SentGroupInviteDetails[];
}

export async function fetchPendingGroupInviteForUser(
  groupId: string,
  userId: string,
): Promise<ReceivedGroupInvite | null> {
  const { data, error } = await groupInvitesTable()
    .select('id, status, created_at, group_id, inviter_id, invitee_id')
    .eq('group_id', groupId)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (isGroupInvitesMissing(error)) {
    logMissingGroupInvites();
    return null;
  }
  if (error) throw inviteError(error, 'Could not load pending group invite.');
  return (data ?? null) as ReceivedGroupInvite | null;
}

export async function acceptGroupInvite(invite: ReceivedGroupInvite): Promise<void> {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('conversation_id')
    .eq('id', invite.group_id)
    .single();

  if (groupError || !group) throw inviteError(groupError, 'Group not found.');

  await supabase
    .from('group_members')
    .delete()
    .eq('group_id', invite.group_id)
    .eq('user_id', invite.invitee_id)
    .eq('status', 'pending');

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: invite.group_id, user_id: invite.invitee_id, role: 'member', status: 'active' });
  if (memberError) throw inviteError(memberError, 'Could not join group.');

  if (group.conversation_id) {
    const { error: participantError } = await supabase.from('conversation_participants').upsert(
      { conversation_id: group.conversation_id, user_id: invite.invitee_id, role: 'member' },
      { onConflict: 'conversation_id,user_id' },
    );
    if (participantError) throw inviteError(participantError, 'Could not join group chat.');
  }

  const { error: inviteUpdateError } = await groupInvitesTable()
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', invite.id);
  if (inviteUpdateError) throw inviteError(inviteUpdateError, 'Could not accept group invite.');
}

export async function declineGroupInvite(inviteId: string): Promise<void> {
  const { error } = await groupInvitesTable()
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw inviteError(error, 'Could not decline group invite.');
}

export async function cancelGroupInvite(inviteId: string): Promise<void> {
  const { error } = await groupInvitesTable()
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw inviteError(error, 'Could not cancel group invite.');
}