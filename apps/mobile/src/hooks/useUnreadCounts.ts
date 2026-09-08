import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

// Live unread counters for the header bell (notifications) and chat icon
// (direct messages). RLS on both tables scopes which rows a client can see,
// so a table-wide realtime subscription only ever delivers rows the signed-in
// user is allowed to read — no need to filter messages by conversation here.
export function useUnreadCounts() {
  const { user } = useSession();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setUnreadMessages(0);
      setUnreadNotifications(0);
      return;
    }
    const userId = user.id;
    let cancelled = false;
    let mutedConvoIds = new Set<string>();

    async function loadCounts() {
      const [{ data: mutedRows }, { data: archivedRows }] = await Promise.all([
        supabase
          .from('conversation_participant_settings')
          .select('conversation_id')
          .eq('user_id', userId)
          .gt('muted_until', new Date().toISOString()),
        supabase
          .from('conversation_participant_settings')
          .select('conversation_id')
          .eq('user_id', userId)
          .not('archived_at', 'is', null),
      ]);
      // Archived threads are excluded from the badge the same way muted ones
      // are — folded into the same exclusion set since both suppress the
      // count identically, just for different reasons.
      mutedConvoIds = new Set([
        ...(mutedRows ?? []).map((r) => r.conversation_id),
        ...(archivedRows ?? []).map((r) => r.conversation_id),
      ]);

      let msgQuery = supabase
        .from('messages')
        .select('id, conversation_id', { count: 'exact', head: true })
        .neq('sender_id', userId)
        .is('read_at', null);
      if (mutedConvoIds.size > 0) {
        msgQuery = msgQuery.not('conversation_id', 'in', `(${[...mutedConvoIds].join(',')})`);
      }

      const [{ count: msgCount }, { count: notifCount }] = await Promise.all([
        msgQuery,
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('read_at', null),
      ]);
      if (cancelled) return;
      setUnreadMessages(msgCount ?? 0);
      setUnreadNotifications(notifCount ?? 0);
    }
    loadCounts();

    // Suffixed so concurrent mounts (header + home screen both use this hook)
    // never collide on a cached channel object mid-subscribe.
    const channelId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`unread-counts:${userId}:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as { conversation_id: string; sender_id: string; read_at: string | null };
        if (row.sender_id !== userId && row.read_at == null && !mutedConvoIds.has(row.conversation_id)) {
          setUnreadMessages((n) => n + 1);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const oldRow = payload.old as { read_at: string | null };
        const newRow = payload.new as { sender_id: string; read_at: string | null };
        if (newRow.sender_id !== userId && oldRow.read_at == null && newRow.read_at != null) {
          setUnreadMessages((n) => Math.max(0, n - 1));
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => setUnreadNotifications((n) => n + 1),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const oldRow = payload.old as { read_at: string | null };
          const newRow = payload.new as { read_at: string | null };
          if (oldRow.read_at == null && newRow.read_at != null) {
            setUnreadNotifications((n) => Math.max(0, n - 1));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { unreadMessages, unreadNotifications };
}
