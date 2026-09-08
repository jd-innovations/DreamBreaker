import { supabase } from '@/lib/supabase';

// Mirrors web/src/components/shared/bookmark-button.tsx — same table, same
// semantics, so a tournament saved from either app shows up in both.

export async function fetchBookmarkedTournamentIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('tournament_bookmarks')
    .select('tournament_id')
    .eq('player_id', userId);
  return new Set((data ?? []).map(row => row.tournament_id));
}

export async function isTournamentBookmarked(userId: string, tournamentId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tournament_bookmarks')
    .select('id')
    .eq('player_id', userId)
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  return !!data;
}

export async function addTournamentBookmark(userId: string, tournamentId: string): Promise<void> {
  await supabase
    .from('tournament_bookmarks')
    .insert({ player_id: userId, tournament_id: tournamentId });
}

export async function removeTournamentBookmark(userId: string, tournamentId: string): Promise<void> {
  await supabase
    .from('tournament_bookmarks')
    .delete()
    .eq('player_id', userId)
    .eq('tournament_id', tournamentId);
}

export type BookmarkedTournament = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  event_date: string | null;
  entry_fee_cents: number | null;
  venue_name: string | null;
};

export async function fetchBookmarkedTournaments(userId: string): Promise<BookmarkedTournament[]> {
  const { data } = await supabase
    .from('tournament_bookmarks')
    .select('tournament:tournaments!tournament_id(id, name, city, state, event_date, entry_fee_cents, venue_name)')
    .eq('player_id', userId)
    .order('created_at', { ascending: false });

  return (data ?? [])
    .map(row => row.tournament as unknown as BookmarkedTournament | null)
    .filter((t): t is BookmarkedTournament => t != null);
}
