import { supabase } from '@/lib/supabase';
import { MATCH_SELECT, type BracketMatchRow } from '@/lib/supabase/brackets';
import type { LeaderboardMatch } from '@shared/leaderboard';

// A tournament's matches in the shape packages/shared/src/leaderboard.ts reads,
// grouped by division. Pool and elimination matches both: the leaderboard
// counts records across both stages.

function side(
  a: BracketMatchRow['p1a'], b: BracketMatchRow['p1b'],
  ga: BracketMatchRow['g1a'], gb: BracketMatchRow['g1b'],
): { members: string[]; name: string | null } {
  const members = [a?.id ?? ga?.id, b?.id ?? gb?.id].filter((x): x is string => !!x);
  const names = [a?.full_name ?? ga?.display_name, b?.full_name ?? gb?.display_name].filter(Boolean);
  return { members, name: names.length ? names.join(' / ') : null };
}

export async function fetchLeaderboardMatches(tournamentId: string): Promise<Map<string, LeaderboardMatch[]>> {
  const { data, error } = await supabase
    .from('bracket_matches')
    .select(MATCH_SELECT)
    .eq('tournament_id', tournamentId);
  if (error) throw error;

  const byDivision = new Map<string, LeaderboardMatch[]>();
  for (const r of (data ?? []) as unknown as BracketMatchRow[]) {
    if (!r.division_id) continue;
    const t1 = side(r.p1a, r.p1b, r.g1a, r.g1b);
    const t2 = side(r.p2a, r.p2b, r.g2a, r.g2b);
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
