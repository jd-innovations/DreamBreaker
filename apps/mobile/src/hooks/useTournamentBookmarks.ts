import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import {
  fetchBookmarkedTournamentIds,
  addTournamentBookmark,
  removeTournamentBookmark,
} from '@/lib/supabase/tournamentBookmarks';

// Shared bookmarked-tournament-ids state — same `tournament_bookmarks` table
// the web app's BookmarkButton uses, so saves are consistent across surfaces.
export function useTournamentBookmarks() {
  const { user } = useSession();
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) { setBookmarkedIds(new Set()); return; }
    fetchBookmarkedTournamentIds(user.id).then(setBookmarkedIds);
  }, [user?.id]);

  const isBookmarked = useCallback((tournamentId: string) => bookmarkedIds.has(tournamentId), [bookmarkedIds]);

  const toggleBookmark = useCallback(async (tournamentId: string) => {
    if (!user?.id) return;
    const wasBookmarked = bookmarkedIds.has(tournamentId);

    setBookmarkedIds(prev => {
      const next = new Set(prev);
      wasBookmarked ? next.delete(tournamentId) : next.add(tournamentId);
      return next;
    });

    try {
      if (wasBookmarked) {
        await removeTournamentBookmark(user.id, tournamentId);
      } else {
        await addTournamentBookmark(user.id, tournamentId);
      }
    } catch {
      // Roll back optimistic update on failure.
      setBookmarkedIds(prev => {
        const next = new Set(prev);
        wasBookmarked ? next.add(tournamentId) : next.delete(tournamentId);
        return next;
      });
    }
  }, [user?.id, bookmarkedIds]);

  return { bookmarkedIds, isBookmarked, toggleBookmark };
}
