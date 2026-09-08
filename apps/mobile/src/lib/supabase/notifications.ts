import { supabase } from '@/lib/supabase';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function dbRowToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id:        String(row.id),
    type:      String(row.type ?? ''),
    title:     String(row.title ?? ''),
    body:      row.body != null ? String(row.body) : null,
    link:      row.link != null ? String(row.link) : null,
    readAt:    row.read_at != null ? String(row.read_at) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,link,read_at,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    console.warn('fetchNotifications failed', error);
    return [];
  }
  return data.map(dbRowToNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn('markNotificationRead failed', error);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) console.warn('markAllNotificationsRead failed', error);
}

// For notifications inserted with a stable idempotency_key (see
// notify_play_event_invite / notify_group_invite), so accepting or declining
// an invite from the Received tab can also clear its duplicate row in the
// generic Activity feed, instead of leaving it — and its unread badge —
// stuck until the user opens it there directly.
export async function markNotificationReadByKey(idempotencyKey: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('idempotency_key', idempotencyKey)
    .is('read_at', null);
  if (error) console.warn('markNotificationReadByKey failed', error);
}
