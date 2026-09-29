import { supabase } from '@/lib/supabase';
import type { TournamentRegistration } from '@/lib/registrationStore';
import type {
  DirectorBracket,
  DirectorBracketMatch,
  DirectorBracketParticipant,
  DirectorBracketRound,
} from '@/lib/directorBracketStore';
import type { Database } from '@shared/database.types';
import { validateSingleGameScore } from '@/lib/bracketScoring';
import { activeTeamEntries, bracketSizeFor, buildBracketMatchRows, type BracketTeam } from '@shared/bracketBuild';

// Re-export types consumed by screens
export type { DirectorBracket, DirectorBracketMatch, DirectorBracketParticipant, DirectorBracketRound };

type RoundLabel = Database['public']['Enums']['round_label'];

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileRef = { id: string; full_name: string | null } | null;
type GuestRef = { id: string; display_name: string | null } | null;

export type BracketMatchRow = {
  id: string;
  tournament_id: string;
  division_id: string | null;
  match_number: number;
  round: RoundLabel;
  court: string | null;
  /** Pool letter for pool-play matches (20260928170000); null for elimination rounds. */
  pool_label: string | null;
  score_edited_at: string | null;
  score_edited_prev: { s1?: number | null; s2?: number | null } | null;
  winner: number | null;
  completed_at: string | null;
  score_team1: number[] | null;
  score_team2: number[] | null;
  next_match_id: string | null;
  next_match_slot: number | null;
  p1a: ProfileRef;
  p1b: ProfileRef;
  p2a: ProfileRef;
  p2b: ProfileRef;
  // A slot is a real player (p*) or a director-added guest (g*), never both —
  // see the comment on team1_guest_a in the migration that added these.
  g1a: GuestRef;
  g1b: GuestRef;
  g2a: GuestRef;
  g2b: GuestRef;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Score validation — identical rules to directorBracketStore
export const validateScores = validateSingleGameScore;

// Bracket sizing, round labels and the bye rules now live in
// packages/shared/src/bracketBuild.ts (shared with web).

// Display name from DB round_label
export function roundDisplayName(label: string): string {
  switch (label) {
    case 'final':  return 'Final';
    case 'sf':     return 'Semifinals';
    case 'qf':     return 'Quarterfinals';
    case 'r16':    return 'Round of 16';
    case 'r32':    return 'Round of 32';
    case 'r64':    return 'Round of 64';
    default:       return label.toUpperCase();
  }
}

// Order labels earliest → latest (lower = earlier round)
const ROUND_ORDER: Record<string, number> = {
  pool: 0, r64: 1, r32: 2, r16: 3, qf: 4, sf: 5, bronze: 6, final: 7,
};

// One bracket_matches row -> DirectorBracketMatch. Shared by the elimination
// bracket (rowsToDivisionBracket) and pool play (lib/supabase/pools.ts), so a
// pool match behaves exactly like any other match in the UI.
export function rowToMatch(
  row: BracketMatchRow,
  divisionId: string,
  roundIndex: number,
  roundName: string,
): DirectorBracketMatch {
  // A slot is a real player (p1a) or a director-added guest (g1a), never
  // both, so checking p1a first and falling back to g1a picks whichever
  // one this particular match actually has.
  const p1 = row.p1a || row.g1a
    ? {
        id: (row.p1a ?? row.g1a)!.id,
        name: row.p1a?.full_name ?? row.g1a?.display_name ?? '',
        partnerName: row.p1b?.full_name ?? row.g1b?.display_name ?? undefined,
        divisionId,
        seed: 0,
      }
    : null;

  const p2 = row.p2a || row.g2a
    ? {
        id: (row.p2a ?? row.g2a)!.id,
        name: row.p2a?.full_name ?? row.g2a?.display_name ?? '',
        partnerName: row.p2b?.full_name ?? row.g2b?.display_name ?? undefined,
        divisionId,
        seed: 0,
      }
    : null;

  const winnerId = row.winner === 1
    ? (row.p1a?.id ?? row.g1a?.id ?? undefined)
    : row.winner === 2
    ? (row.p2a?.id ?? row.g2a?.id ?? undefined)
    : undefined;

  const status: DirectorBracketMatch['status'] =
    row.winner != null ? 'completed'
    : row.court != null ? 'scheduled'
    : 'pending';

  return {
    id: row.id,
    tournamentId: row.tournament_id,
    divisionId,
    roundIndex,
    roundName,
    matchNumber: row.match_number,
    participant1: p1,
    participant2: p2,
    winnerId,
    score1: row.score_team1?.[0],
    score2: row.score_team2?.[0],
    court: row.court ?? undefined,
    completedAt: row.completed_at ?? undefined,
    scoreEdit: row.score_edited_at
      ? {
          at: row.score_edited_at,
          prevScore1: row.score_edited_prev?.s1 ?? undefined,
          prevScore2: row.score_edited_prev?.s2 ?? undefined,
        }
      : undefined,
    status,
  };
}

// ─── Row → DirectorBracket reconstruction ─────────────────────────────────────

function rowsToDivisionBracket(
  divisionId: string,
  divisionName: string,
  rows: BracketMatchRow[],
): DirectorBracket {
  // Sort labels by bracket position
  const labelSet = [...new Set(rows.map(r => r.round))];
  const sortedLabels = labelSet.sort((a, b) => ROUND_ORDER[a] - ROUND_ORDER[b]);
  const totalRounds = sortedLabels.length;

  const rounds: DirectorBracketRound[] = sortedLabels.map((label, ri) => {
    const roundRows = rows.filter(r => r.round === label)
      .sort((a, b) => a.match_number - b.match_number);

    const matches: DirectorBracketMatch[] = roundRows.map(row =>
      rowToMatch(row, divisionId, ri, roundDisplayName(label)),
    );

    return {
      id: `round-${divisionId}-${label}`,
      roundIndex: ri,
      roundName: roundDisplayName(label),
      matches,
    };
  });

  // Collect all participants from first round
  const firstRound = rounds[0];
  const participants: DirectorBracketParticipant[] = [];
  if (firstRound) {
    let seed = 1;
    for (const m of firstRound.matches) {
      if (m.participant1) { participants.push({ ...m.participant1, seed: seed++ }); }
      if (m.participant2) { participants.push({ ...m.participant2, seed: seed++ }); }
    }
  }

  // Derive bracket-level status
  const finalRound = rounds[totalRounds - 1];
  const finalMatch = finalRound?.matches[0];
  const isCompleted = finalMatch?.status === 'completed';
  const anyStarted = rows.some(r => r.winner != null);

  const status: DirectorBracket['status'] = isCompleted
    ? 'completed'
    : anyStarted ? 'in_progress'
    : 'not_started';

  // Champion from final match
  let championId: string | undefined;
  let championName: string | undefined;
  let runnerUpId: string | undefined;
  let runnerUpName: string | undefined;
  let completedAt: string | undefined;

  if (isCompleted && finalMatch) {
    const finalRow = rows.find(r => r.round === sortedLabels[totalRounds - 1] && r.match_number === 0);
    if (finalRow) {
      const winnerProfile = finalRow.winner === 1 ? finalRow.p1a : finalRow.p2a;
      const winnerGuest   = finalRow.winner === 1 ? finalRow.g1a : finalRow.g2a;
      const loserProfile  = finalRow.winner === 1 ? finalRow.p2a : finalRow.p1a;
      const loserGuest    = finalRow.winner === 1 ? finalRow.g2a : finalRow.g1a;
      championId   = winnerProfile?.id ?? winnerGuest?.id;
      championName = winnerProfile?.full_name ?? winnerGuest?.display_name ?? undefined;
      runnerUpId   = loserProfile?.id ?? loserGuest?.id;
      runnerUpName = loserProfile?.full_name ?? loserGuest?.display_name ?? undefined;
    }
    const completedDates = rows.map(r => r.completed_at).filter(Boolean) as string[];
    completedAt = completedDates.sort().at(-1) ?? undefined;
  }

  const bracketSize = bracketSizeFor(Math.max(participants.length, 4));

  return {
    id: `bracket-${divisionId}`,
    tournamentId: rows[0]?.tournament_id ?? '',
    divisionId,
    divisionName,
    bracketSize,
    participants,
    rounds,
    status,
    createdAt: new Date().toISOString(),
    completedAt,
    championId,
    championName,
    runnerUpId,
    runnerUpName,
    // publishedAt: treated as completedAt (publish is implicit on completion)
    publishedAt: isCompleted ? completedAt : undefined,
  };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export const MATCH_SELECT = `
  id, tournament_id, division_id, match_number, round,
  court, pool_label, winner, completed_at, score_team1, score_team2,
  score_edited_at, score_edited_prev,
  next_match_id, next_match_slot,
  p1a:profiles!bracket_matches_team1_player_a_fkey(id,full_name),
  p1b:profiles!bracket_matches_team1_player_b_fkey(id,full_name),
  p2a:profiles!bracket_matches_team2_player_a_fkey(id,full_name),
  p2b:profiles!bracket_matches_team2_player_b_fkey(id,full_name),
  g1a:personal_guest_players!bracket_matches_team1_guest_a_fkey(id,display_name),
  g1b:personal_guest_players!bracket_matches_team1_guest_b_fkey(id,display_name),
  g2a:personal_guest_players!bracket_matches_team2_guest_a_fkey(id,display_name),
  g2b:personal_guest_players!bracket_matches_team2_guest_b_fkey(id,display_name)
`.trim();

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchAllBrackets(
  tournamentId: string,
  divisionNames: Record<string, string> = {},
): Promise<DirectorBracket[]> {
  const { data, error } = await supabase
    .from('bracket_matches')
    .select(MATCH_SELECT)
    .eq('tournament_id', tournamentId)
    .is('pool_label', null);

  if (error || !data || data.length === 0) return [];

  const rows = data as unknown as BracketMatchRow[];
  const byDivision = new Map<string, BracketMatchRow[]>();
  for (const row of rows) {
    const div = row.division_id ?? 'unknown';
    if (!byDivision.has(div)) byDivision.set(div, []);
    byDivision.get(div)!.push(row);
  }

  return [...byDivision.entries()].map(([divId, divRows]) =>
    rowsToDivisionBracket(divId, divisionNames[divId] ?? divId, divRows),
  );
}

export async function fetchBracket(
  tournamentId: string,
  divisionId: string,
  divisionName = '',
): Promise<DirectorBracket | null> {
  const { data, error } = await supabase
    .from('bracket_matches')
    .select(MATCH_SELECT)
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId)
    .is('pool_label', null);

  if (error || !data || data.length === 0) return null;
  return rowsToDivisionBracket(divisionId, divisionName, data as unknown as BracketMatchRow[]);
}

export async function hasBracket(
  tournamentId: string,
  divisionId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('bracket_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId)
    .is('pool_label', null);
  return (count ?? 0) > 0;
}

// ─── Bracket generation ───────────────────────────────────────────────────────

// playerUUID/partnerUUID: a real profiles.id, for the team1_player_a-style FK
// columns. playerGuestUUID/partnerGuestUUID: a personal_guest_players.id, for
// the team1_guest_a-style columns added alongside them — director-added guest
// registrants have no profile, and inserting their id into a profiles-FK
// column would fail the constraint. Exactly one of the pair is set per side;
// never both, since a slot is either a real player or a guest.
type ParticipantRow = DirectorBracketParticipant & {
  playerUUID?: string;
  playerGuestUUID?: string;
  partnerUUID?: string;
  partnerGuestUUID?: string;
};

/**
 * The division's playable teams: one registration row per real team, in
 * registration order. Shared by the elimination bracket and pool play.
 */
export function activeTeamRegistrations(registrations: TournamentRegistration[]): TournamentRegistration[] {
  // A doubles/mixed team can exist as TWO registration rows — one per member,
  // each naming the other as partner — if whatever registered them (bulk
  // import, director tooling) called the register-a-team step once per
  // player instead of once per team. Both rows are the same real team, so
  // seeding one slot per ROW put that team on both sides of a match against
  // itself, or scattered it into two different matches in the same round.
  // Found 2026-09-24 on RATE LAS VEGAS OPEN - DEMO: every doubles/mixed
  // division had exactly 2x its real team count, always an exact mirror
  // (A w/ partner B, and separately B w/ partner A).
  //
  // The unordered pair is the identity of a team regardless of which member
  // is on which side, so dedup on it rather than on the row. Keeps the
  // earlier-registered of a mirrored pair; singles are unaffected since a
  // player alone has no partner half to collide with.
  //
  // The rule itself now lives in packages/shared (activeTeamEntries) so web
  // counts teams the same way.
  return activeTeamEntries(registrations, r => ({
    self: r.playerGuestId ?? r.playerId,
    partner: r.partnerGuestId ?? r.partnerId ?? null,
    status: r.status,
    registeredAt: r.registrationDate,
  }));
}

export async function createBracket(
  tournamentId: string,
  divisionId: string,
  divisionName: string,
  registrations: TournamentRegistration[],
  options?: {
    /**
     * Seeded placement (Pool Play → Bracket): the exact first-round slots,
     * length = a power of two >= 4, null = bye. When omitted, the bracket is
     * built exactly as before (registration order, byes last).
     */
    slots?: (TournamentRegistration | null)[];
  },
): Promise<DirectorBracket | null> {
  // Delete any existing bracket for this division. Pool-play matches are kept:
  // they are a separate stage and may be what this bracket is built from.
  await supabase
    .from('bracket_matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId)
    .is('pool_label', null);

  const sorted = options?.slots
    ? (options.slots.filter(Boolean) as TournamentRegistration[])
    : activeTeamRegistrations(registrations);

  if (sorted.length === 0) return null;

  const toParticipant = (r: TournamentRegistration, i: number): ParticipantRow => ({
    id:              r.playerId,
    // r.playerId falls back to the guest id when there is no profile (see
    // TournamentRegistration), so it is never used directly as a profiles FK
    // here — only playerUUID/playerGuestUUID are, and exactly one is set.
    playerUUID:      r.playerGuestId ? undefined : r.playerId,
    playerGuestUUID: r.playerGuestId,
    partnerUUID:      r.partnerGuestId ? undefined : r.partnerId,
    partnerGuestUUID: r.partnerGuestId,
    name:        r.playerName,
    partnerName: r.partnerName,
    divisionId:  r.divisionId,
    seed:        i + 1,
  });
  const participants: ParticipantRow[] = sorted.map(toParticipant);

  // Slots for first round (participants + BYEs), then every row, built by the
  // shared builder (packages/shared/src/bracketBuild.ts) so web builds brackets
  // exactly the same way, byes and cascade rules included. Seeded placement
  // keeps the caller's exact slots (byes where it put them).
  const slots: (ParticipantRow | null)[] = options?.slots
    ? options.slots.map((r, i) => (r ? toParticipant(r, i) : null))
    : [
        ...participants,
        ...Array<null>(Math.max(0, bracketSizeFor(participants.length) - participants.length)).fill(null),
      ];

  const insertRows = buildBracketMatchRows({
    tournamentId,
    divisionId,
    slots: slots.map((p): BracketTeam | null => p && {
      playerId:       p.playerUUID ?? null,
      partnerId:      p.partnerUUID ?? null,
      playerGuestId:  p.playerGuestUUID ?? null,
      partnerGuestId: p.partnerGuestUUID ?? null,
    }),
    newId: generateUUID,
    now: new Date().toISOString(),
  });

  const { error: insertError } = await supabase
    .from('bracket_matches')
    .insert(insertRows);

  if (insertError) {
    console.error('createBracket insert error:', insertError);
    return null;
  }

  return fetchBracket(tournamentId, divisionId, divisionName);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function clearBracket(tournamentId: string, divisionId: string): Promise<void> {
  await supabase
    .from('bracket_matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId);
}

// publishAllBrackets: brackets are implicitly published when completed (no DB column for published_at).
// This function is a no-op at the DB level; the read-back treats completedAt as publishedAt.
export async function publishAllBrackets(_tournamentId: string): Promise<void> {
  // Intentional no-op: see brackets.ts comment on publishedAt derivation.
}

export async function getBracketMatchCounts(tournamentId: string): Promise<{
  total: number;
  completed: number;
  remaining: number;
  completionPct: number;
}> {
  const { data } = await supabase
    .from('bracket_matches')
    .select('winner, team1_player_a, team2_player_a, team1_guest_a, team2_guest_a')
    .eq('tournament_id', tournamentId);

  if (!data) return { total: 0, completed: 0, remaining: 0, completionPct: 0 };

  // Only count real matches (at least one participant, profile or guest)
  const real = data.filter(r =>
    r.team1_player_a != null || r.team2_player_a != null || r.team1_guest_a != null || r.team2_guest_a != null);
  const total = real.length;
  const completed = real.filter(r => r.winner != null).length;
  const remaining = total - completed;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, remaining, completionPct };
}

/**
 * Divisions that have an elimination bracket, per tournament: one query for any
 * number of tournaments (Director Hub list, Workspace "Bracket Ready").
 * Database truth, not directorBracketStore's device memory.
 */
export async function fetchBracketDivisions(tournamentIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (tournamentIds.length === 0) return out;
  const { data } = await supabase
    .from('bracket_matches')
    .select('tournament_id, division_id')
    .in('tournament_id', tournamentIds)
    .is('pool_label', null);
  for (const r of data ?? []) {
    if (!r.division_id) continue;
    const set = out.get(r.tournament_id) ?? new Set<string>();
    set.add(r.division_id);
    out.set(r.tournament_id, set);
  }
  return out;
}

/** Whether any elimination bracket exists for this tournament (database, not device memory). */
export async function hasAnyBracket(tournamentId: string): Promise<boolean> {
  const { count } = await supabase
    .from('bracket_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .is('pool_label', null);
  return (count ?? 0) > 0;
}

export async function isTournamentCompleted(tournamentId: string): Promise<boolean> {
  // Tournament is completed when every division has a completed final match
  const { data } = await supabase
    .from('bracket_matches')
    .select('division_id, round, winner')
    .eq('tournament_id', tournamentId)
    .eq('round', 'final');

  if (!data || data.length === 0) return false;

  // Every division's final must have a winner
  return data.every(r => r.winner != null);
}
