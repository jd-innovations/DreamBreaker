// Live brackets and leaderboard for the web (DIRECTOR_HUB_WEB_PARITY.md, W1b).
// Read-only, for anyone who can see the tournament: the public page and the
// director page use the same data. Guest names come from
// tournament_guest_names (the guests table itself is creator-only), and the
// leaderboard rules are packages/shared/src/leaderboard.ts, shared with mobile.

import { createClient } from "@/lib/supabase/client";
import type { LeaderboardMatch } from "@shared/leaderboard";
import type { TeamPerson } from "@shared/teamNames";
import { openingRoundSeeds } from "@shared/bracketBuild";
import { parsePrevScore } from "@/lib/tournament/score-corrections";

type Person = { id: string; full_name: string | null } | null;

export interface LiveBracketMatch extends LeaderboardMatch {
  divisionId: string;
  completedAt: string | null;
  editedAt: string | null;
  /** The score before the latest correction, public like editedAt. */
  prevScore: { s1: number; s2: number } | null;
  /** Bracket seed of each side (from its first-round slot); null in pools or when unknown. */
  seed1: number | null;
  seed2: number | null;
  /** Every game's score, in order (one game today; more if multi-game scores are stored). */
  games1: number[];
  games2: number[];
}

export interface LiveDivision {
  id: string;
  name: string;
  /** Pool play: how many teams per pool go through to the bracket. */
  advancePerPool: number;
  playStatus: "not_started" | "live" | "paused";
  matches: LiveBracketMatch[];
}

const SELECT = `
  id, division_id, round, pool_label, match_number, court, winner, completed_at, score_team1, score_team2, score_edited_at, score_edited_prev,
  team1_guest_a, team1_guest_b, team2_guest_a, team2_guest_b,
  p1a:profiles!bracket_matches_team1_player_a_fkey(id,full_name),
  p1b:profiles!bracket_matches_team1_player_b_fkey(id,full_name),
  p2a:profiles!bracket_matches_team2_player_a_fkey(id,full_name),
  p2b:profiles!bracket_matches_team2_player_b_fkey(id,full_name)
`;

export async function fetchLiveBrackets(tournamentId: string): Promise<LiveDivision[]> {
  const supabase = createClient();
  const [dRes, mRes, gRes] = await Promise.all([
    supabase.from("divisions").select("id, name, advance_per_pool, play_status").eq("tournament_id", tournamentId).order("created_at", { ascending: true }),
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
    // Each present player, in order; a guest whose name didn't load is "Player".
    const people: TeamPerson[] = [
      ...(a ? [{ name: a.full_name ?? "Player" }] : ga ? [{ name: guest.get(ga) ?? "Player", guest: true }] : []),
      ...(b ? [{ name: b.full_name ?? "Player" }] : gb ? [{ name: guest.get(gb) ?? "Player", guest: true }] : []),
    ];
    return {
      members,
      people,
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
      team1People: t1.people,
      team2People: t2.people,
      score1: r.score_team1?.[0] ?? null,
      score2: r.score_team2?.[0] ?? null,
      winner: r.winner === 1 || r.winner === 2 ? r.winner : null,
      completed: !!r.completed_at,
      completedAt: r.completed_at,
      court: r.court,
      editedAt: r.score_edited_at,
      prevScore: parsePrevScore(r.score_edited_prev),
      seed1: null,
      seed2: null,
      games1: r.score_team1 ?? [],
      games2: r.score_team2 ?? [],
    });
    byDivision.set(r.division_id, list);
  }

  return (dRes.data ?? [])
    .filter((d) => byDivision.has(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      advancePerPool: d.advance_per_pool ?? 2,
      playStatus: (d.play_status === "live" || d.play_status === "paused" ? d.play_status : "not_started") as LiveDivision["playStatus"],
      matches: withSeeds(byDivision.get(d.id)!),
    }));
}

const ELIM_ORDER = ["pool", "r64", "r32", "r16", "qf", "sf", "final"];

/** Seeds from the opening round (packages/shared openingRoundSeeds), carried to later rounds by team. */
export function withSeeds(matches: LiveBracketMatch[]): LiveBracketMatch[] {
  const elim = matches.filter((m) => !m.poolLabel && m.round !== "bronze");
  const first = ELIM_ORDER.find((r) => elim.some((m) => m.round === r));
  if (!first) return matches;
  const opening = elim.filter((m) => m.round === first).sort((a, b) => a.matchNumber - b.matchNumber);
  const seedByTeam = openingRoundSeeds(opening.map((m) => ({
    team1: m.team1.length ? m.team1.join("|") : null,
    team2: m.team2.length ? m.team2.join("|") : null,
  })));
  if (!seedByTeam) return matches;
  return matches.map((m) => m.poolLabel ? m : {
    ...m,
    seed1: m.team1.length ? seedByTeam.get(m.team1.join("|")) ?? null : null,
    seed2: m.team2.length ? seedByTeam.get(m.team2.join("|")) ?? null : null,
  });
}

export interface BracketContext {
  courts: string[];
  autoAssign: boolean;
  /** match id -> 1-based court queue position; empty for signed-out visitors. */
  queue: Map<string, number>;
}

/** Courts and the court queue, for the courts strip and UP NEXT / ON DECK. */
export async function fetchBracketContext(tournamentId: string): Promise<BracketContext> {
  const supabase = createClient();
  const [tRes, qRes] = await Promise.all([
    supabase.from("tournaments").select("courts, auto_assign_courts").eq("id", tournamentId).maybeSingle(),
    supabase.rpc("court_queue", { p_tournament_id: tournamentId }),
  ]);
  return {
    courts: tRes.data?.courts ?? [],
    autoAssign: tRes.data?.auto_assign_courts ?? true,
    // Additive: the queue is only readable when signed in.
    queue: new Map((qRes.error ? [] : qRes.data ?? []).map((q) => [q.match_id, q.queue_position])),
  };
}

const THIRD_PLACE_ERRORS: Record<string, string> = {
  not_allowed: "Only this tournament’s director or an admin can change the bracket.",
  already_exists: "This bracket already has a 3rd-place match.",
  no_semifinals: "This bracket has no semifinals yet.",
  semifinal_walkover: "A semifinal was a walkover, so there is no second team to play for 3rd.",
};

/** Adds a 3rd-place match to an existing bracket, keeping every score (add_third_place_match). */
export async function addThirdPlaceMatch(tournamentId: string, divisionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createClient().rpc("add_third_place_match", {
    p_tournament_id: tournamentId, p_division_id: divisionId,
  });
  if (!error) return { ok: true };
  const code = Object.keys(THIRD_PLACE_ERRORS).find((k) => error.message?.includes(k));
  return { ok: false, error: code ? THIRD_PLACE_ERRORS[code] : "Could not add the 3rd-place match. Please try again." };
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
