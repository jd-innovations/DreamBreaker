// Minimal wrapper around the existing public.blocked_users table. No screen in
// the app reads this table yet (no blocked-content filtering elsewhere) — this
// only provides the insert Marketplace's "Block User" action needs; wiring
// blocked-user filtering into chat/discovery is a separate, larger change.
import { supabase } from '@/lib/supabase';

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (error) throw error;
}
