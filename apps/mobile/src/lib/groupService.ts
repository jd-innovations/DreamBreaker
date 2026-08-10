import { supabase } from '@/lib/supabase';
import type { Tables, Database } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupPrivacy = 'public' | 'private' | 'secret';
export type GroupRole    = 'owner' | 'admin' | 'member';
export type GroupRow     = Tables<'groups'>;

export type Group = GroupRow & { memberCount: number };

export type GroupMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  dupr: number | null;
  selfRating: string | null;
  locationCity: string | null;
  role: GroupRole;
  status: 'active' | 'pending';
  joinedAt: string;
};

export type GroupPost = Tables<'group_posts'>;
export type GroupPollOption = Tables<'group_poll_options'>;
export type GroupPhoto = Tables<'group_photos'>;

export type GroupPostWithMeta = GroupPost & {
  author: { id: string; full_name: string; avatar_url: string | null };
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  pollOptions: (GroupPollOption & { voteCount: number; votedByMe: boolean })[];
};

export type GroupFeedItem =
  | { kind: 'post'; post: GroupPostWithMeta }
  | { kind: 'event'; event: Tables<'play_events'> };

// ─── Member count helper ─────────────────────────────────────────────────────

async function fetchMemberCounts(groupIds: string[]): Promise<Record<string, number>> {
  if (groupIds.length === 0) return {};
  const { data } = await supabase
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds)
    .eq('status', 'active');
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.group_id] = (counts[row.group_id] ?? 0) + 1;
  return counts;
}

function withCounts(rows: GroupRow[], counts: Record<string, number>): Group[] {
  return rows.map(g => ({ ...g, memberCount: counts[g.id] ?? 0 }));
}

// ─── Group CRUD ───────────────────────────────────────────────────────────────

export async function fetchGroup(id: string): Promise<Group | null> {
  const { data, error } = await supabase.from('groups').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const counts = await fetchMemberCounts([data.id]);
  return { ...data, memberCount: counts[data.id] ?? 0 };
}

export async function fetchMyGroups(userId: string): Promise<Group[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group:groups!inner(*)')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw error;
  const rows = (data ?? []).map(r => r.group as unknown as GroupRow).filter(Boolean);
  const counts = await fetchMemberCounts(rows.map(g => g.id));
  return withCounts(rows, counts);
}

export async function fetchDiscoverGroups(userId: string, limit = 20): Promise<Group[]> {
  const { data: myRows } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);
  const excludeIds = (myRows ?? []).map(r => r.group_id);

  let query = supabase
    .from('groups')
    .select('*')
    .eq('privacy', 'public')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const counts = await fetchMemberCounts(rows.map(g => g.id));
  return withCounts(rows, counts);
}

export type CreateGroupInput = {
  name: string;
  description: string;
  imageUrl?: string | null;
  location?: string | null;
  skill: string;
  privacy: GroupPrivacy;
  allowInvites: boolean;
  allowPosts: boolean;
};

export async function createGroup(input: CreateGroupInput, userId: string): Promise<Group> {
  const { data: convo, error: convoError } = await supabase
    .from('conversations')
    .insert({
      conversation_type: 'group',
      title: input.name,
      created_by: userId,
    })
    .select('id')
    .single();
  if (convoError || !convo) throw convoError ?? new Error('Failed to create group conversation');

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: input.name,
      description: input.description,
      image_url: input.imageUrl ?? null,
      location: input.location ?? null,
      skill: input.skill,
      privacy: input.privacy,
      allow_invites: input.allowInvites,
      allow_posts: input.allowPosts,
      organizer_id: userId,
      conversation_id: convo.id,
    })
    .select('*')
    .single();
  if (groupError || !group) throw groupError ?? new Error('Failed to create group');

  await Promise.all([
    supabase.from('group_members').insert({ group_id: group.id, user_id: userId, role: 'owner', status: 'active' }),
    supabase.from('conversation_participants').upsert(
      { conversation_id: convo.id, user_id: userId, role: 'owner' },
      { onConflict: 'conversation_id,user_id' },
    ),
  ]);

  return { ...group, memberCount: 1 };
}

export type UpdateGroupInput = Partial<CreateGroupInput>;

export async function updateGroup(id: string, patch: UpdateGroupInput): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.skill !== undefined ? { skill: patch.skill } : {}),
      ...(patch.privacy !== undefined ? { privacy: patch.privacy } : {}),
      ...(patch.allowInvites !== undefined ? { allow_invites: patch.allowInvites } : {}),
      ...(patch.allowPosts !== undefined ? { allow_posts: patch.allowPosts } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) throw error;
}

// ─── Membership ───────────────────────────────────────────────────────────────

export type Membership = { role: GroupRole; status: 'active' | 'pending' } | null;

export async function getMembership(groupId: string, userId: string): Promise<Membership> {
  const { data } = await supabase
    .from('group_members')
    .select('role, status')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  return data as Membership;
}

// Public/secret groups join immediately; private groups create a pending
// request an admin must approve.
export async function joinGroup(groupId: string, userId: string): Promise<'active' | 'pending'> {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('privacy, conversation_id')
    .eq('id', groupId)
    .single();
  if (groupError || !group) throw groupError ?? new Error('Group not found');

  const status = group.privacy === 'private' ? 'pending' : 'active';

  const { error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, user_id: userId, role: 'member', status },
      { onConflict: 'group_id,user_id' },
    );
  if (error) throw error;

  if (status === 'active' && group.conversation_id) {
    await supabase.from('conversation_participants').upsert(
      { conversation_id: group.conversation_id, user_id: userId, role: 'member' },
      { onConflict: 'conversation_id,user_id' },
    );
  }

  return status;
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const { data: group } = await supabase
    .from('groups')
    .select('conversation_id')
    .eq('id', groupId)
    .maybeSingle();

  await Promise.all([
    supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId),
    group?.conversation_id
      ? supabase.from('conversation_participants').delete()
          .eq('conversation_id', group.conversation_id).eq('user_id', userId)
      : Promise.resolve(),
  ]);
}

export async function approveJoinRequest(groupId: string, userId: string): Promise<void> {
  const { data: group } = await supabase
    .from('groups')
    .select('conversation_id')
    .eq('id', groupId)
    .maybeSingle();

  await supabase
    .from('group_members')
    .update({ status: 'active' })
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (group?.conversation_id) {
    await supabase.from('conversation_participants').upsert(
      { conversation_id: group.conversation_id, user_id: userId, role: 'member' },
      { onConflict: 'conversation_id,user_id' },
    );
  }
}

export async function declineJoinRequest(groupId: string, userId: string): Promise<void> {
  await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
}

export async function setMemberRole(groupId: string, userId: string, role: GroupRole): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .update({ role })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await leaveGroup(groupId, userId);
}

export async function fetchMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      user_id, role, status, joined_at,
      profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url, dupr, self_rating, location_city)
    `)
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  return (data ?? []).map(row => {
    const p = row.profile as unknown as {
      full_name: string | null; avatar_url: string | null;
      dupr: number | null; self_rating: string | null; location_city: string | null;
    } | null;
    return {
      userId: row.user_id,
      name: p?.full_name ?? 'Player',
      avatarUrl: p?.avatar_url ?? null,
      dupr: p?.dupr ?? null,
      selfRating: p?.self_rating ?? null,
      locationCity: p?.location_city ?? null,
      role: row.role as GroupRole,
      status: row.status as 'active' | 'pending',
      joinedAt: row.joined_at,
    };
  });
}

// ─── Events (real play_events, linked via group_id) ───────────────────────────

export async function fetchGroupEvents(groupId: string): Promise<Tables<'play_events'>[]> {
  const { data, error } = await supabase
    .from('play_events')
    .select('*')
    .eq('group_id', groupId)
    .order('event_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Feed: posts + polls + synthetic event cards ──────────────────────────────

async function hydratePosts(posts: GroupPost[], userId: string): Promise<GroupPostWithMeta[]> {
  if (posts.length === 0) return [];
  const postIds = posts.map(p => p.id);
  const authorIds = [...new Set(posts.map(p => p.author_id))];

  const [profilesRes, likesRes, commentsRes, optionsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url').in('id', authorIds),
    supabase.from('group_post_likes').select('post_id, user_id').in('post_id', postIds),
    supabase.from('group_post_comments').select('post_id').in('post_id', postIds),
    supabase.from('group_poll_options').select('*').in('post_id', postIds).order('position', { ascending: true }),
  ]);

  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p]));
  const likesByPost = new Map<string, { count: number; likedByMe: boolean }>();
  for (const row of likesRes.data ?? []) {
    const cur = likesByPost.get(row.post_id) ?? { count: 0, likedByMe: false };
    cur.count += 1;
    if (row.user_id === userId) cur.likedByMe = true;
    likesByPost.set(row.post_id, cur);
  }
  const commentCountByPost = new Map<string, number>();
  for (const row of commentsRes.data ?? []) {
    commentCountByPost.set(row.post_id, (commentCountByPost.get(row.post_id) ?? 0) + 1);
  }
  const optionIds = (optionsRes.data ?? []).map(o => o.id);
  const votesRes = optionIds.length
    ? await supabase.from('group_poll_votes').select('option_id, user_id').in('option_id', optionIds)
    : { data: [] as { option_id: string; user_id: string }[] };
  const votesByOption = new Map<string, { count: number; votedByMe: boolean }>();
  for (const row of votesRes.data ?? []) {
    const cur = votesByOption.get(row.option_id) ?? { count: 0, votedByMe: false };
    cur.count += 1;
    if (row.user_id === userId) cur.votedByMe = true;
    votesByOption.set(row.option_id, cur);
  }
  const optionsByPost = new Map<string, GroupPollOption[]>();
  for (const opt of optionsRes.data ?? []) {
    const list = optionsByPost.get(opt.post_id) ?? [];
    list.push(opt);
    optionsByPost.set(opt.post_id, list);
  }

  return posts.map(post => {
    const author = profileMap.get(post.author_id);
    const likes = likesByPost.get(post.id) ?? { count: 0, likedByMe: false };
    return {
      ...post,
      author: {
        id: post.author_id,
        full_name: author?.full_name ?? 'Player',
        avatar_url: author?.avatar_url ?? null,
      },
      likeCount: likes.count,
      likedByMe: likes.likedByMe,
      commentCount: commentCountByPost.get(post.id) ?? 0,
      pollOptions: (optionsByPost.get(post.id) ?? []).map(o => {
        const v = votesByOption.get(o.id) ?? { count: 0, votedByMe: false };
        return { ...o, voteCount: v.count, votedByMe: v.votedByMe };
      }),
    };
  });
}

export async function fetchGroupFeed(groupId: string, userId: string, limit = 30): Promise<GroupFeedItem[]> {
  const [postsRes, eventsRes] = await Promise.all([
    supabase.from('group_posts').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('play_events').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(10),
  ]);
  if (postsRes.error) throw postsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const hydrated = await hydratePosts(postsRes.data ?? [], userId);
  const items: GroupFeedItem[] = [
    ...hydrated.map((post): GroupFeedItem => ({ kind: 'post', post })),
    ...(eventsRes.data ?? []).map((event): GroupFeedItem => ({ kind: 'event', event })),
  ];

  return items.sort((a, b) => {
    const at = new Date(a.kind === 'post' ? a.post.created_at : a.event.created_at).getTime();
    const bt = new Date(b.kind === 'post' ? b.post.created_at : b.event.created_at).getTime();
    return bt - at;
  });
}

export async function createPost(groupId: string, authorId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('group_posts')
    .insert({ group_id: groupId, author_id: authorId, kind: 'post', body: body.trim() });
  if (error) throw error;
}

// Shares a photo to both the Feed and the Photos tab in one action. The
// group_photos row is linked to the new post via post_id (cascade delete),
// so deleting the feed post also removes it from the Photos tab — unlike a
// direct upload via the Photos tab's own button, which stays independent.
export async function createPhotoPost(
  groupId: string, authorId: string, localUri: string, caption?: string,
): Promise<void> {
  const url = await uploadGroupPhotoFile(groupId, authorId, localUri);

  const { data: post, error: postError } = await supabase
    .from('group_posts')
    .insert({ group_id: groupId, author_id: authorId, kind: 'post', body: caption?.trim() || null, image_url: url })
    .select('id')
    .single();
  if (postError || !post) throw postError ?? new Error('Failed to create photo post');

  const { error: photoError } = await supabase
    .from('group_photos')
    .insert({ group_id: groupId, uploaded_by: authorId, url, post_id: post.id });
  if (photoError) throw photoError;
}

export async function createPoll(
  groupId: string,
  authorId: string,
  question: string,
  options: string[],
): Promise<void> {
  const { data: post, error } = await supabase
    .from('group_posts')
    .insert({ group_id: groupId, author_id: authorId, kind: 'poll', body: question.trim() })
    .select('id')
    .single();
  if (error || !post) throw error ?? new Error('Failed to create poll');

  const rows = options.filter(o => o.trim()).map((label, i) => ({ post_id: post.id, label: label.trim(), position: i }));
  if (rows.length > 0) {
    const { error: optError } = await supabase.from('group_poll_options').insert(rows);
    if (optError) throw optError;
  }
}

export async function toggleLike(postId: string, userId: string, currentlyLiked: boolean): Promise<void> {
  if (currentlyLiked) {
    await supabase.from('group_post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  } else {
    await supabase.from('group_post_likes').upsert(
      { post_id: postId, user_id: userId },
      { onConflict: 'post_id,user_id' },
    );
  }
}

export type GroupComment = Tables<'group_post_comments'> & {
  author: { full_name: string; avatar_url: string | null };
};

export async function fetchComments(postId: string): Promise<GroupComment[]> {
  const { data, error } = await supabase
    .from('group_post_comments')
    .select('*, author:profiles!group_post_comments_author_id_fkey(full_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as GroupComment[];
}

export async function addComment(
  postId: string, authorId: string, body: string, parentCommentId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('group_post_comments')
    .insert({ post_id: postId, author_id: authorId, body: body.trim(), parent_comment_id: parentCommentId ?? null });
  if (error) throw error;
}

export async function updatePost(postId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('group_posts')
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('group_posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function updateComment(commentId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('group_post_comments')
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('group_post_comments').delete().eq('id', commentId);
  if (error) throw error;
}

// ─── Reports (Feed moderation) ─────────────────────────────────────────────────

export type ReportReason = Database['public']['Enums']['report_reason'];
export type ReportTargetType = 'group_post' | 'group_comment';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam_or_inappropriate', label: 'Spam or inappropriate' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Other' },
];

export async function reportContent(input: {
  reporterId: string;
  groupId: string;
  targetType: ReportTargetType;
  targetId: string;
  reportedUserId: string;
  reason: ReportReason;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.from('group_post_reports').insert({
    reporter_id: input.reporterId,
    group_id: input.groupId,
    target_type: input.targetType,
    target_id: input.targetId,
    reported_user_id: input.reportedUserId,
    reason: input.reason,
    notes: input.notes?.trim() || null,
  });
  if (error) {
    // Unique constraint — already reported this piece of content.
    if (error.code === '23505') throw new Error('You already reported this.');
    throw error;
  }
}

// Single-choice poll: clears any prior vote by this user on the post's other
// options before inserting the new one.
export async function votePoll(postId: string, optionId: string, userId: string): Promise<void> {
  const { data: options } = await supabase
    .from('group_poll_options')
    .select('id')
    .eq('post_id', postId);
  const optionIds = (options ?? []).map(o => o.id);
  if (optionIds.length > 0) {
    await supabase.from('group_poll_votes').delete().eq('user_id', userId).in('option_id', optionIds);
  }
  const { error } = await supabase.from('group_poll_votes').insert({ option_id: optionId, user_id: userId });
  if (error) throw error;
}

// ─── Photos ───────────────────────────────────────────────────────────────────

export async function fetchGroupPhotos(groupId: string): Promise<GroupPhoto[]> {
  const { data, error } = await supabase
    .from('group_photos')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// React Native cannot fetch file:// URIs into a blob — use FormData, same
// pattern as uploadPlayEventCover in lib/supabase/playEvents.ts.
async function uploadGroupPhotoFile(groupId: string, userId: string, localUri: string): Promise<string> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const path = `${groupId}/${userId}-${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri: localUri, name: `upload.${ext}`, type: mimeType } as unknown as Blob);

  const { error: uploadError } = await supabase.storage
    .from('group-photos')
    .upload(path, formData, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('group-photos').getPublicUrl(path);
  return data.publicUrl;
}

// Direct upload via the Photos tab's own "Add Photo" button — not linked to
// any post, so it survives regardless of feed activity.
export async function uploadGroupPhoto(groupId: string, userId: string, localUri: string): Promise<string> {
  const url = await uploadGroupPhotoFile(groupId, userId, localUri);

  const { error: insertError } = await supabase
    .from('group_photos')
    .insert({ group_id: groupId, uploaded_by: userId, url });
  if (insertError) throw insertError;

  return url;
}

export async function deleteGroupPhoto(photoId: string): Promise<void> {
  const { error } = await supabase.from('group_photos').delete().eq('id', photoId);
  if (error) throw error;
}

// ─── Group banner upload (used by create/edit screens) ────────────────────────

export async function uploadGroupBanner(userId: string, localUri: string): Promise<string> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const path = `banners/${userId}-${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri: localUri, name: `upload.${ext}`, type: mimeType } as unknown as Blob);

  const { error } = await supabase.storage
    .from('group-photos')
    .upload(path, formData, { contentType: mimeType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('group-photos').getPublicUrl(path);
  return data.publicUrl;
}
