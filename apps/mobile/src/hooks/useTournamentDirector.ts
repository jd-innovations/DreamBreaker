import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { fetchTournamentDirectorId } from '@/lib/supabase/tournaments';

// Is the current user the director of this tournament? Gates every director
// surface (workspace, command center, check-in, brackets, results, report,
// edit) client-side; RLS is the real enforcement — the "registrations:
// director read/update own tournament" policies and check_in_registration()
// all re-check director_id = auth.uid() server-side. This hook only drives
// what the UI shows and which routes will mount.
//
// `isDirector` stays false while loading so a guard never flashes a director
// screen to a non-director before the answer arrives. Callers that need to
// distinguish "no" from "not yet" read `loading`.
export function useTournamentDirector(tournamentId: string | null | undefined) {
  const { user, loading: sessionLoading } = useSession();
  const [directorId, setDirectorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (sessionLoading) return;
    if (!user?.id || !tournamentId) {
      setDirectorId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDirectorId(await fetchTournamentDirectorId(tournamentId));
    } finally {
      setLoading(false);
    }
  }, [user?.id, tournamentId, sessionLoading]);

  useEffect(() => { refresh(); }, [refresh]);

  return {
    directorId,
    loading: loading || sessionLoading,
    isDirector: !loading && !sessionLoading && !!user?.id && directorId === user.id,
    refresh,
  };
}
