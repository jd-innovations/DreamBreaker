import { supabase } from '@/lib/supabase';
import { MATCH_SELECT, withGuestNames, type BracketMatchRow } from '@/lib/supabase/brackets';
import type { LeaderboardMatch } from '@shared/leaderboard';
import type { TeamPerson } from '@shared/teamNames';

// A tournament's matches in the shape packages/shared/src/leaderboard.ts reads,
// grouped by division. Pool and elimination matches both: the leaderboard
// counts records across both stages.

function side(
  a: BracketMatchRow['p1a'], b: BracketMatchRow['p1b'],
  ga: BracketMatchRow['g1a'], gb: BracketMatchRow['g1b'],
  gaId: string | null, gbId: string | null,
): { members: string[]; name: string | null; people: TeamPerson[] } {
  // Raw guest ids first: a team stays one team even if its names didn't load.
  const members = [a?.id ?? gaId ?? ga?.id, b?.id ?? gbId ?? gb?.id].filter((x): x is string => !!x);
  const names = [a?.full_name ?? ga?.display_name, b?.full_name ?? gb?.display_name].filter(Boolean);
  // Each present player, in order, for display (teamNames.ts); guests are flagged
  // so they are never shortened.
  const one = (p: BracketMatchRow['p1a'], g: BracketMatchRow['g1a']): TeamPerson[] =>
    p?.full_name ? [{ name: p.full_name }] : g?.display_name ? [{ name: g.display_name, guest: true }] : [];
  return { members, name: names.length ? names.join(' / ') : null, people: [...one(a, ga), ...one(b, gb)] };
}

export async function fetchLeaderboardMatches(tournamentId: string): Promise<Map<string, LeaderboardMatch[]>> {
  const { data, error } = await supabase
    .from('bracket_matches')
    .select(MATCH_SELECT)
    .eq('tournament_id', tournamentId);
  if (error) throw error;

  const byDivision = new Map<string, LeaderboardMatch[]>();
  for (const r of await withGuestNames((data ?? []) as unknown as BracketMatchRow[], tournamentId)) {
    if (!r.division_id) continue;
    const t1 = side(r.p1a, r.p1b, r.g1a, r.g1b, r.team1_guest_a, r.team1_guest_b);
    const t2 = side(r.p2a, r.p2b, r.g2a, r.g2b, r.team2_guest_a, r.team2_guest_b);
    const list = byDivision.get(r.division_id) ?? [];
    list.push({
      id: r.id,
      round: r.round,
      poolLabel: r.pool_label,
      matchNumber: r.match_number,
      team1: t1.members,
      team2: t2.members,
      team1Name: t1.name,
      team2Name: t2.name,
      team1People: t1.people,
      team2People: t2.people,
      score1: r.score_team1?.[0] ?? null,
      score2: r.score_team2?.[0] ?? null,
      winner: r.winner === 1 || r.winner === 2 ? r.winner : null,
      completed: !!r.completed_at,
      court: r.court,
    });
    byDivision.set(r.division_id, list);
  }
  return byDivision;
}
