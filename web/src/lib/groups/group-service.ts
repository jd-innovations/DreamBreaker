// Groups data layer for web. Mirrors apps/mobile/src/lib/groupService.ts —
// same function names/signatures where practical, so the two stay easy to
// compare. See GROUPS_WEB_PLAN.md for the audit this was built from.

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@shared/database.types";
import type {
  Group, GroupInsert, GroupMember, GroupPostWithMeta, GroupFeedItem,
  GroupComment, PlayEventRow,
} from "./types";

type CreateGroupInput = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  location: string | null;
  skill: string | null;
  privacy: "public" | "private" | "secret";
  allowInvites: boolean;
  allowPosts: boolean;
};

function randomToken(): string {
  // 32 hex chars — collision-proof enough for a join-link token, and the
  // column is UNIQUE so a collision would just fail the insert (astronomically
  // unlikely at this length, not worth a retry loop).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fetchGroup(id: string): Promise<Group | null> {
  const supabase = createClient();
  const { data } = await supabase.from("groups").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { count } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", id)
    .eq("status", "active");
  return { ...data, memberCount: count ?? 0 };
}

/**
 * Unread activity per group — posts and comments since the member last opened
 * it, by anyone but them. Shared with mobile (group_unread_counts,
 * 20260923270000), so a group read on the phone is read here too.
 *
 * Best effort: a failure returns an empty map so the list renders without
 * badges rather than not at all.
 */
export async function fetchGroupUnreadCounts(): Promise<Record<string, number>> {
  const { data, error } = await createClient().rpc("group_unread_counts");
  if (error) return {};
  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.group_id] = row.unread_count ?? 0;
  return out;
}

/** Clears the badge. Called when a group page opens; only ever moves forward. */
export async function markGroupRead(groupId: string): Promise<void> {
  await createClient().rpc("mark_group_read", { p_group_id: groupId });
}

export async function fetchMyGroups(userId: string): Promise<Group[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("group_members")
    .select("groups!inner(*)")
    .eq("user_id", userId)
    .eq("status", "active");
  const groups = (data ?? []).map((r) => r.groups).filter((g): g is NonNullable<typeof g> => !!g);
  return attachMemberCounts(groups);
}

export async function fetchDiscoverGroups(userId: string, limit = 20): Promise<Group[]> {
  const supabase = createClient();
  const { data: memberRows } = await supabase.from("group_members").select("group_id").eq("user_id", userId);
  const excludeIds = (memberRows ?? []).map((r) => r.group_id);

  let q = supabase.from("groups").select("*").eq("privacy", "public").order("created_at", { ascending: false }).limit(limit);
  if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
  const { data } = await q;
  return attachMemberCounts(data ?? []);
}

async function attachMemberCounts(groups: Omit<Group, "memberCount">[]): Promise<Group[]> {
  if (groups.length === 0) return [];
  const supabase = createClient();
  const ids = groups.map((g) => g.id);
  const { data: memberRows } = await supabase.from("group_members").select("group_id").in("group_id", ids).eq("status", "active");
  const counts: Record<string, number> = {};
  (memberRows ?? []).forEach((m) => { counts[m.group_id] = (counts[m.group_id] ?? 0) + 1; });
  return groups.map((g) => ({ ...g, memberCount: counts[g.id] ?? 0 }));
}

export async function createGroup(input: CreateGroupInput, userId: string): Promise<Group> {
  const supabase = createClient();

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .insert({ conversation_type: "group", title: input.name, created_by: userId })
    .select("id")
    .single();
  if (convErr || !conversation) throw convErr ?? new Error("Could not create group conversation.");

  // Secret groups get a shareable invite token up front (GROUPS_WEB_PLAN.md
  // §5a) — public/private groups never have one.
  const invite_token = input.privacy === "secret" ? randomToken() : null;

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .insert({
      name: input.name,
      description: input.description,
      image_url: input.imageUrl,
      location: input.location,
      skill: input.skill,
      privacy: input.privacy,
      allow_invites: input.allowInvites,
      allow_posts: input.allowPosts,
      organizer_id: userId,
      conversation_id: conversation.id,
      invite_token,
    } satisfies GroupInsert)
    .select("*")
    .single();
  if (groupErr || !group) throw groupErr ?? new Error("Could not create group.");

  await Promise.all([
    supabase.from("group_members").insert({ group_id: group.id, user_id: userId, role: "owner", status: "active" }),
    supabase.from("conversation_participants").upsert(
      { conversation_id: conversation.id, user_id: userId, role: "owner" },
      { onConflict: "conversation_id,user_id" },
    ),
  ]);

  return { ...group, memberCount: 1 };
}

export async function updateGroup(id: string, patch: Partial<CreateGroupInput>): Promise<void> {
  const supabase = createClient();
  const dbPatch: Database["public"]["Tables"]["groups"]["Update"] = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.imageUrl !== undefined) dbPatch.image_url = patch.imageUrl;
  if (patch.location !== undefined) dbPatch.location = patch.location;
  if (patch.skill !== undefined) dbPatch.skill = patch.skill;
  if (patch.privacy !== undefined) dbPatch.privacy = patch.privacy;
  if (patch.allowInvites !== undefined) dbPatch.allow_invites = patch.allowInvites;
  if (patch.allowPosts !== undefined) dbPatch.allow_posts = patch.allowPosts;
  const { error } = await supabase.from("groups").update(dbPatch).eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error) throw error;
}

export async function getMembership(groupId: string, userId: string): Promise<{ role: string; status: string } | null> {
  const supabase = createClient();
  const { data } = await supabase.from("group_members").select("role,status").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  return data ?? null;
}

export async function joinGroup(groupId: string, userId: string): Promise<"active" | "pending"> {
  const supabase = createClient();
  const { data: group } = await supabase.from("groups").select("privacy,conversation_id").eq("id", groupId).single();
  const status: "active" | "pending" = group?.privacy === "private" ? "pending" : "active";

  const { error } = await supabase
    .from("group_members")
    .upsert({ group_id: groupId, user_id: userId, role: "member", status }, { onConflict: "group_id,user_id" });
  if (error) throw error;

  if (status === "active" && group?.conversation_id) {
    await supabase.from("conversation_participants").upsert(
      { conversation_id: group.conversation_id, user_id: userId, role: "member" },
      { onConflict: "conversation_id,user_id" },
    );
  }
  return status;
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { data: group } = await supabase.from("groups").select("conversation_id").eq("id", groupId).single();
  await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  if (group?.conversation_id) {
    await supabase.from("conversation_participants").delete().eq("conversation_id", group.conversation_id).eq("user_id", userId);
  }
}

export const removeMember = leaveGroup;

export async function approveJoinRequest(groupId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { data: group } = await supabase.from("groups").select("conversation_id").eq("id", groupId).single();
  const { error } = await supabase.from("group_members").update({ status: "active" }).eq("group_id", groupId).eq("user_id", userId);
  if (error) throw error;
  if (group?.conversation_id) {
    await supabase.from("conversation_participants").upsert(
      { conversation_id: group.conversation_id, user_id: userId, role: "member" },
      { onConflict: "conversation_id,user_id" },
    );
  }
}

export async function declineJoinRequest(groupId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  if (error) throw error;
}

export async function setMemberRole(groupId: string, userId: string, role: "admin" | "member"): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_members").update({ role }).eq("group_id", groupId).eq("user_id", userId);
  if (error) throw error;
}

export async function fetchMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("group_members")
    .select("user_id, role, status, joined_at, profiles!group_members_user_id_fkey(full_name,handle,avatar_url,dupr,self_rating,location_city)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  return (data ?? []).map((r) => ({
    userId: r.user_id,
    role: r.role as GroupMember["role"],
    status: r.status as GroupMember["status"],
    joinedAt: r.joined_at,
    fullName: r.profiles?.full_name ?? null,
    handle: r.profiles?.handle ?? null,
    avatarUrl: r.profiles?.avatar_url ?? null,
    dupr: r.profiles?.dupr ?? null,
    selfRating: r.profiles?.self_rating ?? null,
    locationCity: r.profiles?.location_city ?? null,
  }));
}

export async function fetchGroupEvents(groupId: string): Promise<PlayEventRow[]> {
  const supabase = createClient();
  const { data } = await supabase.from("play_events").select("*").eq("group_id", groupId).order("event_date", { ascending: false });
  return data ?? [];
}

// ─── Feed ───────────────────────────────────────────────────────────────────

async function hydratePosts(rows: { id: string; author_id: string; kind: string }[], userId: string): Promise<Map<string, GroupPostWithMeta>> {
  const supabase = createClient();
  const postIds = rows.map((r) => r.id);
  if (postIds.length === 0) return new Map();

  const [{ data: authors }, { data: likes }, { data: comments }, { data: pollOptions }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,avatar_url").in("id", [...new Set(rows.map((r) => r.author_id))]),
    supabase.from("group_post_likes").select("post_id,user_id").in("post_id", postIds),
    supabase.from("group_post_comments").select("post_id").in("post_id", postIds),
    supabase.from("group_poll_options").select("*").in("post_id", postIds.filter((id) => rows.find((r) => r.id === id)?.kind === "poll")),
  ]);

  const optionIds = (pollOptions ?? []).map((o) => o.id);
  const { data: votes } = optionIds.length > 0
    ? await supabase.from("group_poll_votes").select("option_id,user_id").in("option_id", optionIds)
    : { data: [] as { option_id: string; user_id: string }[] };

  const authorMap = new Map((authors ?? []).map((a) => [a.id, a]));
  const likeCounts = new Map<string, number>();
  const likedByMe = new Set<string>();
  (likes ?? []).forEach((l) => {
    likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1);
    if (l.user_id === userId) likedByMe.add(l.post_id);
  });
  const commentCounts = new Map<string, number>();
  (comments ?? []).forEach((c) => { commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1); });
  const votesByOption = new Map<string, { count: number; votedByMe: boolean }>();
  (votes ?? []).forEach((v) => {
    const existing = votesByOption.get(v.option_id) ?? { count: 0, votedByMe: false };
    existing.count += 1;
    if (v.user_id === userId) existing.votedByMe = true;
    votesByOption.set(v.option_id, existing);
  });
  const optionsByPost = new Map<string, typeof pollOptions>();
  (pollOptions ?? []).forEach((o) => {
    const arr = optionsByPost.get(o.post_id) ?? [];
    arr.push(o);
    optionsByPost.set(o.post_id, arr);
  });

  const result = new Map<string, GroupPostWithMeta>();
  for (const r of rows as GroupPostWithMeta[]) {
    const author = authorMap.get(r.author_id);
    const options = (optionsByPost.get(r.id) ?? []).sort((a, b) => a.position - b.position);
    result.set(r.id, {
      ...r,
      author: author ? { fullName: author.full_name, avatarUrl: author.avatar_url } : null,
      likeCount: likeCounts.get(r.id) ?? 0,
      likedByMe: likedByMe.has(r.id),
      commentCount: commentCounts.get(r.id) ?? 0,
      pollOptions: options.map((o) => ({ ...o, voteCount: votesByOption.get(o.id)?.count ?? 0, votedByMe: votesByOption.get(o.id)?.votedByMe ?? false })),
    });
  }
  return result;
}

export async function fetchGroupFeed(groupId: string, userId: string, limit = 30): Promise<GroupFeedItem[]> {
  const supabase = createClient();
  const [{ data: postRows }, { data: eventRows }] = await Promise.all([
    supabase.from("group_posts").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(limit),
    supabase.from("play_events").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(10),
  ]);

  const hydrated = await hydratePosts(postRows ?? [], userId);
  const items: GroupFeedItem[] = [];
  for (const p of postRows ?? []) {
    const post = hydrated.get(p.id);
    if (post) items.push({ kind: "post", createdAt: post.created_at, post });
  }
  for (const e of eventRows ?? []) {
    items.push({ kind: "event", createdAt: e.created_at, event: e });
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPost(groupId: string, authorId: string, body: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_posts").insert({ group_id: groupId, author_id: authorId, kind: "post", body });
  if (error) throw error;
}

export async function createPhotoPost(groupId: string, authorId: string, imageUrl: string, caption: string | null): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_posts")
    .insert({ group_id: groupId, author_id: authorId, kind: "post", image_url: imageUrl, body: caption })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Could not create photo post.");
  await supabase.from("group_photos").insert({ group_id: groupId, uploaded_by: authorId, url: imageUrl, post_id: data.id });
}

export async function createPoll(groupId: string, authorId: string, question: string, options: string[]): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_posts")
    .insert({ group_id: groupId, author_id: authorId, kind: "poll", body: question })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Could not create poll.");
  const rows = options.map((label, i) => ({ post_id: data.id, label, position: i }));
  const { error: optErr } = await supabase.from("group_poll_options").insert(rows);
  if (optErr) throw optErr;
}

export async function updatePost(postId: string, body: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_posts").update({ body, edited_at: new Date().toISOString() }).eq("id", postId);
  if (error) throw error;
}

export async function deletePost(postId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_posts").delete().eq("id", postId);
  if (error) throw error;
}

export async function toggleLike(postId: string, userId: string, currentlyLiked: boolean): Promise<void> {
  const supabase = createClient();
  if (currentlyLiked) {
    await supabase.from("group_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
  } else {
    await supabase.from("group_post_likes").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id" });
  }
}

export async function votePoll(postId: string, optionId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { data: myOptions } = await supabase.from("group_poll_options").select("id").eq("post_id", postId);
  const ids = (myOptions ?? []).map((o) => o.id);
  if (ids.length > 0) await supabase.from("group_poll_votes").delete().eq("user_id", userId).in("option_id", ids);
  const { error } = await supabase.from("group_poll_votes").insert({ option_id: optionId, user_id: userId });
  if (error) throw error;
}

export async function fetchComments(postId: string): Promise<GroupComment[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("group_post_comments")
    .select("*, profiles!group_post_comments_author_id_fkey(full_name,avatar_url)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((c) => ({
    ...c,
    author: c.profiles ? { fullName: c.profiles.full_name, avatarUrl: c.profiles.avatar_url } : null,
  }));
}

export async function addComment(postId: string, authorId: string, body: string, parentCommentId?: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_post_comments").insert({ post_id: postId, author_id: authorId, body, parent_comment_id: parentCommentId ?? null });
  if (error) throw error;
}

export async function updateComment(commentId: string, body: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_post_comments").update({ body, edited_at: new Date().toISOString() }).eq("id", commentId);
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_post_comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function reportContent(input: {
  reporterId: string;
  groupId: string;
  targetType: "group_post" | "group_comment";
  targetId: string;
  reportedUserId: string;
  reason: string;
  notes?: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_post_reports").insert({
    reporter_id: input.reporterId,
    group_id: input.groupId,
    target_type: input.targetType,
    target_id: input.targetId,
    reported_user_id: input.reportedUserId,
    reason: input.reason as never,
    notes: input.notes ?? null,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("You already reported this.");
    throw error;
  }
}

// ─── Photos ─────────────────────────────────────────────────────────────────

export async function fetchGroupPhotos(groupId: string) {
  const supabase = createClient();
  const { data } = await supabase.from("group_photos").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  return data ?? [];
}

export async function uploadGroupPhoto(groupId: string, userId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${groupId}/${userId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("group-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("group-photos").getPublicUrl(path);
  await supabase.from("group_photos").insert({ group_id: groupId, uploaded_by: userId, url: data.publicUrl });
  return data.publicUrl;
}

export async function uploadGroupPostImage(groupId: string, userId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${groupId}/${userId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("group-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("group-photos").getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteGroupPhoto(photoId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_photos").delete().eq("id", photoId);
  if (error) throw error;
}

export async function uploadGroupBanner(userId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `banners/${userId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("group-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("group-photos").getPublicUrl(path);
  return data.publicUrl;
}
