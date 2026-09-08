import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import {
  fetchBookmarkedPlayEventIds,
  addPlayEventBookmark,
  removePlayEventBookmark,
} from '@/lib/supabase/playEventBookmarks';

// Mirrors useTournamentBookmarks.ts for Community Play events.
export function usePlayEventBookmarks() {
  const { user } = useSession();
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) { setBookmarkedIds(new Set()); return; }
    fetchBookmarkedPlayEventIds(user.id).then(setBookmarkedIds);
  }, [user?.id]);

  const isBookmarked = useCallback((playEventId: string) => bookmarkedIds.has(playEventId), [bookmarkedIds]);

  const toggleBookmark = useCallback(async (playEventId: string) => {
    if (!user?.id) return;
    const wasBookmarked = bookmarkedIds.has(playEventId);

    setBookmarkedIds(prev => {
      const next = new Set(prev);
      wasBookmarked ? next.delete(playEventId) : next.add(playEventId);
      return next;
    });

    try {
      if (wasBookmarked) {
        await removePlayEventBookmark(user.id, playEventId);
      } else {
        await addPlayEventBookmark(user.id, playEventId);
      }
    } catch {
      setBookmarkedIds(prev => {
        const next = new Set(prev);
        wasBookmarked ? next.add(playEventId) : next.delete(playEventId);
        return next;
      });
    }
  }, [user?.id, bookmarkedIds]);

  return { bookmarkedIds, isBookmarked, toggleBookmark };
}
