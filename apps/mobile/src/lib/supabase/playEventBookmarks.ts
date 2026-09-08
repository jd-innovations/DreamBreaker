import { supabase } from '@/lib/supabase';

// Mirrors tournamentBookmarks.ts — same shape, different table — for saving
// Community Play events (play_events) rather than tournaments.

export async function fetchBookmarkedPlayEventIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('saved_play_events')
    .select('play_event_id')
    .eq('player_id', userId);
  return new Set((data ?? []).map(row => row.play_event_id));
}

export async function addPlayEventBookmark(userId: string, playEventId: string): Promise<void> {
  await supabase
    .from('saved_play_events')
    .insert({ player_id: userId, play_event_id: playEventId });
}

export async function removePlayEventBookmark(userId: string, playEventId: string): Promise<void> {
  await supabase
    .from('saved_play_events')
    .delete()
    .eq('player_id', userId)
    .eq('play_event_id', playEventId);
}

export type BookmarkedPlayEvent = {
  id: string;
  name: string;
  event_date: string;
  venue_name: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  status: string;
};

export async function fetchBookmarkedPlayEvents(userId: string): Promise<BookmarkedPlayEvent[]> {
  const { data } = await supabase
    .from('saved_play_events')
    .select('play_event:play_events!play_event_id(id, name, event_date, venue_name, location, city, state, status)')
    .eq('player_id', userId)
    .order('created_at', { ascending: false });

  return (data ?? [])
    .map(row => row.play_event as unknown as BookmarkedPlayEvent | null)
    .filter((e): e is BookmarkedPlayEvent => e != null);
}
