// Records that this user has the app open, for win-back notifications.
//
// Why not auth.users.last_sign_in_at: Supabase sessions persist and refresh
// silently, so someone who opens the app every day may not sign in for months.
// Judging activity by that would send "the courts miss you" to the most
// engaged players — the exact opposite of the intent. This writes a stamp the
// app controls (profiles.last_active_at, 20260923).
//
// Cheap by construction: the RPC writes at most once an hour per user, and the
// in-memory guard here stops repeat calls inside one launch from reaching the
// network at all. The value backs a 14-day comparison, so nothing finer is
// worth a round trip.

import { supabase } from '@/lib/supabase';

const MIN_GAP_MS = 60 * 60 * 1000;

let lastTouchedUserId: string | null = null;
let lastTouchedAt = 0;

/**
 * Best effort and never awaited by callers: a failure here costs one stale
 * activity stamp, and must never delay or break auth, which is what the
 * session store is actually for.
 */
export function touchLastActive(userId: string | null | undefined): void {
  if (!userId) return;

  const now = Date.now();
  if (userId === lastTouchedUserId && now - lastTouchedAt < MIN_GAP_MS) return;

  lastTouchedUserId = userId;
  lastTouchedAt = now;

  void supabase.rpc('touch_last_active').then(({ error }) => {
    if (error && __DEV__) console.warn('[activity] touch_last_active failed', error.message);
  });
}
