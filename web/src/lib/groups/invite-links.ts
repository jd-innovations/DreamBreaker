// Shareable invite links for secret groups (GROUPS_WEB_PLAN.md §5a, new —
// mobile has no equivalent). Backed by the invite_token column on `groups`
// and two SECURITY DEFINER RPCs added in
// supabase/migrations/20260917083954_group_secret_invite_links.sql.

import { createClient } from "@/lib/supabase/client";

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generates a fresh token for a secret group, invalidating any previous link. */
export async function regenerateInviteLink(groupId: string): Promise<string> {
  const supabase = createClient();
  const token = randomToken();
  const { error } = await supabase.from("groups").update({ invite_token: token }).eq("id", groupId);
  if (error) throw error;
  return token;
}

export type GroupInvitePreview = { id: string; name: string; description: string | null; imageUrl: string | null; memberCount: number };

export async function fetchGroupPreviewByToken(token: string): Promise<GroupInvitePreview | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_group_preview_by_invite_token", { p_token: token });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return { id: row.id, name: row.name, description: row.description, imageUrl: row.image_url, memberCount: row.member_count };
}

export async function joinGroupViaToken(token: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("join_group_via_invite_token", { p_token: token });
  if (error) throw error;
}
