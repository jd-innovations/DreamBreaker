import { supabase } from './supabase';

export type MessageReaction = { message_id: string; user_id: string; emoji: string };

export async function fetchReactions(messageIds: string[]): Promise<MessageReaction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', messageIds);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: userId, emoji });
  // Re-reacting with an emoji you already picked hits the (message_id, user_id, emoji)
  // primary key — ignore that specific conflict rather than surfacing an error.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) throw new Error(error.message);
}

// message_reactions has no conversation_id column (reactions belong to a
// message, not a conversation directly), so Realtime can't filter server-side
// by conversation. Subscribes unfiltered and lets the caller decide which
// rows are relevant (e.g. only messages currently loaded on screen) — same
// tradeoff already accepted elsewhere in this codebase for similar cases.
export function subscribeToReactions(
  onInsert: (row: MessageReaction) => void,
  onDelete: (row: MessageReaction) => void,
): () => void {
  const channelId = Math.random().toString(36).slice(2);
  const channel = supabase
    .channel(`message-reactions:${channelId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_reactions' },
      (payload) => onInsert(payload.new as MessageReaction),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'message_reactions' },
      (payload) => onDelete(payload.old as MessageReaction),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
