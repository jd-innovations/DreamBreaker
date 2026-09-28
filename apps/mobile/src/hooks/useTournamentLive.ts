import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Calls `onChange` (debounced) whenever this tournament's match data changes,
 * e.g. a score is entered, a court assigned, a bracket or pools built, on any
 * device. Optionally also on registration changes (check-in, walk-ins).
 *
 * Both tables are in the supabase_realtime publication. Realtime applies the
 * same RLS as a normal read: directors see their own tournaments, and anyone
 * sees matches of a published tournament ("bracket_matches: public read").
 *
 * The debounce matters because one score save is several row writes (the
 * score, the winner advancing, the court auto-assigned).
 */
export function useTournamentLive(
  tournamentId: string | null | undefined,
  onChange: () => void,
  options: { registrations?: boolean; debounceMs?: number } = {},
): void {
  const { registrations = false, debounceMs = 400 } = options;
  // Latest callback without resubscribing on every render.
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!tournamentId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), debounceMs);
    };

    let channel = supabase
      .channel(`tournament-live:${tournamentId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bracket_matches', filter: `tournament_id=eq.${tournamentId}` },
        fire,
      );
    if (registrations) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registrations', filter: `tournament_id=eq.${tournamentId}` },
        fire,
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tournamentId, registrations, debounceMs]);
}
