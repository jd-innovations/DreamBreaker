import { supabase } from '@/lib/supabase';
import type { TournamentRegistration } from '@/lib/registrationStore';
import type {
  DirectorBracket,
  DirectorBracketMatch,
  DirectorBracketParticipant,
  DirectorBracketRound,
} from '@/lib/directorBracketStore';
import type { Database } from '@/lib/database.types';

// Re-export types consumed by screens
export type { DirectorBracket, DirectorBracketMatch, DirectorBracketParticipant, DirectorBracketRound };

type RoundLabel = Database['public']['Enums']['round_label'];

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileRef = { id: string; full_name: string | null } | null;

type BracketMatchRow = {
  id: string;
  tournament_id: string;
  division_id: string | null;
  match_number: number;
  round: RoundLabel;
  court: string | null;
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
export function validateScores(score1: number, score2: number): string | null {
  if (!Number.isInteger(score1) || !Number.isInteger(score2)) return 'Scores must be whole numbers.';
  if (score1 < 0 || score2 < 0) return 'Scores cannot be negative.';
  if (score1 === score2) return 'Scores cannot be tied. No ties allowed.';
  const winner = Math.max(score1, score2);
  const loser  = Math.min(score1, score2);
  if (winner < 11) return 'Winning score must be at least 11.';
  if (winner - loser < 2) return 'Winner must win by at least 2 points.';
  return null;
}

function smallestPow2(n: number): number {
  let p = 4;
  while (p < n) p *= 2;
  return Math.min(p, 32);
}

// Map roundIndex (0 = earliest, N-1 = final) to DB round_label enum
function roundLabel(roundIndex: number, totalRounds: number): RoundLabel {
  const fromEnd = totalRounds - 1 - roundIndex;
  if (fromEnd === 0) return 'final';
  if (fromEnd === 1) return 'sf';
  if (fromEnd === 2) return 'qf';
  if (fromEnd === 3) return 'r16';
  if (fromEnd === 4) return 'r32';
  if (fromEnd === 5) return 'r64';
  return 'pool';
}

// Display name from DB round_label
function roundDisplayName(label: string): string {
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

    const matches: DirectorBracketMatch[] = roundRows.map(row => {
      const p1 = row.p1a
        ? {
            id: row.p1a.id,
            name: row.p1a.full_name ?? '',
            partnerName: row.p1b?.full_name ?? undefined,
            divisionId,
            seed: 0,
          }
        : null;

      const p2 = row.p2a
        ? {
            id: row.p2a.id,
            name: row.p2a.full_name ?? '',
            partnerName: row.p2b?.full_name ?? undefined,
            divisionId,
            seed: 0,
          }
        : null;

      const winnerId = row.winner === 1
        ? (row.p1a?.id ?? undefined)
        : row.winner === 2
        ? (row.p2a?.id ?? undefined)
        : undefined;

      const status: DirectorBracketMatch['status'] =
        row.winner != null ? 'completed'
        : row.court != null ? 'scheduled'
        : 'pending';

      return {
        id: row.id,
        tournamentId: row.tournament_id,
        divisionId,
        roundIndex: ri,
        roundName: roundDisplayName(label),
        matchNumber: row.match_number,
        participant1: p1,
        participant2: p2,
        winnerId,
        score1: row.score_team1?.[0],
        score2: row.score_team2?.[0],
        courtNumber: row.court != null ? parseInt(row.court, 10) : undefined,
        completedAt: row.completed_at ?? undefined,
        status,
      };
    });

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
      const loserProfile  = finalRow.winner === 1 ? finalRow.p2a : finalRow.p1a;
      championId   = winnerProfile?.id;
      championName = winnerProfile?.full_name ?? undefined;
      runnerUpId   = loserProfile?.id;
      runnerUpName = loserProfile?.full_name ?? undefined;
    }
    const completedDates = rows.map(r => r.completed_at).filter(Boolean) as string[];
    completedAt = completedDates.sort().at(-1) ?? undefined;
  }

  const bracketSize = smallestPow2(Math.max(participants.length, 4));

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

const MATCH_SELECT = `
  id, tournament_id, division_id, match_number, round,
  court, winner, completed_at, score_team1, score_team2,
  next_match_id, next_match_slot,
  p1a:profiles!bracket_matches_team1_player_a_fkey(id,full_name),
  p1b:profiles!bracket_matches_team1_player_b_fkey(id,full_name),
  p2a:profiles!bracket_matches_team2_player_a_fkey(id,full_name),
  p2b:profiles!bracket_matches_team2_player_b_fkey(id,full_name)
`.trim();

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchAllBrackets(
  tournamentId: string,
  divisionNames: Record<string, string> = {},
): Promise<DirectorBracket[]> {
  const { data, error } = await supabase
    .from('bracket_matches')
    .select(MATCH_SELECT)
    .eq('tournament_id', tournamentId);

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
    .eq('division_id', divisionId);

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
    .eq('division_id', divisionId);
  return (count ?? 0) > 0;
}

// ─── Bracket generation ───────────────────────────────────────────────────────

type ParticipantRow = DirectorBracketParticipant & { playerUUID: string; partnerUUID?: string };

export async function createBracket(
  tournamentId: string,
  divisionId: string,
  divisionName: string,
  registrations: TournamentRegistration[],
): Promise<DirectorBracket | null> {
  // Delete any existing bracket for this division
  await supabase
    .from('bracket_matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId);

  const sorted = [...registrations]
    .filter(r => r.status === 'registered' || r.status === 'checked_in')
    .sort((a, b) => new Date(a.registrationDate).getTime() - new Date(b.registrationDate).getTime());

  if (sorted.length === 0) return null;

  const participants: ParticipantRow[] = sorted.map((r, i) => ({
    id:          r.playerId,
    playerUUID:  r.playerId,
    partnerUUID: r.partnerId,
    name:        r.playerName,
    partnerName: r.partnerName,
    divisionId:  r.divisionId,
    seed:        i + 1,
  }));

  const bracketSize = smallestPow2(participants.length);
  const totalRounds = Math.log2(bracketSize);

  // Pre-assign UUIDs to every match
  const matchIds: Record<number, Record<number, string>> = {}; // [roundIndex][matchNumber] -> uuid
  for (let ri = 0; ri < totalRounds; ri++) {
    matchIds[ri] = {};
    const matchCount = bracketSize / Math.pow(2, ri + 1);
    for (let mi = 0; mi < matchCount; mi++) {
      matchIds[ri][mi] = generateUUID();
    }
  }

  // Slots for first round (participants + BYEs)
  const slots: (ParticipantRow | null)[] = [
    ...participants,
    ...Array<null>(bracketSize - participants.length).fill(null),
  ];

  // Track which player UUIDs appear in each match slot (resolved through BYE cascades)
  type MatchState = {
    id: string;
    p1: ParticipantRow | null;
    p2: ParticipantRow | null;
    winner: 1 | 2 | null;
    byeCompleted: boolean;
  };

  const matchStates: Record<number, Record<number, MatchState>> = {};
  for (let ri = 0; ri < totalRounds; ri++) {
    matchStates[ri] = {};
    const matchCount = bracketSize / Math.pow(2, ri + 1);
    for (let mi = 0; mi < matchCount; mi++) {
      matchStates[ri][mi] = {
        id: matchIds[ri][mi],
        p1: null,
        p2: null,
        winner: null,
        byeCompleted: false,
      };
    }
  }

  // Fill first round
  const firstRoundCount = bracketSize / 2;
  for (let mi = 0; mi < firstRoundCount; mi++) {
    matchStates[0][mi].p1 = slots[mi * 2] ?? null;
    matchStates[0][mi].p2 = slots[mi * 2 + 1] ?? null;
  }

  // Advance winner helper
  function advance(ri: number, mi: number, winner: ParticipantRow, winnerSlot: 1 | 2) {
    matchStates[ri][mi].winner = winnerSlot;
    matchStates[ri][mi].byeCompleted = true;
    const nextRi = ri + 1;
    if (nextRi >= totalRounds) return;
    const nextMi = Math.floor(mi / 2);
    const nextState = matchStates[nextRi][nextMi];
    if (mi % 2 === 0) { nextState.p1 = winner; }
    else              { nextState.p2 = winner; }
  }

  // Auto-advance BYEs in first round
  for (let mi = 0; mi < firstRoundCount; mi++) {
    const s = matchStates[0][mi];
    if (s.p1 && !s.p2) { advance(0, mi, s.p1, 1); }
    else if (!s.p1 && s.p2) { advance(0, mi, s.p2, 2); }
    else if (!s.p1 && !s.p2) { s.byeCompleted = true; }
  }

  // Cascade BYEs through subsequent rounds
  let changed = true;
  while (changed) {
    changed = false;
    for (let ri = 1; ri < totalRounds; ri++) {
      const matchCount = bracketSize / Math.pow(2, ri + 1);
      for (let mi = 0; mi < matchCount; mi++) {
        const s = matchStates[ri][mi];
        if (s.byeCompleted) continue;
        if (s.p1 && !s.p2) { advance(ri, mi, s.p1, 1); changed = true; }
        else if (!s.p1 && s.p2) { advance(ri, mi, s.p2, 2); changed = true; }
        else if (!s.p1 && !s.p2) { s.byeCompleted = true; changed = true; }
      }
    }
  }

  const now = new Date().toISOString();

  // Build insert rows
  const insertRows = [];
  for (let ri = 0; ri < totalRounds; ri++) {
    const label = roundLabel(ri, totalRounds);
    const matchCount = bracketSize / Math.pow(2, ri + 1);
    for (let mi = 0; mi < matchCount; mi++) {
      const s = matchStates[ri][mi];
      const nextRi = ri + 1;
      const nextMi = Math.floor(mi / 2);
      const nextMatchId = nextRi < totalRounds ? matchIds[nextRi][nextMi] : null;
      const nextMatchSlot = (mi % 2 === 0) ? 1 : 2;

      insertRows.push({
        id:              s.id,
        tournament_id:   tournamentId,
        division_id:     divisionId,
        round:           label,
        match_number:    mi,
        team1_player_a:  s.p1?.playerUUID ?? null,
        team1_player_b:  s.p1?.partnerUUID ?? null,
        team2_player_a:  s.p2?.playerUUID ?? null,
        team2_player_b:  s.p2?.partnerUUID ?? null,
        winner:          s.byeCompleted ? s.winner : null,
        completed_at:    s.byeCompleted && s.winner != null ? now : null,
        next_match_id:   nextMatchId,
        next_match_slot: nextMatchId ? nextMatchSlot : null,
        court:           null,
        created_at:      now,
        updated_at:      now,
      });
    }
  }

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
    .select('winner, team1_player_a, team2_player_a')
    .eq('tournament_id', tournamentId);

  if (!data) return { total: 0, completed: 0, remaining: 0, completionPct: 0 };

  // Only count real matches (at least one participant)
  const real = data.filter(r => r.team1_player_a != null || r.team2_player_a != null);
  const total = real.length;
  const completed = real.filter(r => r.winner != null).length;
  const remaining = total - completed;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, remaining, completionPct };
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
