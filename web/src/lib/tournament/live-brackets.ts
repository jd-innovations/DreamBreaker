// Live brackets and leaderboard for the web (DIRECTOR_HUB_WEB_PARITY.md, W1b).
// Read-only, for anyone who can see the tournament: the public page and the
// director page use the same data. Guest names come from
// tournament_guest_names (the guests table itself is creator-only), and the
// leaderboard rules are packages/shared/src/leaderboard.ts, shared with mobile.

import { createClient } from "@/lib/supabase/client";
import type { LeaderboardMatch } from "@shared/leaderboard";

type Person = { id: string; full_name: string | null } | null;

export interface LiveBracketMatch extends LeaderboardMatch {
  divisionId: string;
  completedAt: string | null;
  editedAt: string | null;
}

export interface LiveDivision {
  id: string;
  name: string;
  matches: LiveBracketMatch[];
}

const SELECT = `
  id, division_id, round, pool_label, match_number, court, winner, completed_at, score_team1, score_team2, score_edited_at,
  team1_guest_a, team1_guest_b, team2_guest_a, team2_guest_b,
  p1a:profiles!bracket_matches_team1_player_a_fkey(id,full_name),
  p1b:profiles!bracket_matches_team1_player_b_fkey(id,full_name),
  p2a:profiles!bracket_matches_team2_player_a_fkey(id,full_name),
  p2b:profiles!bracket_matches_team2_player_b_fkey(id,full_name)
`;

export async function fetchLiveBrackets(tournamentId: string): Promise<LiveDivision[]> {
  const supabase = createClient();
  const [dRes, mRes, gRes] = await Promise.all([
    supabase.from("divisions").select("id, name").eq("tournament_id", tournamentId).order("created_at", { ascending: true }),
    supabase.from("bracket_matches").select(SELECT).eq("tournament_id", tournamentId),
    supabase.rpc("tournament_guest_names", { p_tournament_id: tournamentId }),
  ]);
  if (dRes.error) throw dRes.error;
  if (mRes.error) throw mRes.error;
  const guest = new Map((gRes.data ?? []).map((g) => [g.guest_id, g.display_name]));

  const side = (a: Person, b: Person, ga: string | null, gb: string | null) => {
    const members = [a?.id ?? ga, b?.id ?? gb].filter((x): x is string => !!x);
    const names = [a?.full_name ?? (ga ? guest.get(ga) : null), b?.full_name ?? (gb ? guest.get(gb) : null)];
    const named = names.filter(Boolean);
    return {
      members,
      name: members.length ? (named.length ? named.join(" / ") : "Player") : null,
    };
  };

  const byDivision = new Map<string, LiveBracketMatch[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (mRes.data ?? []) as any[]) {
    if (!r.division_id) continue;
    const t1 = side(r.p1a, r.p1b, r.team1_guest_a, r.team1_guest_b);
    const t2 = side(r.p2a, r.p2b, r.team2_guest_a, r.team2_guest_b);
    const list = byDivision.get(r.division_id) ?? [];
    list.push({
      id: r.id,
      divisionId: r.division_id,
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
      completedAt: r.completed_at,
      court: r.court,
      editedAt: r.score_edited_at,
    });
    byDivision.set(r.division_id, list);
  }

  return (dRes.data ?? [])
    .filter((d) => byDivision.has(d.id))
    .map((d) => ({ id: d.id, name: d.name, matches: byDivision.get(d.id)! }));
}

/** Live updates for the public page: this tournament's matches changing. */
export function subscribeLiveBrackets(tournamentId: string, onChange: () => void): () => void {
  const supabase = createClient();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const channel = supabase
    .channel(`live-brackets:${tournamentId}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "bracket_matches", filter: `tournament_id=eq.${tournamentId}` }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, 400);
    })
    .subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
