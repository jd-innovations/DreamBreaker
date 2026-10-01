// Pool Play → Bracket on the web (DIRECTOR_HUB_WEB_PARITY.md, W3), the same model
// as mobile's lib/supabase/pools.ts:
//   pools       bracket_matches rows with round 'pool' and a pool_label, so courts,
//               the queue, score entry, corrections and realtime work unchanged
//   standings   division_pool_standings() (computed, never stored)
//   rules       packages/shared/src/poolSchedule.ts (placement, schedule, seeding)
//   bracket     saveEliminationBracket (packages/shared/src/bracketBuild.ts)
// Moving to the bracket is director-confirmed.

import { createClient } from "@/lib/supabase/client";
import { activeTeamEntries, type BracketTeam } from "@shared/bracketBuild";
import {
  buildPoolMatchRows, cutoffTies, meanRating, placeSeeds, poolBracketSize, poolTeamKey, seedByRating,
  seedQualifiers, snakePools, POOL_LETTERS, type QualifiedSeed,
} from "@shared/poolSchedule";
import {
  registrationTeam, saveEliminationBracket, type BracketRegistration, type Result,
} from "@/lib/tournament/day-of";
import type { LiveBracketMatch } from "@/lib/tournament/live-brackets";
import type { TeamPerson } from "@shared/teamNames";

export interface PoolRegistration extends BracketRegistration {
  playerDupr: number | null;
  partnerDupr: number | null;
}

/** A division's playable teams, highest rated first (mean DUPR; unrated last). */
export function poolTeams(registrations: PoolRegistration[], divisionId: string): PoolRegistration[] {
  const teams = activeTeamEntries(
    registrations.filter((r) => r.division_id === divisionId),
    (r) => ({
      self: r.guest_player_id ?? r.player_id ?? "",
      partner: r.guest_partner_id ?? r.partner_id,
      status: r.status,
      registeredAt: r.created_at,
    }),
  );
  return seedByRating(teams, (r) => meanRating([r.playerDupr, r.partnerDupr]));
}

/** Creates (or replaces) a division's pools. Elimination matches are untouched. */
export async function createPools(input: {
  tournamentId: string;
  divisionId: string;
  registrations: PoolRegistration[];
  poolCount: number;
  advancePerPool: number;
}): Promise<Result> {
  const teams = poolTeams(input.registrations, input.divisionId);
  if (teams.length < 2) return { ok: false, error: "At least 2 teams are needed for pool play." };

  const poolCount = Math.min(Math.max(1, input.poolCount), Math.floor(teams.length / 2), POOL_LETTERS.length);
  const pools = snakePools(teams, poolCount);
  const smallest = Math.min(...pools.map((p) => p.length));
  if (input.advancePerPool < 1 || input.advancePerPool > smallest) {
    return { ok: false, error: `Advance per pool must be between 1 and ${smallest} (the smallest pool’s size).` };
  }

  const rows = buildPoolMatchRows({
    tournamentId: input.tournamentId,
    divisionId: input.divisionId,
    pools: pools.map((p) => p.map(registrationTeam)),
    now: new Date().toISOString(),
  });

  const supabase = createClient();
  const del = await supabase
    .from("bracket_matches")
    .delete()
    .eq("tournament_id", input.tournamentId)
    .eq("division_id", input.divisionId)
    .not("pool_label", "is", null);
  if (del.error) return { ok: false, error: "Could not clear the previous pools." };

  const ins = await supabase.from("bracket_matches").insert(rows);
  if (ins.error) return { ok: false, error: "Could not create the pools. Please try again." };

  await supabase
    .from("divisions")
    .update({ pool_count: poolCount, advance_per_pool: input.advancePerPool })
    .eq("id", input.divisionId);
  return { ok: true };
}

export interface PoolStanding {
  teamKey: string;
  name: string;
  members: string[];
  /** The team's players, for display (teamNames.ts); empty if no pool match named them. */
  people: TeamPerson[];
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  h2hWins: number;
  rank: number;
}

export interface DivisionPool {
  label: string;
  standings: PoolStanding[];
}

/** Team names keyed as the standings function keys teams, from the division's pool matches. */
function namesFromMatches(matches: LiveBracketMatch[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of matches) {
    if (!m.poolLabel) continue;
    if (m.team1.length && m.team1Name) names.set(m.team1.join("|"), m.team1Name);
    if (m.team2.length && m.team2Name) names.set(m.team2.join("|"), m.team2Name);
  }
  return names;
}

/** Each team's players, keyed the same way. */
function peopleFromMatches(matches: LiveBracketMatch[]): Map<string, TeamPerson[]> {
  const people = new Map<string, TeamPerson[]>();
  for (const m of matches) {
    if (!m.poolLabel) continue;
    if (m.team1.length && m.team1People?.length) people.set(m.team1.join("|"), m.team1People);
    if (m.team2.length && m.team2People?.length) people.set(m.team2.join("|"), m.team2People);
  }
  return people;
}

/** Standings per pool, ranked by division_pool_standings(). Anyone can read them. */
export async function fetchPoolStandings(divisionId: string, matches: LiveBracketMatch[]): Promise<DivisionPool[]> {
  const { data, error } = await createClient().rpc("division_pool_standings", { p_division_id: divisionId });
  if (error) throw error;
  const names = namesFromMatches(matches);
  const people = peopleFromMatches(matches);
  const byPool = new Map<string, PoolStanding[]>();
  for (const s of data ?? []) {
    const list = byPool.get(s.pool_label) ?? [];
    list.push({
      teamKey: s.team_key,
      name: names.get(s.team_key) ?? "Team",
      members: s.team_key.split("|"),
      people: people.get(s.team_key) ?? [],
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      pointsFor: s.points_for,
      pointsAgainst: s.points_against,
      diff: s.point_diff,
      h2hWins: s.h2h_wins,
      rank: s.pool_rank,
    });
    byPool.set(s.pool_label, list);
  }
  return [...byPool.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, standings]) => ({ label, standings: standings.sort((a, b) => a.rank - b.rank) }));
}

export interface BracketPlan {
  seeds: QualifiedSeed<PoolStanding>[];
  /** First-round slots in bracket order; null = bye. */
  slots: (BracketTeam | null)[];
  /** Seed shown in each slot, for the preview. */
  slotSeeds: (QualifiedSeed<PoolStanding> | null)[];
  byes: number;
  /** Pools where the cut between qualifier and non-qualifier was an exact tie. */
  cutoffTiePools: string[];
  /** Qualifiers whose registration couldn't be found (e.g. cancelled since). */
  unmatched: string[];
}

/** Seeds the pool qualifiers into the bracket. Pure planning; nothing is written. */
export function planBracketFromPools(
  pools: DivisionPool[],
  advancePerPool: number,
  registrations: PoolRegistration[],
  divisionId: string,
): BracketPlan {
  const seeds = seedQualifiers(pools, advancePerPool);
  const size = poolBracketSize(seeds.length);
  const placed = placeSeeds(seeds, size);
  const byKey = new Map(poolTeams(registrations, divisionId).map((r) => [poolTeamKey(registrationTeam(r)), r]));
  const unmatched: string[] = [];
  const slots = placed.map((q) => {
    if (!q) return null;
    const reg = byKey.get(q.teamKey);
    if (!reg) { unmatched.push(q.name); return null; }
    return registrationTeam(reg);
  });
  return {
    seeds,
    slots,
    slotSeeds: placed,
    byes: size - seeds.length,
    cutoffTiePools: cutoffTies(pools, advancePerPool),
    unmatched,
  };
}

export async function buildBracketFromPools(tournamentId: string, divisionId: string, plan: BracketPlan): Promise<Result> {
  if (plan.unmatched.length > 0) {
    return { ok: false, error: `Can’t find the registration for: ${plan.unmatched.join(", ")}. Check they’re still registered.` };
  }
  return saveEliminationBracket(tournamentId, divisionId, plan.slots);
}
