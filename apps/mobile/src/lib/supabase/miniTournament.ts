import { supabase } from '@/lib/supabase';
import type { Tables } from '@shared/database.types';
import type { BMatch, BPlayer } from '@/lib/bracketTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MtPlayMatch = Tables<'play_matches'>;

type ParticipantRow = {
  id: string;
  first_name: string;
  last_initial: string | null;
  self_rating: string | null;
};

export type MtBracketMatch = MtPlayMatch & {
  player_a: ParticipantRow | null;
  player_b: ParticipantRow | null;
};

export class BracketExistsError extends Error {
  constructor() {
    super('Bracket already exists for this event.');
    this.name = 'BracketExistsError';
  }
}

// ─── Participant → BPlayer ────────────────────────────────────────────────────

function toBPlayer(p: ParticipantRow, seed = 0): BPlayer {
  const initials = (p.first_name[0] ?? '').toUpperCase() + (p.last_initial ?? '').toUpperCase();
  return {
    id:             p.id,
    name:           p.last_initial ? `${p.first_name} ${p.last_initial}.` : p.first_name,
    seed,
    dupr:           p.self_rating ?? '—',
    city:           '—',
    avatarInitials: initials || '?',
  };
}

// ─── Bracket algorithm helpers ────────────────────────────────────────────────

function smallestPow2(n: number): number {
  let p = 4;
  while (p < n) p *= 2;
  return Math.min(p, 32);
}

// Seeding positions for standard bracket draw (1 vs. n, then recursive).
function bracketPositions(n: number): number[] {
  if (n === 2) return [1, 2];
  const prev = bracketPositions(n / 2);
  return prev.flatMap(seed => [seed, n + 1 - seed]);
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ─── generateMiniTournamentBracket ───────────────────────────────────────────
// Reads play_participants, builds a single-elimination bracket, and inserts all
// rounds into play_matches — including future-round placeholder rows with null
// player_a_id/player_b_id. Winner advancement fills those slots via
// saveMiniTournamentScore using pure index arithmetic:
//   next_round = round + 1
//   next_match = floor(match_number / 2)
//   slot       = player_a if (match_number % 2 === 0) else player_b

export async function generateMiniTournamentBracket(
  eventId: string,
  courts = 4,
): Promise<MtBracketMatch[]> {
  // 1. Load participants (seeded by join order)
  const { data: pData, error: pErr } = await supabase
    .from('play_participants')
    .select('id, first_name, last_initial, self_rating')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (pErr) throw pErr;
  const participants: ParticipantRow[] = pData ?? [];

  if (participants.length < 2) {
    throw new Error(`At least 2 participants required. Currently: ${participants.length}.`);
  }

  // 2. Guard: abort if bracket already exists
  const { count, error: cErr } = await supabase
    .from('play_matches')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (cErr) throw cErr;
  if ((count ?? 0) > 0) throw new BracketExistsError();

  // 3. Bracket sizing
  const bracketSize = smallestPow2(participants.length);
  const totalRounds = Math.log2(bracketSize);
  const positions   = bracketPositions(bracketSize);

  // 4. Slots: participants + BYE padding (null = BYE)
  const slots: (ParticipantRow | null)[] = [
    ...participants,
    ...Array<null>(bracketSize - participants.length).fill(null),
  ];

  // Apply seeded draw order: position[i] is 1-indexed seed
  const orderedSlots = positions.map(pos => slots[pos - 1] ?? null);

  // 5. Pre-assign UUIDs to every match slot across all rounds
  const matchIds: Record<number, Record<number, string>> = {};
  for (let ri = 0; ri < totalRounds; ri++) {
    matchIds[ri] = {};
    const cnt = bracketSize / Math.pow(2, ri + 1);
    for (let mi = 0; mi < cnt; mi++) matchIds[ri][mi] = generateUUID();
  }

  // 6. Match state tracking
  type MS = { id: string; p1: ParticipantRow | null; p2: ParticipantRow | null; winner: 1 | 2 | null; byeCompleted: boolean };
  const st: Record<number, Record<number, MS>> = {};
  for (let ri = 0; ri < totalRounds; ri++) {
    st[ri] = {};
    const cnt = bracketSize / Math.pow(2, ri + 1);
    for (let mi = 0; mi < cnt; mi++) st[ri][mi] = { id: matchIds[ri][mi], p1: null, p2: null, winner: null, byeCompleted: false };
  }

  // Fill first round
  const r1 = bracketSize / 2;
  for (let mi = 0; mi < r1; mi++) {
    st[0][mi].p1 = orderedSlots[mi * 2]     ?? null;
    st[0][mi].p2 = orderedSlots[mi * 2 + 1] ?? null;
  }

  function advance(ri: number, mi: number, winner: ParticipantRow, slot: 1 | 2) {
    st[ri][mi].winner = slot;
    st[ri][mi].byeCompleted = true;
    const nri = ri + 1;
    if (nri >= totalRounds) return;
    const nmi = Math.floor(mi / 2);
    if (mi % 2 === 0) st[nri][nmi].p1 = winner;
    else               st[nri][nmi].p2 = winner;
  }

  // Auto-advance BYEs in first round
  for (let mi = 0; mi < r1; mi++) {
    const s = st[0][mi];
    if (s.p1 && !s.p2)         advance(0, mi, s.p1, 1);
    else if (!s.p1 && s.p2)    advance(0, mi, s.p2, 2);
    else if (!s.p1 && !s.p2)   s.byeCompleted = true;
  }

  // Cascade BYEs through subsequent rounds
  let changed = true;
  while (changed) {
    changed = false;
    for (let ri = 1; ri < totalRounds; ri++) {
      const cnt = bracketSize / Math.pow(2, ri + 1);
      for (let mi = 0; mi < cnt; mi++) {
        const s = st[ri][mi];
        if (s.byeCompleted) continue;
        if (s.p1 && !s.p2)       { advance(ri, mi, s.p1, 1); changed = true; }
        else if (!s.p1 && s.p2)  { advance(ri, mi, s.p2, 2); changed = true; }
        else if (!s.p1 && !s.p2) { s.byeCompleted = true; changed = true; }
      }
    }
  }

  // 7. Build insert rows for all rounds (future rounds have null player IDs)
  const now = new Date().toISOString();
  const insertRows: {
    id: string; event_id: string;
    round: number; match_number: number; court: number | null;
    player_a_id: string | null; player_b_id: string | null;
    winner: number | null; score_a: null; score_b: null; updated_at: string;
  }[] = [];

  for (let ri = 0; ri < totalRounds; ri++) {
    const cnt = bracketSize / Math.pow(2, ri + 1);
    for (let mi = 0; mi < cnt; mi++) {
      const s = st[ri][mi];
      insertRows.push({
        id:           s.id,
        event_id:     eventId,
        round:        ri + 1,            // 1-indexed
        match_number: mi,                // 0-indexed position within round
        court:        (mi % courts) + 1, // 1-indexed court
        player_a_id:  s.p1?.id ?? null,
        player_b_id:  s.p2?.id ?? null,
        winner:       s.byeCompleted ? s.winner : null,
        score_a:      null,
        score_b:      null,
        updated_at:   now,
      });
    }
  }

  const { error: iErr } = await supabase.from('play_matches').insert(insertRows);
  if (iErr) throw iErr;

  return fetchMiniTournamentMatches(eventId);
}

// ─── fetchMiniTournamentMatches ───────────────────────────────────────────────
// Two-query approach: play_matches has four FKs to play_participants, causing
// PostgREST FK-join ambiguity. Fetch matches + participants separately, merge in TS.

export async function fetchMiniTournamentMatches(
  eventId: string,
): Promise<MtBracketMatch[]> {
  const [matchRes, partRes] = await Promise.all([
    supabase
      .from('play_matches')
      .select('*')
      .eq('event_id', eventId)
      .order('round',        { ascending: true })
      .order('match_number', { ascending: true }),
    supabase
      .from('play_participants')
      .select('id, first_name, last_initial, self_rating')
      .eq('event_id', eventId),
  ]);

  if (matchRes.error) throw matchRes.error;
  if (partRes.error)  throw partRes.error;

  const pMap = new Map<string, ParticipantRow>();
  for (const p of partRes.data ?? []) pMap.set(p.id, p);

  return (matchRes.data ?? []).map(m => ({
    ...m,
    player_a: m.player_a_id ? (pMap.get(m.player_a_id) ?? null) : null,
    player_b: m.player_b_id ? (pMap.get(m.player_b_id) ?? null) : null,
  }));
}

// ─── sbMatchesToBracket ───────────────────────────────────────────────────────
// Converts Supabase match rows into BMatch[][] (existing bracket UI shape).
// round (1-indexed DB) → roundIdx (0-indexed array position).
// match_number (0-indexed) → matchIdx.

export function sbMatchesToBracket(matches: MtBracketMatch[]): BMatch[][] {
  const roundMap = new Map<number, MtBracketMatch[]>();
  for (const m of matches) {
    const bucket = roundMap.get(m.round) ?? [];
    bucket.push(m);
    roundMap.set(m.round, bucket);
  }

  const sortedRoundNums = [...roundMap.keys()].sort((a, b) => a - b);

  return sortedRoundNums.map((roundNumber, roundIdx) => {
    const roundMatches = (roundMap.get(roundNumber) ?? [])
      .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));

    return roundMatches.map(m => {
      const p1: BPlayer | null = m.player_a ? toBPlayer(m.player_a) : null;
      const p2: BPlayer | null = m.player_b ? toBPlayer(m.player_b) : null;

      // A BYE match has winner set but no scores (auto-advanced at generation time)
      const isScored      = m.score_a != null && m.score_b != null;
      const isByeComplete = m.winner != null && !isScored;
      const status: 'completed' | 'pending' = (isScored || isByeComplete) ? 'completed' : 'pending';

      const winnerId =
        m.winner === 1 ? (m.player_a_id ?? undefined) :
        m.winner === 2 ? (m.player_b_id ?? undefined) :
        undefined;

      return {
        id:       m.id,
        roundIdx,
        matchIdx: m.match_number ?? 0,
        player1:  p1,
        player2:  p2,
        court:    m.court != null ? `Court ${m.court}` : undefined,
        status,
        winnerId,
        score1:   m.score_a ?? undefined,
        score2:   m.score_b ?? undefined,
      } satisfies BMatch;
    });
  });
}

// ─── saveMiniTournamentScore ──────────────────────────────────────────────────
// Writes score + winner, then advances the winner player ID into the appropriate
// slot of the next-round match (derived from round + match_number arithmetic).

export async function saveMiniTournamentScore(
  matchId: string,
  scoreA: number,
  scoreB: number,
): Promise<void> {
  if (scoreA < 0 || scoreB < 0) throw new Error('Scores cannot be negative.');
  if (scoreA === scoreB)        throw new Error('Scores cannot be tied.');

  // Fetch current match to derive next-round target
  const { data: cur, error: fetchErr } = await supabase
    .from('play_matches')
    .select('round, match_number, player_a_id, player_b_id, event_id')
    .eq('id', matchId)
    .single();

  if (fetchErr || !cur) throw fetchErr ?? new Error('Match not found.');

  const winner = scoreA > scoreB ? 1 : 2;

  // Update score on current match
  const { error: updateErr } = await supabase
    .from('play_matches')
    .update({ score_a: scoreA, score_b: scoreB, winner, updated_at: new Date().toISOString() })
    .eq('id', matchId);

  if (updateErr) throw updateErr;

  // Advance winner to next round (no-ops silently if there is no next round)
  const mn = cur.match_number;
  if (mn != null) {
    const winnerId       = winner === 1 ? cur.player_a_id : cur.player_b_id;
    const nextRound      = cur.round + 1;
    const nextMatchNum   = Math.floor(mn / 2);
    const isSlotA        = mn % 2 === 0;

    const slotUpdate = isSlotA
      ? { player_a_id: winnerId, updated_at: new Date().toISOString() }
      : { player_b_id: winnerId, updated_at: new Date().toISOString() };

    await supabase
      .from('play_matches')
      .update(slotUpdate)
      .eq('event_id', cur.event_id)
      .eq('round',        nextRound)
      .eq('match_number', nextMatchNum);
  }
}

// ─── deleteMiniTournamentBracket ──────────────────────────────────────────────

export async function deleteMiniTournamentBracket(eventId: string): Promise<void> {
  const { error } = await supabase.from('play_matches').delete().eq('event_id', eventId);
  if (error) throw error;
}
