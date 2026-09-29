import { supabase } from '@/lib/supabase';
import type { TournamentRegistration } from '@/lib/registrationStore';
import {
  activeTeamRegistrations,
  createBracket,
  MATCH_SELECT,
  withGuestNames,
  rowToMatch,
  type BracketMatchRow,
  type DirectorBracketMatch,
} from '@/lib/supabase/brackets';
import {
  POOL_LETTERS, DEFAULT_ADVANCE_PER_POOL, seedTeams, snakePools, roundRobinRounds,
  seedQualifiers, placeSeeds, cutoffTies, type QualifiedSeed,
} from '@/lib/poolSchedule';

// Pool Play → Bracket, step 1: pools (migration 20260928170000).
//
// Pool matches are ordinary bracket_matches rows with round = 'pool' and a
// pool_label. So score entry, courts, the auto-assign queue and realtime work
// unchanged. Standings come from division_pool_standings() in the database,
// so web can use the same ranking later. Building the bracket from standings
// is step 2 and is director-confirmed.

export { POOL_LETTERS, DEFAULT_ADVANCE_PER_POOL, teamRating, seedTeams, snakePools, roundRobinRounds, suggestPoolCount } from '@/lib/poolSchedule';

type Team = TournamentRegistration;

export function playableTeams(registrations: TournamentRegistration[]): Team[] {
  return seedTeams(activeTeamRegistrations(registrations));
}

export async function createPools(input: {
  tournamentId: string;
  divisionId: string;
  registrations: TournamentRegistration[];
  poolCount: number;
  advancePerPool: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const teams = playableTeams(input.registrations.filter(r => r.divisionId === input.divisionId));
  if (teams.length < 2) return { ok: false, error: 'At least 2 teams are needed for pool play.' };

  const poolCount = Math.min(Math.max(1, input.poolCount), Math.floor(teams.length / 2), POOL_LETTERS.length);
  const pools = snakePools(teams, poolCount);
  const smallest = Math.min(...pools.map(p => p.length));
  if (input.advancePerPool < 1 || input.advancePerPool > smallest) {
    return { ok: false, error: `Advance per pool must be between 1 and ${smallest} (the smallest pool's size).` };
  }

  // Interleave the schedule: round 1 of every pool, then round 2 of every
  // pool, and so on. match_number follows that order, so the court queue's
  // tie-break (match number) rotates across pools.
  const perPool = pools.map(p => roundRobinRounds(p.length));
  const maxRounds = Math.max(...perPool.map(r => r.length));
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let seq = 0;
  for (let r = 0; r < maxRounds; r++) {
    pools.forEach((pool, pi) => {
      for (const [i, j] of perPool[pi][r] ?? []) {
        const t1 = pool[i];
        const t2 = pool[j];
        rows.push({
          tournament_id:   input.tournamentId,
          division_id:     input.divisionId,
          round:           'pool',
          pool_label:      POOL_LETTERS[pi],
          match_number:    seq++,
          team1_player_a:  t1.playerGuestId ? null : t1.playerId,
          team1_player_b:  t1.partnerGuestId ? null : t1.partnerId ?? null,
          team1_guest_a:   t1.playerGuestId ?? null,
          team1_guest_b:   t1.partnerGuestId ?? null,
          team2_player_a:  t2.playerGuestId ? null : t2.playerId,
          team2_player_b:  t2.partnerGuestId ? null : t2.partnerId ?? null,
          team2_guest_a:   t2.playerGuestId ?? null,
          team2_guest_b:   t2.partnerGuestId ?? null,
          created_at:      now,
          updated_at:      now,
        });
      }
    });
  }

  // Replace any previous pools for this division (elimination rows untouched).
  const { error: delError } = await supabase
    .from('bracket_matches')
    .delete()
    .eq('tournament_id', input.tournamentId)
    .eq('division_id', input.divisionId)
    .not('pool_label', 'is', null);
  if (delError) return { ok: false, error: 'Could not clear the previous pools.' };

  const { error: insError } = await supabase.from('bracket_matches').insert(rows as never);
  if (insError) {
    console.error('[createPools] insert error:', insError.message);
    return { ok: false, error: 'Could not create the pools. Please try again.' };
  }

  await supabase
    .from('divisions')
    .update({ pool_count: poolCount, advance_per_pool: input.advancePerPool })
    .eq('id', input.divisionId);

  return { ok: true };
}

export type PoolStanding = {
  teamKey: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  h2hWins: number;
  rank: number;
};

export type Pool = {
  label: string;
  matches: DirectorBracketMatch[];
  standings: PoolStanding[];
};

export type DivisionPools = {
  divisionName: string;
  pools: Pool[];
  advancePerPool: number;
  totalMatches: number;
  completedMatches: number;
};

function teamKeyOf(a?: { id: string } | null, b?: { id: string } | null): string {
  return b?.id ? `${a?.id}|${b.id}` : (a?.id ?? '');
}

export async function fetchDivisionPools(tournamentId: string, divisionId: string): Promise<DivisionPools | null> {
  const [{ data: rows, error }, { data: standings }, { data: division }] = await Promise.all([
    supabase
      .from('bracket_matches')
      .select(MATCH_SELECT)
      .eq('tournament_id', tournamentId)
      .eq('division_id', divisionId)
      .not('pool_label', 'is', null)
      .order('match_number', { ascending: true }),
    supabase.rpc('division_pool_standings', { p_division_id: divisionId }),
    supabase.from('divisions').select('name, advance_per_pool').eq('id', divisionId).maybeSingle(),
  ]);
  if (error || !rows || rows.length === 0) return null;

  const typed = await withGuestNames(rows as unknown as BracketMatchRow[], tournamentId);
  const names = new Map<string, string>();
  for (const r of typed) {
    const n1 = [r.p1a?.full_name ?? r.g1a?.display_name, r.p1b?.full_name ?? r.g1b?.display_name].filter(Boolean).join(' / ');
    const n2 = [r.p2a?.full_name ?? r.g2a?.display_name, r.p2b?.full_name ?? r.g2b?.display_name].filter(Boolean).join(' / ');
    names.set(teamKeyOf(r.p1a ?? r.g1a, r.p1b ?? r.g1b), n1);
    names.set(teamKeyOf(r.p2a ?? r.g2a, r.p2b ?? r.g2b), n2);
  }

  const labels = [...new Set(typed.map(r => r.pool_label as string))].sort();
  const pools: Pool[] = labels.map(label => ({
    label,
    matches: typed
      .filter(r => r.pool_label === label)
      .map(r => rowToMatch(r, divisionId, 0, `Pool ${label}`)),
    standings: (standings ?? [])
      .filter(s => s.pool_label === label)
      .map(s => ({
        teamKey:       s.team_key,
        name:          names.get(s.team_key) ?? 'Team',
        played:        s.played,
        wins:          s.wins,
        losses:        s.losses,
        pointsFor:     s.points_for,
        pointsAgainst: s.points_against,
        diff:          s.point_diff,
        h2hWins:       s.h2h_wins,
        rank:          s.pool_rank,
      }))
      .sort((a, b) => a.rank - b.rank),
  }));

  const completedMatches = typed.filter(r => r.completed_at != null).length;
  return {
    divisionName: division?.name ?? '',
    pools,
    advancePerPool: division?.advance_per_pool ?? DEFAULT_ADVANCE_PER_POOL,
    totalMatches: typed.length,
    completedMatches,
  };
}

export async function hasPools(tournamentId: string, divisionId: string): Promise<boolean> {
  const { count } = await supabase
    .from('bracket_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId)
    .not('pool_label', 'is', null);
  return (count ?? 0) > 0;
}

/** Whether any pool match in the division already has a score. */
export async function poolsHaveScores(tournamentId: string, divisionId: string): Promise<boolean> {
  const { count } = await supabase
    .from('bracket_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId)
    .not('pool_label', 'is', null)
    .not('completed_at', 'is', null);
  return (count ?? 0) > 0;
}

/** Pool matches per division, total and scored, for the Brackets list. */
export async function fetchPoolProgress(
  tournamentId: string,
): Promise<Record<string, { total: number; completed: number }>> {
  const { data } = await supabase
    .from('bracket_matches')
    .select('division_id, completed_at')
    .eq('tournament_id', tournamentId)
    .not('pool_label', 'is', null);
  const out: Record<string, { total: number; completed: number }> = {};
  for (const r of data ?? []) {
    if (!r.division_id) continue;
    const entry = out[r.division_id] ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (r.completed_at) entry.completed += 1;
    out[r.division_id] = entry;
  }
  return out;
}

// ─── Step 2: build the bracket from pool standings ───────────────────────────

/** The same identity division_pool_standings() uses for team_key. */
function registrationTeamKey(r: TournamentRegistration): string {
  return [r.playerGuestId ?? r.playerId, r.partnerGuestId ?? r.partnerId].filter(Boolean).join('|');
}

export type BracketPlan = {
  seeds: QualifiedSeed<PoolStanding>[];
  /** First-round slots in bracket order; null = bye. */
  slots: (TournamentRegistration | null)[];
  byes: number;
  /** Pools where the cut between qualifier and non-qualifier was an exact tie. */
  cutoffTiePools: string[];
  /** Qualifiers whose registration couldn't be found (e.g. cancelled since). */
  unmatched: string[];
};

/**
 * Seeds the pool qualifiers (tier, then pool record; owner's choice) into
 * standard bracket positions, top seeds taking any byes, with no first-round
 * meeting between teams from the same pool. Pure planning; nothing is written.
 */
export function planBracketFromPools(
  pools: DivisionPools,
  divisionRegistrations: TournamentRegistration[],
): BracketPlan {
  const seeds = seedQualifiers(pools.pools, pools.advancePerPool);
  let size = 4;
  while (size < seeds.length) size *= 2;
  const placed = placeSeeds(seeds, size);

  const byKey = new Map(activeTeamRegistrations(divisionRegistrations).map(r => [registrationTeamKey(r), r]));
  const unmatched: string[] = [];
  const slots = placed.map(q => {
    if (!q) return null;
    const reg = byKey.get(q.teamKey);
    if (!reg) unmatched.push(q.name);
    return reg ?? null;
  });

  return {
    seeds,
    slots,
    byes: size - seeds.length,
    cutoffTiePools: cutoffTies(pools.pools, pools.advancePerPool),
    unmatched,
  };
}

export async function buildBracketFromPools(input: {
  tournamentId: string;
  divisionId: string;
  divisionName: string;
  plan: BracketPlan;
  registrations: TournamentRegistration[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.plan.unmatched.length > 0) {
    return {
      ok: false,
      error: `Can't find the registration for: ${input.plan.unmatched.join(', ')}. Check they're still registered.`,
    };
  }
  const bracket = await createBracket(
    input.tournamentId,
    input.divisionId,
    input.divisionName,
    input.registrations,
    { slots: input.plan.slots },
  );
  return bracket ? { ok: true } : { ok: false, error: 'Could not build the bracket. Please try again.' };
}
