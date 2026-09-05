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
  const [error, setError] = useState<string | null>(null);

  // Which tournamentId the current answer belongs to, or null while unresolved.
  //
  // Needed because useProfile() runs its own useFocusEffect that force-
  // refetches the profile on every screen focus — foregrounding the app,
  // navigating back to a director screen, anything like that — which flips
  // `profileLoading` on every one of those, every time, for every screen using
  // this hook. `refresh` used to run unconditionally whenever that happened,
  // which flashed every DirectorOnly-wrapped screen (command center included)
  // back to "Checking permissions…" over an already-loaded screen on every
  // focus. `resolvedFor` lets a refocus that already has its answer be a
  // no-op instead of a real re-check.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);

  // `profileLoading` is deliberately NOT checked in here any more. It used to
  // early-return while the profile was still loading, which left `loading` at
  // its initial `true` and depended on this callback being re-created and the
  // effect re-firing once the profile settled. When that did not happen the
  // guard sat on "Checking permissions…" forever — profile ready, tournament
  // loading, and no request ever sent. Waiting is now the effect's job, so
  // there is no path that leaves `loading` true without starting a fetch.
  const refresh = useCallback(async (force = false) => {
    if (!force && tournamentId != null && resolvedFor === tournamentId) return;
    if (!user?.id || !tournamentId) {
      setDirectorId(null);
      setLoading(false);
      setResolvedFor(tournamentId ?? null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDirectorId(await fetchTournamentDirectorId(tournamentId));
      setResolvedFor(tournamentId);
    } catch (e) {
      // Without this the throw fell through to canManage === false, and the
      // guard read a FAILED check as "not the director" and redirected. A
      // failure to answer is not a denial.
      //
      // `resolvedFor` deliberately NOT set here: an unresolved failure stays
      // eligible to retry on the next natural focus, rather than being
      // permanently treated as answered until someone taps Retry.
      console.error('[useTournamentDirector] permission check failed:', e);
      setDirectorId(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user?.id, tournamentId, resolvedFor]);

  // Run once the profile is settled, and run again if it settles later.
  useEffect(() => {
    if (profileLoading) return;
    void refresh();
  }, [refresh, profileLoading]);

  const resolving = loading || profileLoading;

  const isDirector = !resolving && !!user?.id && directorId === user.id;

  // Mirrors is_approved_director(). `role` and `is_director` are OR'd server
  // side, so accept either here too.
  const isApprovedDirector =
    !resolving &&
    (profile?.role === 'director' || profile?.is_director === true) &&
    profile?.director_status === 'approved';

  const canManage = isDirector && isApprovedDirector;

  const denyReason: DirectorDenyReason | null = resolving || canManage || error
    ? null
    : isDirector
      ? 'not_approved'
      : 'not_director';

  return {
    directorId,
    loading: resolving,
    // The two halves of `resolving`, exposed so a stuck guard can say WHICH
    // one never settled instead of spinning anonymously.
    profileLoading,
    directorLoading: loading,
    /** The check FAILED (timeout, network). Not the same as a denial. */
    error,
    isDirector,
    isApprovedDirector,
    canManage,
    denyReason,
    refresh,
  };
}
