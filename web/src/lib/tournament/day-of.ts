// Web Day Of (director Command Center) on live data: DIRECTOR_HUB_WEB_PARITY.md,
// W1. Every read and write here uses the same tables, functions and rules as
// mobile, so a director can switch devices mid-event and both stay in step:
//   courts        tournaments.courts            set_tournament_courts()
//   queue         court_queue()                 (live divisions only)
//   assign court  bracket_matches.court         one live match per court (23505)
//   score         record_match_score()          score + advance, atomically
//   play status   divisions.play_status         not_started | live | paused
//   auto-assign   tournaments.auto_assign_courts set_tournament_auto_assign_courts()
//   brackets      bracket_matches               packages/shared/src/bracketBuild.ts
// The database's court automation fills free courts on its own when a match
// finishes or a division goes live; nothing here re-derives the queue order.

import { createClient } from "@/lib/supabase/client";
import { parsePrevScore } from "@/lib/tournament/score-corrections";
import {
  activeTeamEntries, buildBracketMatchRows, seededSlots,
  type BracketTeam,
} from "@shared/bracketBuild";

export type DivisionPlayStatus = "not_started" | "live" | "paused";

export interface DayOfDivision {
  id: string;
  name: string;
  playStatus: DivisionPlayStatus;
}

export interface LiveMatch {
  id: string;
  divisionId: string | null;
  round: string;
  matchNumber: number;
  poolLabel: string | null;
  court: string | null;
  winner: number | null;
  completedAt: string | null;
  score1: number | null;
  score2: number | null;
  team1: string | null;
  team2: string | null;
  editedAt: string | null;
  prevScore: { s1: number; s2: number } | null;
}

export interface DayOfState {
  courts: string[];
  autoAssign: boolean;
  divisions: DayOfDivision[];
  matches: LiveMatch[];
  /** match id -> 1-based position in the court queue. */
  queue: Map<string, number>;
}

type Named = { full_name?: string | null; display_name?: string | null } | null;

const MATCH_SELECT = `
  id, division_id, match_number, round, court, pool_label, winner, completed_at, score_team1, score_team2, score_edited_at, score_edited_prev,
  p1a:profiles!bracket_matches_team1_player_a_fkey(full_name),
  p1b:profiles!bracket_matches_team1_player_b_fkey(full_name),
  p2a:profiles!bracket_matches_team2_player_a_fkey(full_name),
  p2b:profiles!bracket_matches_team2_player_b_fkey(full_name),
  g1a:personal_guest_players!bracket_matches_team1_guest_a_fkey(display_name),
  g1b:personal_guest_players!bracket_matches_team1_guest_b_fkey(display_name),
  g2a:personal_guest_players!bracket_matches_team2_guest_a_fkey(display_name),
  g2b:personal_guest_players!bracket_matches_team2_guest_b_fkey(display_name)
`;

function teamName(a: Named, b: Named, ga: Named, gb: Named): string | null {
  const first = a?.full_name ?? ga?.display_name ?? null;
  const second = b?.full_name ?? gb?.display_name ?? null;
  if (!first && !second) return null;
  return [first ?? "TBD", second].filter(Boolean).join(" / ");
}

/** Round label for people: "Quarterfinals", "Pool A", "Round of 16". */
export function roundName(round: string, poolLabel: string | null): string {
  if (poolLabel) return `Pool ${poolLabel}`;
  switch (round) {
    case "final": return "Final";
    case "sf": return "Semifinals";
    case "qf": return "Quarterfinals";
    case "r16": return "Round of 16";
    case "r32": return "Round of 32";
    case "r64": return "Round of 64";
    case "bronze": return "3rd Place";
    default: return "Early round";
  }
}

export async function fetchDayOf(tournamentId: string): Promise<DayOfState> {
  const supabase = createClient();
  const [tRes, dRes, mRes, qRes] = await Promise.all([
    supabase.from("tournaments").select("courts, auto_assign_courts").eq("id", tournamentId).single(),
    supabase.from("divisions").select("id, name, play_status").eq("tournament_id", tournamentId).order("created_at", { ascending: true }),
    supabase.from("bracket_matches").select(MATCH_SELECT).eq("tournament_id", tournamentId),
    supabase.rpc("court_queue", { p_tournament_id: tournamentId }),
  ]);
  if (tRes.error) throw tRes.error;
  if (dRes.error) throw dRes.error;
  if (mRes.error) throw mRes.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (mRes.data ?? []) as any[];
  return {
    courts: tRes.data?.courts ?? [],
    autoAssign: tRes.data?.auto_assign_courts ?? true,
    divisions: (dRes.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      playStatus: (d.play_status === "live" || d.play_status === "paused" ? d.play_status : "not_started") as DivisionPlayStatus,
    })),
    matches: rows.map((r) => ({
      id: r.id,
      divisionId: r.division_id,
      round: r.round,
      matchNumber: r.match_number,
      poolLabel: r.pool_label,
      court: r.court,
      winner: r.winner,
      completedAt: r.completed_at,
      score1: r.score_team1?.[0] ?? null,
      score2: r.score_team2?.[0] ?? null,
      team1: teamName(r.p1a, r.p1b, r.g1a, r.g1b),
      team2: teamName(r.p2a, r.p2b, r.g2a, r.g2b),
      editedAt: r.score_edited_at,
      prevScore: parsePrevScore(r.score_edited_prev),
    })),
    // The queue is additive: without it the courts and scores still work.
    queue: new Map((qRes.error ? [] : qRes.data ?? []).map((q) => [q.match_id, q.queue_position])),
  };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type Result = { ok: true } | { ok: false; error: string };

/** Assigns a court by name, or clears it with null. */
export async function assignCourt(matchId: string, court: string | null): Promise<Result> {
  const { data, error } = await createClient()
    .from("bracket_matches")
    .update({ court, updated_at: new Date().toISOString() })
    .eq("id", matchId)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "That court was just assigned to another match. Pick a different court."
        : "Could not update the court. Please try again.",
    };
  }
  if (!data || data.length === 0) return { ok: false, error: "You are not able to change this match." };
  return { ok: true };
}

const SCORE_ERRORS: Record<string, string> = {
  not_allowed: "Only this tournament’s director or an admin can enter scores.",
  already_scored: "This match already has a score.",
  teams_not_set: "Both teams need to be known before a score can be entered.",
  invalid_score: "Win to 11, win by 2, no ties.",
  tournament_cancelled: "This tournament was cancelled.",
  match_not_found: "This match no longer exists.",
};

/** Records a first-time score and advances the winner, in one server call. */
export async function recordScore(matchId: string, score1: number, score2: number): Promise<Result> {
  const { error } = await createClient().rpc("record_match_score", {
    p_match_id: matchId, p_score1: score1, p_score2: score2,
  });
  if (!error) return { ok: true };
  const code = Object.keys(SCORE_ERRORS).find((k) => error.message?.includes(k));
  return { ok: false, error: code ? SCORE_ERRORS[code] : "Could not save the score. Please try again." };
}

export async function setDivisionPlayStatus(divisionId: string, status: DivisionPlayStatus): Promise<Result> {
  const { data, error } = await createClient()
    .from("divisions")
    .update({ play_status: status })
    .eq("id", divisionId)
    .select("id");
  if (error) return { ok: false, error: "Could not change the division status. Please try again." };
  if (!data || data.length === 0) return { ok: false, error: "You are not able to change this division." };
  return { ok: true };
}

/** Turns court auto-assign on or off; turning it on also fills free courts. */
export async function setAutoAssignCourts(tournamentId: string, enabled: boolean): Promise<Result> {
  const { error } = await createClient().rpc("set_tournament_auto_assign_courts", {
    p_tournament_id: tournamentId, p_enabled: enabled,
  });
  if (error) {
    const code = Object.keys(AUTO_ASSIGN_ERRORS).find((k) => error.message?.includes(k));
    return { ok: false, error: code ? AUTO_ASSIGN_ERRORS[code] : "Could not change auto-assign. Please try again." };
  }
  return { ok: true };
}

const AUTO_ASSIGN_ERRORS: Record<string, string> = {
  not_tournament_director: "Only this tournament’s director can change auto-assign.",
  director_not_approved: "Your director account isn’t approved yet.",
  tournament_closed: "This tournament is completed or cancelled.",
};

export async function saveCourts(tournamentId: string, courts: string[]): Promise<{ ok: true; courts: string[] } | { ok: false; error: string }> {
  const { data, error } = await createClient().rpc("set_tournament_courts", {
    p_tournament_id: tournamentId, p_courts: courts,
  });
  if (error) return { ok: false, error: "Could not save the courts. Please try again." };
  return { ok: true, courts: data ?? courts };
}

// ─── Brackets ────────────────────────────────────────────────────────────────

export interface BracketRegistration {
  player_id: string | null;
  partner_id: string | null;
  guest_player_id: string | null;
  guest_partner_id: string | null;
  status: string;
  division_id: string | null;
  created_at: string;
}

/**
 * Builds and saves a single-elimination bracket for one division. Teams are
 * placed by the director's seed list (bracket_seeds, by player) where seeded,
 * then unseeded teams in registration order; standard placement puts byes on
 * the top seeds. Replaces the division's existing elimination matches; pool
 * matches are kept, exactly as mobile's createBracket does.
 */
export async function buildDivisionBracket(input: {
  tournamentId: string;
  divisionId: string;
  registrations: BracketRegistration[];
  seedByPlayer: Map<string, number>;
}): Promise<{ ok: true; teams: number } | { ok: false; error: string }> {
  const teams = activeTeamEntries(
    input.registrations.filter((r) => r.division_id === input.divisionId),
    (r) => ({
      self: r.guest_player_id ?? r.player_id ?? "",
      partner: r.guest_partner_id ?? r.partner_id,
      status: r.status,
      registeredAt: r.created_at,
    }),
  );
  if (teams.length < 2) return { ok: false, error: "This division needs at least two teams." };

  const seedOf = (r: BracketRegistration) =>
    (r.player_id && input.seedByPlayer.get(r.player_id)) || Number.MAX_SAFE_INTEGER;
  const ordered = teams
    .map((r, i) => ({ r, i }))
    .sort((a, b) => seedOf(a.r) - seedOf(b.r) || a.i - b.i)
    .map(({ r }) => r);

  const rows = buildBracketMatchRows({
    tournamentId: input.tournamentId,
    divisionId: input.divisionId,
    slots: seededSlots(ordered).map((r): BracketTeam | null => r && {
      playerId: r.guest_player_id ? null : r.player_id,
      partnerId: r.guest_partner_id ? null : r.partner_id,
      playerGuestId: r.guest_player_id,
      partnerGuestId: r.guest_partner_id,
    }),
    newId: () => crypto.randomUUID(),
    now: new Date().toISOString(),
  });

  const supabase = createClient();
  const del = await supabase
    .from("bracket_matches")
    .delete()
    .eq("tournament_id", input.tournamentId)
    .eq("division_id", input.divisionId)
    .is("pool_label", null);
  if (del.error) return { ok: false, error: "Could not replace the existing bracket." };

  const ins = await supabase.from("bracket_matches").insert(rows);
  if (ins.error) return { ok: false, error: "Could not save the bracket. Please try again." };
  return { ok: true, teams: teams.length };
}

// ─── Live updates ────────────────────────────────────────────────────────────

/**
 * Calls onChange (debounced 400 ms, as on mobile) whenever this tournament's
 * matches, divisions or court list change, from any device. Returns cleanup.
 */
export function subscribeDayOf(tournamentId: string, onChange: () => void): () => void {
  const supabase = createClient();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const bump = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 400);
  };
  const channel = supabase
    .channel(`day-of:${tournamentId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "bracket_matches", filter: `tournament_id=eq.${tournamentId}` }, bump)
    .on("postgres_changes", { event: "*", schema: "public", table: "divisions", filter: `tournament_id=eq.${tournamentId}` }, bump)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tournaments", filter: `id=eq.${tournamentId}` }, bump)
    .subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
