// Blocking (TODO1.1 item 4.3).
//
// This file's previous header said "No screen in the app reads this table yet
// (no blocked-content filtering elsewhere)". That was accurate and it was the
// problem: blocked_users was write-only, so the Block button stopped nothing
// except matchmaking. Enforcement now lives in the database
// (20260831040000) — direct messages between blocked users are rejected at
// insert, and the conversation is hidden by RESTRICTIVE policies.
//
// Enforcement is deliberately server-side. Client filtering is a display
// preference: it can be bypassed with a direct PostgREST call, and every new
// screen re-opens the hole.
//
// Still NOT covered, each because it needs a product decision rather than more
// code: group visibility, invites, search ranking, profile access. Blocking
// someone in a 40-person group chat is not the same question as blocking them
// in a DM.

import { supabase } from '@/lib/supabase';

export type BlockedAccount = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
};

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (error) throw error;
}

/**
 * Removes a block.
 *
 * This exists because the enforcement added in 4.3 made blocking consequential:
 * it hides the conversation and its history. A block that cannot be undone is a
 * trap rather than a safety tool — people block in anger, in error, and by
 * mis-tap, and the app has to let them back out.
 *
 * Scoped to blocker_id = the caller, matching the RLS delete policy. Passing
 * someone else's id deletes nothing rather than erroring, which is the correct
 * shape: the caller learns nothing about blocks that are not theirs.
 */
export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

/**
 * The caller's own blocks, newest first.
 *
 * Only blocks the caller MADE — RLS exposes nothing else, and that is
 * deliberate: nobody should be able to enumerate who has blocked them.
 *
 * The profile join can come back null for an account that has since been
 * deleted. The row is still returned, because a block whose target cannot be
 * named is still a block the user may want to lift.
 */
export async function listBlockedUsers(blockerId: string): Promise<BlockedAccount[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at, blocked:profiles!blocked_users_blocked_id_fkey(full_name, avatar_url)')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  type Row = {
    blocked_id: string;
    created_at: string;
    blocked: { full_name: string | null; avatar_url: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.blocked_id,
    fullName: row.blocked?.full_name ?? null,
    avatarUrl: row.blocked?.avatar_url ?? null,
    blockedAt: row.created_at,
  }));
}
