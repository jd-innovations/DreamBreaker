import { supabase } from '@/lib/supabase';

// My Matches history for results the player didn't log themselves: Quick Games
// (play_events open_play, games in play_matches) and tournaments
// (bracket_matches). One entry per event with the viewer's own record, so they
// sit beside Log a Session sessions in one list. Read-only; everything here is
// readable by the viewer under existing RLS.

// par_rating_events isn't in the generated types (see lib/supabase/par.ts).
type DbClient = typeof supabase & { from: (table: string) => any };
const db = supabase as DbClient;

export type EventHistoryKind = 'quick_game' | 'tournament';

export type EventHistoryItem = {
  kind: EventHistoryKind;
  id: string;
  title: string;
  // yyyy-mm-dd, the event's own date. Used for display and ordering.
  date: string;
  location: string | null;
  games: number;
  record: { wins: number; losses: number };
  finished: boolean;
  // Sum of the viewer's active PAR changes for this event; null when none.
  parChange: number | null;
};

type Side = 1 | 2;

function tally(results: { side: Side; winner: number | null }[]) {
  let wins = 0;
  let losses = 0;
  for (const r of results) {
    if (r.winner === r.side) wins += 1;
    else if (r.winner === 1 || r.winner === 2) losses += 1;
  }
  return { wins, losses };
}

async function fetchQuickGameHistory(userId: string): Promise<EventHistoryItem[]> {
  const { data: mine, error: mineErr } = await supabase
    .from('play_participants')
    .select('id, event_id')
    .eq('claimed_by', userId);
  if (mineErr) throw mineErr;
  const myIds = (mine ?? []).map((p) => p.id);
  if (myIds.length === 0) return [];

  const list = myIds.join(',');
  const { data: matches, error: matchErr } = await supabase
    .from('play_matches')
    .select('id, event_id, player_a_id, player_a2_id, player_b_id, player_b2_id, winner')
    .not('winner', 'is', null)
    .or(`player_a_id.in.(${list}),player_a2_id.in.(${list}),player_b_id.in.(${list}),player_b2_id.in.(${list})`);
  if (matchErr) throw matchErr;
  if (!matches?.length) return [];

  const myIdSet = new Set(myIds);
  const eventIds = Array.from(new Set(matches.map((m) => m.event_id)));
  const [eventsRes, parRes] = await Promise.all([
    supabase
      .from('play_events')
      .select('id, name, event_type, event_date, status, venue_name, location')
      .in('id', eventIds)
      .eq('event_type', 'open_play'),
    db
      .from('par_rating_events')
      .select('session_id, par_change')
      .eq('profile_id', userId)
      .eq('event_type', 'game_processed')
      .is('reversed_at', null)
      .in('session_id', eventIds),
  ]);
  if (eventsRes.error) throw eventsRes.error;

  // PAR is additive: without it the row still shows the result, just no change.
  const parByEvent = new Map<string, number>();
  if (parRes.error) {
    console.warn('[eventHistory] PAR changes unavailable:', parRes.error.message);
  } else {
    for (const row of (parRes.data ?? []) as { session_id: string; par_change: number }[]) {
      parByEvent.set(row.session_id, (parByEvent.get(row.session_id) ?? 0) + Number(row.par_change));
    }
  }

  return (eventsRes.data ?? []).map((event) => {
    const results = matches
      .filter((m) => m.event_id === event.id)
      .map((m) => ({
        side: (myIdSet.has(m.player_a_id ?? '') || myIdSet.has(m.player_a2_id ?? '') ? 1 : 2) as Side,
        winner: m.winner,
      }));
    return {
      kind: 'quick_game' as const,
      id: event.id,
      title: event.name,
      date: event.event_date,
      location: event.venue_name ?? event.location ?? null,
      games: results.length,
      record: tally(results),
      finished: event.status === 'completed',
      parChange: parByEvent.has(event.id) ? parByEvent.get(event.id)! : null,
    };
  });
}

async function fetchTournamentHistory(userId: string): Promise<EventHistoryItem[]> {
  const { data: matches, error: matchErr } = await supabase
    .from('bracket_matches')
    .select('id, tournament_id, team1_player_a, team1_player_b, winner')
    .not('completed_at', 'is', null)
    .not('winner', 'is', null)
    .or(`team1_player_a.eq.${userId},team1_player_b.eq.${userId},team2_player_a.eq.${userId},team2_player_b.eq.${userId}`);
  if (matchErr) throw matchErr;
  if (!matches?.length) return [];

  const tournamentIds = Array.from(new Set(matches.map((m) => m.tournament_id)));
  const { data: tournaments, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, event_date, status, venue_name, city')
    .in('id', tournamentIds);
  if (tErr) throw tErr;

  return (tournaments ?? []).map((t) => {
    const results = matches
      .filter((m) => m.tournament_id === t.id)
      .map((m) => ({
        side: (m.team1_player_a === userId || m.team1_player_b === userId ? 1 : 2) as Side,
        winner: m.winner,
      }));
    return {
      kind: 'tournament' as const,
      id: t.id,
      title: t.name,
      date: t.event_date,
      location: t.venue_name ?? t.city ?? null,
      games: results.length,
      record: tally(results),
      finished: t.status === 'completed',
      // Tournaments don't feed PAR yet (Quick Games first, owner 2026-09-28).
      parChange: null,
    };
  });
}

export async function fetchEventHistory(userId: string): Promise<EventHistoryItem[]> {
  const [quick, tournaments] = await Promise.all([
    fetchQuickGameHistory(userId),
    fetchTournamentHistory(userId),
  ]);
  return [...quick, ...tournaments];
}
