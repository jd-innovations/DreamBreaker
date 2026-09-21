import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

/**
 * How many players the signed-in user is connected to — the number behind
 * Home's "Connections" tile and the "N players connected" subtitle on
 * app/match/connections.tsx.
 *
 * A connection is one `partner_matches` row naming the user on either side,
 * which is the same definition fetchMatches() uses on that screen.
 *
 * Counted with `head: true`, so Postgres returns the number and no rows. The
 * tile needs a total, not people — pulling the profiles it would take to
 * render them would be wasted on a screen that only prints a digit.
 *
 * Refreshed on focus rather than over realtime: connections change when the
 * user accepts a request, which means leaving this screen and coming back.
 * A subscription would add a socket for an event that cannot happen while
 * anyone is looking at it.
 */
export function useConnectionCount(): number {
  const { user } = useSession();
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) { setCount(0); return; }
      let cancelled = false;

      supabase
        .from('partner_matches')
        .select('id', { count: 'exact', head: true })
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .then(({ count: n, error }) => {
          // A failed count leaves the previous value rather than flashing 0 —
          // "0 connections" is a claim, and a dropped request is not evidence
          // for it.
          if (!cancelled && !error) setCount(n ?? 0);
        });

      return () => { cancelled = true; };
    }, [user?.id]),
  );

  return count;
}
