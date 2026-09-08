import { supabase } from '@/lib/supabase';

// Public stats for a tournament director, shown on the tournament detail
// screen. Comes from a SECURITY DEFINER RPC rather than a client-side count:
// registrations is RLS-protected so only the tournament's own director (or an
// admin) can read those rows, and counting from the client would return the
// real figure to the director and 0 to every other viewer.

export type DirectorStats = {
  playersServed: number;
  /** Tournaments whose date has passed and were neither cancelled nor draft. */
  tournamentsHosted: number;
};

export async function fetchDirectorStats(directorId: string): Promise<DirectorStats | null> {
  const { data, error } = await supabase
    .rpc('director_public_stats', { p_director_id: directorId })
    .maybeSingle();

  // Null rather than zeroes: the strip hides itself when there is nothing to
  // show, and a failed fetch must not be indistinguishable from a director who
  // genuinely has no history.
  if (error || !data) return null;

  const row = data as { players_served: number | null; tournaments_hosted: number | null };
  return {
    playersServed:     Number(row.players_served ?? 0),
    tournamentsHosted: Number(row.tournaments_hosted ?? 0),
  };
}
