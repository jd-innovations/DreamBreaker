// Targeted group invites. Decoupled from any connections/matchmaking system
// on purpose (GROUPS_WEB_PLAN.md decision D3, §5c) — mobile restricts
// invite candidates to `partner_matches` connections; web uses open
// name/handle search instead, independent of web's own separate
// matchmaking system (matchmaking_swipes / v_mutual_matches). Everything
// past candidate-sourcing (send/accept/decline, the notify_group_invite DB
// trigger) is unchanged from mobile's apps/mobile/src/lib/supabase/
// groupInvites.ts.

import { createClient } from "@/lib/supabase/client";

export type InvitableUser = { id: string; fullName: string | null; handle: string | null; avatarUrl: string | null };

export async function searchInvitableUsers(groupId: string, currentUserId: string, query: string): Promise<InvitableUser[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const supabase = createClient();

  const [{ data: members }, { data: pending }] = await Promise.all([
    supabase.from("group_members").select("user_id").eq("group_id", groupId),
    supabase.from("group_invites").select("invitee_id").eq("group_id", groupId).eq("status", "pending"),
  ]);
  const exclude = new Set<string>([currentUserId, ...(members ?? []).map((m) => m.user_id), ...(pending ?? []).map((p) => p.invitee_id)]);

  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,handle,avatar_url")
    .or(`full_name.ilike.%${trimmed}%,handle.ilike.%${trimmed}%`)
    .limit(20);

  return (data ?? [])
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({ id: p.id, fullName: p.full_name, handle: p.handle, avatarUrl: p.avatar_url }));
}

export async function sendGroupInvite(groupId: string, inviterId: string, inviteeId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_invites").insert({ group_id: groupId, inviter_id: inviterId, invitee_id: inviteeId });
  if (error) throw error;
}

export type PendingGroupInvite = { id: string; groupId: string; inviterId: string; status: string };

export async function fetchPendingGroupInviteForUser(groupId: string, userId: string): Promise<PendingGroupInvite | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("group_invites")
    .select("id,group_id,inviter_id,status")
    .eq("group_id", groupId)
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, groupId: data.group_id, inviterId: data.inviter_id, status: data.status };
}

export async function acceptGroupInvite(invite: PendingGroupInvite, userId: string): Promise<void> {
  const supabase = createClient();
  const { data: group } = await supabase.from("groups").select("conversation_id").eq("id", invite.groupId).single();

  // Clear a stray pending self-join row for a private group, if one exists,
  // same as mobile — a user may have both requested to join AND been
  // separately invited.
  await supabase.from("group_members").delete().eq("group_id", invite.groupId).eq("user_id", userId).eq("status", "pending");

  const { error } = await supabase.from("group_members").upsert(
    { group_id: invite.groupId, user_id: userId, role: "member", status: "active" },
    { onConflict: "group_id,user_id" },
  );
  if (error) throw error;

  if (group?.conversation_id) {
    await supabase.from("conversation_participants").upsert(
      { conversation_id: group.conversation_id, user_id: userId, role: "member" },
      { onConflict: "conversation_id,user_id" },
    );
  }

  await supabase.from("group_invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id);
}

export async function declineGroupInvite(inviteId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("group_invites").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", inviteId);
}
