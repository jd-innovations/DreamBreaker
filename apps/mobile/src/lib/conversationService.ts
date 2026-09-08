import { supabase } from './supabase';

export type ConversationPartnerProfile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

export type ConversationSummary = {
  id: string;
  kind: 'direct' | 'group';
  // Set for kind: 'direct'.
  partner: ConversationPartnerProfile | null;
  // Set for kind: 'group' — event/tournament name, from conversations.title.
  groupTitle: string | null;
  relatedPlayEventId: string | null;
  relatedTournamentId: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  unread_count: number;
  muted_until: string | null;
  archived_at: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getOrCreateConversation(myId: string, partnerId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_a.eq.${myId},participant_b.eq.${partnerId}),` +
      `and(participant_a.eq.${partnerId},participant_b.eq.${myId})`
    )
    .maybeSingle();

  if (existing) return existing.id;

  const { data: createdId, error } = await (supabase as any).rpc(
    'get_or_create_direct_conversation',
    { p_partner_id: partnerId },
  );

  if (error || !createdId) throw new Error(error?.message ?? 'Failed to create conversation');
  return String(createdId);
}

export async function fetchConversations(
  userId: string,
  options?: { mode?: 'primary' | 'archived' },
): Promise<ConversationSummary[]> {
  const mode = options?.mode ?? 'primary';
  // Direct (1:1) conversations still use participant_a/participant_b.
  const directQuery = supabase
    .from('conversations')
    .select(`
      id,
      participant_a,
      participant_b,
      last_message_at,
      created_at,
      profile_a:profiles!conversations_participant_a_fkey(id, full_name, avatar_url),
      profile_b:profiles!conversations_participant_b_fkey(id, full_name, avatar_url)
    `)
    .or(`participant_a.eq.${userId},participant_b.eq.${userId}`);

  // Group/contextual conversations (Community Play, tournaments) use
  // conversation_participants membership instead of participant_a/b, which
  // are null for these rows — a separate query is required to surface them.
  const groupQuery = supabase
    .from('conversation_participants')
    .select(`
      conversation:conversations!inner(
        id, title, conversation_type, related_play_event_id, related_tournament_id,
        last_message_at, created_at
      )
    `)
    .eq('user_id', userId)
    .neq('conversation.conversation_type', 'direct');

  const [{ data: directConvos, error: directError }, { data: groupRows, error: groupError }] =
    await Promise.all([directQuery, groupQuery]);

  if (directError) throw new Error(directError.message);
  if (groupError) throw new Error(groupError.message);

  const groupConvos = (groupRows ?? [])
    .map((r) => r.conversation as unknown as {
      id: string; title: string | null; conversation_type: string;
      related_play_event_id: string | null; related_tournament_id: string | null;
      last_message_at: string | null; created_at: string;
    })
    .filter(Boolean);

  const allIds = [...(directConvos ?? []).map((c) => c.id), ...groupConvos.map((c) => c.id)];
  if (allIds.length === 0) return [];

  const [{ data: unreadRows }, { data: previewRows }, { data: settingsRows }] = await Promise.all([
    supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', allIds)
      .neq('sender_id', userId)
      .is('read_at', null),
    supabase
      .from('messages')
      .select('conversation_id, body, attachment_type, created_at')
      .in('conversation_id', allIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('conversation_participant_settings')
      .select('conversation_id, muted_until, hidden_at, archived_at')
      .eq('user_id', userId)
      .in('conversation_id', allIds),
  ]);

  const settingsByConvo: Record<string, { muted_until: string | null; hidden_at: string | null; archived_at: string | null }> = {};
  for (const row of settingsRows ?? []) {
    settingsByConvo[row.conversation_id] = { muted_until: row.muted_until, hidden_at: row.hidden_at, archived_at: row.archived_at };
  }
  const hiddenIds = new Set(
    Object.entries(settingsByConvo)
      .filter(([, v]) => v.hidden_at)
      .map(([id]) => id),
  );
  const archivedIds = new Set(
    Object.entries(settingsByConvo)
      .filter(([, v]) => v.archived_at)
      .map(([id]) => id),
  );

  const unreadByConvo: Record<string, number> = {};
  for (const row of unreadRows ?? []) {
    unreadByConvo[row.conversation_id] = (unreadByConvo[row.conversation_id] ?? 0) + 1;
  }

  // First occurrence per conversation_id = latest message (rows ordered desc)
  const previewByConvo: Record<string, string> = {};
  for (const row of previewRows ?? []) {
    if (!(row.conversation_id in previewByConvo)) {
      previewByConvo[row.conversation_id] = row.body ?? (row.attachment_type === 'image' ? '📷 Photo' : '');
    }
  }

  const directSummaries: ConversationSummary[] = (directConvos ?? []).map((c) => {
    const rawPartner =
      c.participant_a === userId
        ? (c.profile_b as unknown as ConversationPartnerProfile | null)
        : (c.profile_a as unknown as ConversationPartnerProfile | null);

    // Guard against a missing/deleted partner profile so the chat list never crashes.
    const partner: ConversationPartnerProfile = rawPartner ?? {
      id: (c.participant_a === userId ? c.participant_b : c.participant_a) ?? c.id,
      full_name: 'Unknown',
      avatar_url: null,
    };

    return {
      id: c.id,
      kind: 'direct',
      partner,
      groupTitle: null,
      relatedPlayEventId: null,
      relatedTournamentId: null,
      last_message_at: c.last_message_at,
      last_message_preview: previewByConvo[c.id] ?? null,
      created_at: c.created_at,
      unread_count: unreadByConvo[c.id] ?? 0,
      muted_until: settingsByConvo[c.id]?.muted_until ?? null,
      archived_at: settingsByConvo[c.id]?.archived_at ?? null,
    };
  });

  const groupSummaries: ConversationSummary[] = groupConvos.map((c) => ({
    id: c.id,
    kind: 'group',
    partner: null,
    groupTitle: c.title ?? (c.conversation_type === 'tournament' ? 'Tournament Chat' : 'Community Play Chat'),
    relatedPlayEventId: c.related_play_event_id,
    relatedTournamentId: c.related_tournament_id,
    last_message_at: c.last_message_at,
    last_message_preview: previewByConvo[c.id] ?? null,
    created_at: c.created_at,
    unread_count: unreadByConvo[c.id] ?? 0,
    muted_until: settingsByConvo[c.id]?.muted_until ?? null,
    archived_at: settingsByConvo[c.id]?.archived_at ?? null,
  }));

  return [...directSummaries, ...groupSummaries]
    .filter((c) => !hiddenIds.has(c.id))
    .filter((c) => (mode === 'archived' ? archivedIds.has(c.id) : !archivedIds.has(c.id)))
    .sort((a, b) => {
      const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bt - at;
    });
}

// Mutes future badge/unread noise for this conversation without affecting the
// other participant(s). `durationMs` omitted mutes indefinitely (far-future date).
export async function muteConversation(
  conversationId: string,
  userId: string,
  durationMs?: number,
): Promise<void> {
  const mutedUntil = new Date(Date.now() + (durationMs ?? 100 * 365 * 86_400_000)).toISOString();
  const { error } = await supabase
    .from('conversation_participant_settings')
    .upsert(
      { conversation_id: conversationId, user_id: userId, muted_until: mutedUntil },
      { onConflict: 'conversation_id,user_id' },
    );
  if (error) throw new Error(error.message);
}

export async function unmuteConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_participant_settings')
    .upsert(
      { conversation_id: conversationId, user_id: userId, muted_until: null },
      { onConflict: 'conversation_id,user_id' },
    );
  if (error) throw new Error(error.message);
}

// Moves the thread out of Primary into the Archived tab — recoverable, unlike
// hideConversation. Does not auto-resurface on a new message and is excluded
// from the unread badge count while archived (same treatment as muted).
export async function archiveConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_participant_settings')
    .upsert(
      { conversation_id: conversationId, user_id: userId, archived_at: new Date().toISOString() },
      { onConflict: 'conversation_id,user_id' },
    );
  if (error) throw new Error(error.message);
}

export async function unarchiveConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_participant_settings')
    .upsert(
      { conversation_id: conversationId, user_id: userId, archived_at: null },
      { onConflict: 'conversation_id,user_id' },
    );
  if (error) throw new Error(error.message);
}

// Removes the thread from this user's own inbox only — the shared
// conversations/messages rows are untouched, so other participants still see it.
export async function hideConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_participant_settings')
    .upsert(
      { conversation_id: conversationId, user_id: userId, hidden_at: new Date().toISOString() },
      { onConflict: 'conversation_id,user_id' },
    );
  if (error) throw new Error(error.message);
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, attachment_url, attachment_type, attachment_name, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  attachment?: { url: string; type: string; name?: string | null },
): Promise<Message> {
  const trimmed = body.trim();
  if (!trimmed && !attachment) throw new Error('Message body cannot be empty');

  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: trimmed || null,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_name: attachment?.name ?? null,
    })
    .select('id, conversation_id, sender_id, body, attachment_url, attachment_type, attachment_name, read_at, created_at')
    .single();

  if (!message) throw new Error(insertError?.message ?? 'Failed to send message');

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  return message;
}

// Uploads a locally-captured/picked photo or arbitrary file to the
// message-attachments bucket and returns its public URL. Path is keyed by
// conversation_id so the storage RLS insert policy can gate on
// is_conversation_participant(). fileName/mimeType come from the picker
// result (expo-image-picker's asset.mimeType, or expo-document-picker's
// asset.mimeType/name for non-image files) rather than being guessed from
// the local cache URI, which has no reliable extension for arbitrary files.
export async function uploadMessageAttachment(
  conversationId: string,
  senderId: string,
  localUri: string,
  opts?: { fileName?: string | null; mimeType?: string },
): Promise<string> {
  const nameForExt = opts?.fileName ?? localUri;
  const ext = nameForExt.split('.').pop()?.toLowerCase() ?? 'bin';
  const mimeType = opts?.mimeType ?? (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
  const path = `${conversationId}/${senderId}-${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri: localUri, name: opts?.fileName ?? `upload.${ext}`, type: mimeType } as unknown as Blob);

  const { error: uploadError } = await supabase.storage
    .from('message-attachments')
    .upload(path, formData, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('message-attachments').getPublicUrl(path);
  return data.publicUrl;
}

// Live-appends new messages posted to a conversation. Mirrors the
// .channel(...).on('postgres_changes', ...) pattern in useUnreadCounts.ts.
// RLS on `messages` already scopes rows to conversations the caller can see,
// so filtering by conversation_id here is just a targeting optimization, not
// a security boundary. Returns an unsubscribe function for cleanup.
export function subscribeToConversation(
  conversationId: string,
  onMessage: (msg: Message) => void,
): () => void {
  const channelId = Math.random().toString(36).slice(2);
  const channel = supabase
    .channel(`conversation:${conversationId}:${channelId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(payload.new as Message),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// Requires a "messages: participant update read_at" RLS policy to take effect.
// Without it this call succeeds but updates 0 rows (silent no-op).
export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null);
}

async function joinConversationIfNeeded(conversationId: string, userId: string): Promise<void> {
  await supabase
    .from('conversation_participants')
    .upsert(
      { conversation_id: conversationId, user_id: userId, role: 'member' },
      { onConflict: 'conversation_id,user_id' },
    );
}

// Small helper for surfacing "chat has unread activity" on event cards —
// returns the set of play_event ids (not conversation ids) that currently
// have an unread message for this user, so callers can key off event.id.
export async function fetchUnreadPlayEventIds(userId: string): Promise<Set<string>> {
  const { data: rows } = await supabase
    .from('conversation_participants')
    .select('conversation:conversations!inner(id, related_play_event_id)')
    .eq('user_id', userId)
    .eq('conversation.conversation_type', 'play_event');

  const convos = (rows ?? [])
    .map((r) => r.conversation as unknown as { id: string; related_play_event_id: string | null })
    .filter((c) => c?.related_play_event_id);

  if (convos.length === 0) return new Set();

  const { data: unreadRows } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', convos.map((c) => c.id))
    .neq('sender_id', userId)
    .is('read_at', null);

  const unreadConvoIds = new Set((unreadRows ?? []).map((r) => r.conversation_id));
  const result = new Set<string>();
  for (const c of convos) {
    if (unreadConvoIds.has(c.id) && c.related_play_event_id) result.add(c.related_play_event_id);
  }
  return result;
}

export async function getOrCreatePlayEventConversation(
  eventId: string,
  userId: string,
): Promise<string> {
  const { data: conversationId, error } = await (supabase as any).rpc(
    'get_or_create_play_event_conversation',
    { p_event_id: eventId },
  );

  if (error || !conversationId) {
    throw new Error(error?.message ?? 'Failed to create play event conversation');
  }

  return String(conversationId);
}
export async function getOrCreateTournamentConversation(
  tournamentId: string,
  userId: string,
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('conversations')
    .select('id')
    .eq('conversation_type', 'tournament')
    .eq('related_tournament_id', tournamentId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) {
    await joinConversationIfNeeded(existing.id, userId);
    return existing.id;
  }

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name')
    .eq('id', tournamentId)
    .maybeSingle();

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({
      conversation_type: 'tournament',
      related_tournament_id: tournamentId,
      title: tournament?.name ?? 'Tournament Chat',
      created_by: userId,
    })
    .select('id')
    .single();

  if (!created) {
    const { data: raced } = await supabase
      .from('conversations')
      .select('id')
      .eq('conversation_type', 'tournament')
      .eq('related_tournament_id', tournamentId)
      .maybeSingle();
    if (raced) {
      await joinConversationIfNeeded(raced.id, userId);
      return raced.id;
    }
    throw new Error(createError?.message ?? 'Failed to create tournament conversation');
  }

  await joinConversationIfNeeded(created.id, userId);
  return created.id;
}