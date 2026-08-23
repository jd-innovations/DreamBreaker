import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { fetchTournamentDirectorId } from '@/lib/supabase/tournaments';

// Why a director may not manage a tournament, when they may not.
export type DirectorDenyReason = 'not_director' | 'not_approved';

// Can the current user manage this tournament? Gates every director surface
// (workspace, command center, check-in, brackets, results, report, edit)
// client-side; RLS is the real enforcement.
//
// This mirrors both halves of the server-side check, because the policies use
// both. "divisions: director manage own", "bracket_matches: director manage
// own" and "tournaments: director update own" are all
//
//   director_id = auth.uid() AND is_approved_director()
//
// and is_approved_director() is
//
//   profiles.(role = 'director' OR is_director) AND director_status = 'approved'
//
// Owning the tournament is therefore not sufficient. A director whose approval
// lapsed or was suspended still satisfies director_id = auth.uid(), so a guard
// checking only ownership would mount the full command center for them and then
// let every write fail at the database — which reads as a broken app rather
// than a permissions problem. `canManage` is the flag guards should use;
// `isDirector` is kept separate so callers can tell "not yours" apart from
// "yours, but your director approval is not active".
//
// Both stay false while loading so a guard never flashes a director screen
// before the answer arrives. Callers that need to distinguish "no" from "not
// yet" read `loading`.
export function useTournamentDirector(tournamentId: string | null | undefined) {
  const { user, profile, loading: profileLoading } = useProfile();
  const [directorId, setDirectorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (profileLoading) return;
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
  }, [user?.id, tournamentId, profileLoading]);

  useEffect(() => { refresh(); }, [refresh]);

  const resolving = loading || profileLoading;

  const isDirector = !resolving && !!user?.id && directorId === user.id;

  // Mirrors is_approved_director(). `role` and `is_director` are OR'd server
  // side, so accept either here too.
  const isApprovedDirector =
    !resolving &&
    (profile?.role === 'director' || profile?.is_director === true) &&
    profile?.director_status === 'approved';

  const canManage = isDirector && isApprovedDirector;

  const denyReason: DirectorDenyReason | null = resolving || canManage
    ? null
    : isDirector
      ? 'not_approved'
      : 'not_director';

  return {
    directorId,
    loading: resolving,
    isDirector,
    isApprovedDirector,
    canManage,
    denyReason,
    refresh,
  };
}
