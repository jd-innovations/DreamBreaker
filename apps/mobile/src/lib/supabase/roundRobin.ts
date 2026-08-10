import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import type { RRRound, RRMatch, RRParticipant } from '@/lib/rrScheduleStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayMatch = Tables<'play_matches'>;

// Participant shape as returned from play_participants join
type ParticipantRow = {
  id: string;
  first_name: string;
  last_initial: string | null;
  self_rating: string | null;
};

// play_matches row with inline player joins
export type PlayMatchWithPlayers = PlayMatch & {
  player_a: ParticipantRow | null;
  player_b: ParticipantRow | null;
};

// Thrown when a schedule already exists and caller must confirm regeneration
export class ScheduleExistsError extends Error {
  constructor() {
    super('Schedule already exists for this event.');
    this.name = 'ScheduleExistsError';
  }
}

// ─── Participant → RRParticipant ──────────────────────────────────────────────

function participantToRR(p: ParticipantRow): RRParticipant {
  const initials = (p.first_name[0] ?? '').toUpperCase() +
                   (p.last_initial ?? '').toUpperCase();
  return {
    id:             p.id,
    name:           p.last_initial
                      ? `${p.first_name} ${p.last_initial}.`
                      : p.first_name,
    dupr:           p.self_rating ?? undefined,
    avatarInitials: initials || '?',
  };
}

// ─── Circle-method schedule algorithm ────────────────────────────────────────
// Identical logic to buildRRSchedule in rrScheduleStore — kept here to avoid
// importing mutable store state into the Supabase service layer.

const BYE: RRParticipant = { id: 'bye', name: 'BYE', avatarInitials: '—' };

function circleSchedule(players: RRParticipant[], courts = 4): RRRound[] {
  const isOdd = players.length % 2 !== 0;
  const ring   = isOdd ? [...players, BYE] : [...players];
  const n      = ring.length;
  const rounds: RRRound[] = [];

  for (let rIdx = 0; rIdx < n - 1; rIdx++) {
    const matches: RRMatch[] = [];
    let matchIdx = 0;
    let byePlayerId: string | undefined;
    let byePlayerName: string | undefined;

    for (let i = 0; i < n / 2; i++) {
      const p1 = ring[i];
      const p2 = ring[n - 1 - i];

      if (p1.id === 'bye') { byePlayerId = p2.id; byePlayerName = p2.name; continue; }
      if (p2.id === 'bye') { byePlayerId = p1.id; byePlayerName = p1.name; continue; }

      matches.push({
        id:          `sb-r${rIdx + 1}-m${matchIdx + 1}`,
        roundNumber: rIdx + 1,
        courtNumber: (matchIdx % courts) + 1,
        player1:     p1,
        player2:     p2,
        status:      'scheduled',
      });
      matchIdx++;
    }

    rounds.push({
      id:            `round-${rIdx + 1}`,
      roundNumber:   rIdx + 1,
      matches,
      byePlayerId,
      byePlayerName,
    });

    // Rotate ring: fix position 0, rotate the rest
    const last = ring.pop()!;
    ring.splice(1, 0, last);
  }

  return rounds;
}

// ─── generateRoundRobinSchedule ───────────────────────────────────────────────
// Reads play_participants for the event, runs the circle algorithm, and bulk-
// inserts into play_matches. Throws ScheduleExistsError if rows already exist
// (caller should prompt the user to confirm regeneration via deleteRoundRobinSchedule
// then re-call this function).

export async function generateRoundRobinSchedule(
  eventId: string,
  courts = 4,
): Promise<PlayMatch[]> {
  // 1. Load participants
  const { data: pData, error: pErr } = await supabase
    .from('play_participants')
    .select('id, first_name, last_initial, self_rating')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (pErr) throw pErr;
  const participants: ParticipantRow[] = pData ?? [];

  if (participants.length < 4) {
    throw new Error(
      `At least 4 participants are required. Currently: ${participants.length}.`,
    );
  }

  // 2. Guard: abort if schedule already exists
  const { count, error: cErr } = await supabase
    .from('play_matches')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (cErr) throw cErr;
  if ((count ?? 0) > 0) throw new ScheduleExistsError();

  // 3. Generate rounds
  const rrPlayers = participants.map(participantToRR);
  const rounds    = circleSchedule(rrPlayers, courts);

  // 4. Build insert rows
  // BYE rounds: insert a row with player_b_id = NULL so we can recover the BYE
  // player for display without extra storage.
  const insertRows: {
    event_id: string;
    round: number;
    match_number: number | null;
    court: number | null;
    player_a_id: string | null;
    player_b_id: string | null;
  }[] = [];

  for (const round of rounds) {
    for (let mIdx = 0; mIdx < round.matches.length; mIdx++) {
      const m = round.matches[mIdx];
      insertRows.push({
        event_id:     eventId,
        round:        round.roundNumber,
        match_number: mIdx + 1,
        court:        m.courtNumber,
        player_a_id:  m.player1?.id ?? null,
        player_b_id:  m.player2?.id ?? null,
      });
    }

    // Record the BYE player as a row with player_b_id = NULL
    if (round.byePlayerId && round.byePlayerId !== 'bye') {
      insertRows.push({
        event_id:     eventId,
        round:        round.roundNumber,
        match_number: null,       // null signals BYE row (not a playable match)
        court:        null,
        player_a_id:  round.byePlayerId,
        player_b_id:  null,
      });
    }
  }

  const { data: inserted, error: iErr } = await supabase
    .from('play_matches')
    .insert(insertRows)
    .select();

  if (iErr) throw iErr;
  return inserted ?? [];
}

// ─── fetchRoundRobinMatches ───────────────────────────────────────────────────
// Returns all matches for an event with participant name data merged in.
// Two-query approach: avoids PostgREST ambiguous FK hints for multiple FKs
// pointing to the same table (play_matches has four FKs to play_participants).

export async function fetchRoundRobinMatches(
  eventId: string,
): Promise<PlayMatchWithPlayers[]> {
  const [matchRes, partRes] = await Promise.all([
    supabase
      .from('play_matches')
      .select('*')
      .eq('event_id', eventId)
      .order('round', { ascending: true })
      .order('match_number', { ascending: true, nullsFirst: false }),
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

// ─── fetchRoundRobinMatchById ─────────────────────────────────────────────────
// Fetches a single match row with player data merged in.
// Used by score-entry screen to load match details.

export async function fetchRoundRobinMatchById(
  matchId: string,
  eventId: string,
): Promise<PlayMatchWithPlayers | null> {
  const [matchRes, partRes] = await Promise.all([
    supabase
      .from('play_matches')
      .select('*')
      .eq('id', matchId)
      .maybeSingle(),
    supabase
      .from('play_participants')
      .select('id, first_name, last_initial, self_rating')
      .eq('event_id', eventId),
  ]);

  if (matchRes.error) throw matchRes.error;
  if (!matchRes.data) return null;
  if (partRes.error)  throw partRes.error;

  const pMap = new Map<string, ParticipantRow>();
  for (const p of partRes.data ?? []) pMap.set(p.id, p);

  const m = matchRes.data;
  return {
    ...m,
    player_a: m.player_a_id ? (pMap.get(m.player_a_id) ?? null) : null,
    player_b: m.player_b_id ? (pMap.get(m.player_b_id) ?? null) : null,
  };
}

// ─── saveRoundRobinScore ──────────────────────────────────────────────────────
// Writes score_a, score_b, and winner (1=player_a, 2=player_b) to play_matches.
// Validates no tie and no negatives. Updated_at is set automatically by trigger
// but we set it explicitly for immediate consistency.

export async function saveRoundRobinScore(
  matchId: string,
  scoreA: number,
  scoreB: number,
): Promise<void> {
  if (scoreA < 0 || scoreB < 0)
    throw new Error('Scores cannot be negative.');
  if (scoreA === scoreB)
    throw new Error('Scores cannot be tied. A winner is required.');

  const winner = scoreA > scoreB ? 1 : 2;

  const { error } = await supabase
    .from('play_matches')
    .update({
      score_a:    scoreA,
      score_b:    scoreB,
      winner,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) throw error;
}

// ─── clearRoundRobinScore ─────────────────────────────────────────────────────
// Resets score_a, score_b, and winner back to NULL for a match.

export async function clearRoundRobinScore(matchId: string): Promise<void> {
  const { error } = await supabase
    .from('play_matches')
    .update({
      score_a:    null,
      score_b:    null,
      winner:     null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) throw error;
}

// ─── deleteRoundRobinSchedule ─────────────────────────────────────────────────
// Removes all play_matches rows for an event. Call before regenerating.

export async function deleteRoundRobinSchedule(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('play_matches')
    .delete()
    .eq('event_id', eventId);

  if (error) throw error;
}

// ─── sbMatchesToRRRounds ──────────────────────────────────────────────────────
// Converts play_matches rows (with player joins) into the RRRound[] shape that
// the existing MatchCard / RoundSection UI components consume.

export function sbMatchesToRRRounds(matches: PlayMatchWithPlayers[]): RRRound[] {
  // Group by round number
  const roundMap = new Map<number, PlayMatchWithPlayers[]>();
  for (const m of matches) {
    const bucket = roundMap.get(m.round) ?? [];
    bucket.push(m);
    roundMap.set(m.round, bucket);
  }

  const rounds: RRRound[] = [];

  for (const [roundNumber, roundMatches] of [...roundMap.entries()].sort(([a], [b]) => a - b)) {
    let byePlayerId: string | undefined;
    let byePlayerName: string | undefined;
    const playableMatches: RRMatch[] = [];

    for (const m of roundMatches) {
      // BYE row: match_number is null and player_b_id is null
      if (m.match_number == null && m.player_b_id == null && m.player_a_id != null) {
        byePlayerId  = m.player_a_id;
        byePlayerName = m.player_a
          ? (m.player_a.last_initial
              ? `${m.player_a.first_name} ${m.player_a.last_initial}.`
              : m.player_a.first_name)
          : 'Unknown';
        continue;
      }

      const p1: RRParticipant | null = m.player_a ? participantToRR(m.player_a) : null;
      const p2: RRParticipant | null = m.player_b ? participantToRR(m.player_b) : null;

      const isCompleted = m.score_a != null && m.score_b != null;
      const winnerId =
        m.winner === 1 ? (p1?.id ?? undefined) :
        m.winner === 2 ? (p2?.id ?? undefined) : undefined;

      playableMatches.push({
        id:            m.id,
        roundNumber,
        courtNumber:   m.court ?? 1,
        player1:       p1,
        player2:       p2,
        score1:        m.score_a ?? undefined,
        score2:        m.score_b ?? undefined,
        winnerId,
        status:        isCompleted ? 'completed' : 'scheduled',
      });
    }

    rounds.push({
      id:            `round-${roundNumber}`,
      roundNumber,
      matches:       playableMatches,
      byePlayerId,
      byePlayerName,
    });
  }

  return rounds;
}
