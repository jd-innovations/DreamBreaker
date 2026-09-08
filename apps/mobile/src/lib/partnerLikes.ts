import { supabase } from '@/lib/supabase';

// Sends a Partner Finder "like" outside the swipe flow (e.g. the Groups
// Members tab Connect button). Mirrors the upsert used by finder.tsx's
// persistLike — same table/kind, so a match here is indistinguishable from
// a match made by swiping.
export async function sendPartnerLike(fromUserId: string, toUserId: string): Promise<{ matched: boolean }> {
  const { error } = await supabase
    .from('partner_likes')
    .upsert({ from_user_id: fromUserId, to_user_id: toUserId, kind: 'like' });
  if (error) throw error;

  const a = fromUserId < toUserId ? fromUserId : toUserId;
  const b = fromUserId < toUserId ? toUserId : fromUserId;
  const { data } = await supabase
    .from('partner_matches')
    .select('id')
    .eq('user_a', a)
    .eq('user_b', b)
    .maybeSingle();

  return { matched: !!data };
}

export async function hasSentPartnerLike(fromUserId: string, toUserId: string): Promise<boolean> {
  const { data } = await supabase
    .from('partner_likes')
    .select('id')
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', toUserId)
    .eq('kind', 'like')
    .maybeSingle();
  return !!data;
}

export async function isPartnerMatch(userIdA: string, userIdB: string): Promise<boolean> {
  const a = userIdA < userIdB ? userIdA : userIdB;
  const b = userIdA < userIdB ? userIdB : userIdA;
  const { data } = await supabase
    .from('partner_matches')
    .select('id')
    .eq('user_a', a)
    .eq('user_b', b)
    .maybeSingle();
  return !!data;
}
