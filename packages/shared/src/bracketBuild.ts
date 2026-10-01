// Single-elimination bracket construction, shared by web and mobile so the two
// apps can never build a bracket differently. Pure: no database, no platform
// APIs. Callers insert the returned rows into bracket_matches.
//
// Moved from apps/mobile/src/lib/supabase/brackets.ts (createBracket) on
// 2026-09-28 for web parity (DIRECTOR_HUB_WEB_PARITY.md, W1). The bye rules
// below carry two fixes found on RATE LAS VEGAS OPEN - DEMO (2026-09-24):
// no size cap (divisions over 32 crashed), and a bye only cascades when the
// other side's whole subtree is empty.

export type BracketRoundLabel = 'pool' | 'r64' | 'r32' | 'r16' | 'qf' | 'sf' | 'bronze' | 'final';

/** One side of a match: a registered player/partner, or director-added guests. */
export type BracketTeam = {
  playerId: string | null;
  partnerId: string | null;
  playerGuestId: string | null;
  partnerGuestId: string | null;
};

export type BracketMatchInsert = {
  id: string;
  tournament_id: string;
  division_id: string;
  round: BracketRoundLabel;
  match_number: number;
  team1_player_a: string | null;
  team1_player_b: string | null;
  team1_guest_a: string | null;
  team1_guest_b: string | null;
  team2_player_a: string | null;
  team2_player_b: string | null;
  team2_guest_a: string | null;
  team2_guest_b: string | null;
  winner: 1 | 2 | null;
  completed_at: string | null;
  next_match_id: string | null;
  next_match_slot: 1 | 2 | null;
  /** Semifinals only: where the loser goes (the 3rd-place match). */
  loser_next_match_id: string | null;
  loser_next_match_slot: 1 | 2 | null;
  court: null;
  created_at: string;
  updated_at: string;
};

/** What activeTeamEntries needs to know about a registration. */
export type TeamEntryView = {
  /** The registrant: profile id or guest id. */
  self: string;
  /** Their partner: profile id or guest id; null for singles. */
  partner: string | null;
  status: string;
  registeredAt: string;
};

/**
 * A division's playable teams, one entry per real team, in registration order.
 * Only registered / checked-in entries count. A doubles team can exist as TWO
 * registration rows (one per member, each naming the other as partner) when a
 * tool registered it once per player; the unordered pair is the team's
 * identity, so the earlier row is kept. Found on RATE LAS VEGAS OPEN - DEMO
 * (2026-09-24): every doubles division had exactly twice its real team count.
 */
export function activeTeamEntries<T>(items: T[], view: (item: T) => TeamEntryView): T[] {
  const seen = new Set<string>();
  return [...items]
    .filter(i => {
      const s = view(i).status;
      return s === 'registered' || s === 'checked_in';
    })
    .sort((a, b) => new Date(view(a).registeredAt).getTime() - new Date(view(b).registeredAt).getTime())
    .filter(i => {
      const { self, partner } = view(i);
      if (!partner) return true;
      const key = [self, partner].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Smallest power of two >= n, at least 4. No upper cap on purpose: the old
 * cap of 32 produced a negative padding length for bigger divisions.
 * 'pool' is the round_label catch-all for rounds earlier than r64.
 */
export function bracketSizeFor(n: number): number {
  let p = 4;
  while (p < n) p *= 2;
  return p;
}

/** roundIndex 0 = earliest, totalRounds - 1 = final -> round_label enum. */
export function bracketRoundLabel(roundIndex: number, totalRounds: number): BracketRoundLabel {
  const fromEnd = totalRounds - 1 - roundIndex;
  if (fromEnd === 0) return 'final';
  if (fromEnd === 1) return 'sf';
  if (fromEnd === 2) return 'qf';
  if (fromEnd === 3) return 'r16';
  if (fromEnd === 4) return 'r32';
  if (fromEnd === 5) return 'r64';
  return 'pool';
}

/**
 * Standard bracket slot order for a power-of-two size, as seed numbers:
 * 4 -> [1,4,2,3], 8 -> [1,8,4,5,2,7,3,6]. Adjacent pairs are first-round
 * matches; the top two seeds can only meet in the final.
 */
export function bracketPositions(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const m = order.length * 2;
    order = order.flatMap(s => [s, m + 1 - s]);
  }
  return order;
}

/**
 * First-round slots for teams already in seed order (index 0 = seed 1):
 * standard placement, byes going to the top seeds.
 */
export function seededSlots<T>(teamsInSeedOrder: T[]): (T | null)[] {
  const size = bracketSizeFor(teamsInSeedOrder.length);
  return bracketPositions(size).map(seed => teamsInSeedOrder[seed - 1] ?? null);
}

/**
 * Every bracket_matches row for one division, from its first-round slots
 * (length a power of two >= 4, null = bye). Byes whose other side can never
 * produce an opponent are completed and advanced; a side with a real entrant
 * anywhere below it stays open until an actual score is entered.
 */
export function buildBracketMatchRows(input: {
  tournamentId: string;
  divisionId: string;
  slots: (BracketTeam | null)[];
  newId: () => string;
  now: string;
  /**
   * Add a 3rd-place (bronze) match between the semifinal losers. Default true.
   * Only built when both semifinals will have two real teams: with byes, one
   * semifinal can be a walkover, leaving nobody to lose it.
   */
  thirdPlace?: boolean;
}): BracketMatchInsert[] {
  const { tournamentId, divisionId, slots, newId, now } = input;
  const bracketSize = slots.length;
  if (bracketSize < 4 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new Error(`Bracket slots must be a power of two >= 4, got ${bracketSize}.`);
  }
  const totalRounds = Math.log2(bracketSize);

  type MatchState = {
    id: string;
    p1: BracketTeam | null;
    p2: BracketTeam | null;
    winner: 1 | 2 | null;
    byeCompleted: boolean;
    // Real entrants anywhere in this match's subtree. Tells a permanently
    // empty side (0) from one merely waiting on a match to be played (>= 1).
    realCount: number;
  };

  const states: MatchState[][] = [];
  for (let ri = 0; ri < totalRounds; ri++) {
    const count = bracketSize / Math.pow(2, ri + 1);
    states.push(Array.from({ length: count }, () => ({
      id: newId(), p1: null, p2: null, winner: null, byeCompleted: false, realCount: 0,
    })));
  }

  function advance(ri: number, mi: number, winner: BracketTeam, slot: 1 | 2) {
    states[ri][mi].winner = slot;
    states[ri][mi].byeCompleted = true;
    if (ri + 1 >= totalRounds) return;
    const next = states[ri + 1][Math.floor(mi / 2)];
    if (mi % 2 === 0) next.p1 = winner;
    else next.p2 = winner;
  }

  for (let mi = 0; mi < bracketSize / 2; mi++) {
    const s = states[0][mi];
    s.p1 = slots[mi * 2] ?? null;
    s.p2 = slots[mi * 2 + 1] ?? null;
    s.realCount = (s.p1 ? 1 : 0) + (s.p2 ? 1 : 0);
    if (s.p1 && !s.p2) advance(0, mi, s.p1, 1);
    else if (!s.p1 && s.p2) advance(0, mi, s.p2, 2);
    else if (!s.p1 && !s.p2) s.byeCompleted = true;
  }

  for (let ri = 1; ri < totalRounds; ri++) {
    for (let mi = 0; mi < states[ri].length; mi++) {
      const leftReal = states[ri - 1][mi * 2].realCount;
      const rightReal = states[ri - 1][mi * 2 + 1].realCount;
      const s = states[ri][mi];
      s.realCount = leftReal + rightReal;
      if (leftReal === 0 && rightReal === 0) s.byeCompleted = true;
      else if (rightReal === 0 && s.p1 && !s.p2) advance(ri, mi, s.p1, 1);
      else if (leftReal === 0 && !s.p1 && s.p2) advance(ri, mi, s.p2, 2);
    }
  }

  // Semifinals are the second-to-last round; each needs two real entrants
  // below it for a loser to exist.
  const sfRound = totalRounds - 2;
  const bronzeId = (input.thirdPlace ?? true) && sfRound >= 0
    && states[sfRound].every(s => s.realCount >= 2)
    ? newId()
    : null;

  const rows: BracketMatchInsert[] = [];
  for (let ri = 0; ri < totalRounds; ri++) {
    const label = bracketRoundLabel(ri, totalRounds);
    for (let mi = 0; mi < states[ri].length; mi++) {
      const s = states[ri][mi];
      const next = ri + 1 < totalRounds ? states[ri + 1][Math.floor(mi / 2)].id : null;
      rows.push({
        id: s.id,
        tournament_id: tournamentId,
        division_id: divisionId,
        round: label,
        match_number: mi,
        team1_player_a: s.p1?.playerId ?? null,
        team1_player_b: s.p1?.partnerId ?? null,
        team1_guest_a: s.p1?.playerGuestId ?? null,
        team1_guest_b: s.p1?.partnerGuestId ?? null,
        team2_player_a: s.p2?.playerId ?? null,
        team2_player_b: s.p2?.partnerId ?? null,
        team2_guest_a: s.p2?.playerGuestId ?? null,
        team2_guest_b: s.p2?.partnerGuestId ?? null,
        winner: s.byeCompleted ? s.winner : null,
        completed_at: s.byeCompleted && s.winner != null ? now : null,
        next_match_id: next,
        next_match_slot: next ? (mi % 2 === 0 ? 1 : 2) : null,
        loser_next_match_id: bronzeId && ri === sfRound ? bronzeId : null,
        loser_next_match_slot: bronzeId && ri === sfRound ? (mi % 2 === 0 ? 1 : 2) : null,
        court: null,
        created_at: now,
        updated_at: now,
      });
    }
  }
  if (bronzeId) {
    rows.push({
      id: bronzeId,
      tournament_id: tournamentId,
      division_id: divisionId,
      round: 'bronze',
      match_number: 0,
      team1_player_a: null, team1_player_b: null, team1_guest_a: null, team1_guest_b: null,
      team2_player_a: null, team2_player_b: null, team2_guest_a: null, team2_guest_b: null,
      winner: null,
      completed_at: null,
      next_match_id: null,
      next_match_slot: null,
      loser_next_match_id: null,
      loser_next_match_slot: null,
      court: null,
      created_at: now,
      updated_at: now,
    });
  }
  return rows;
}

/**
 * Seeds read back from a saved bracket's opening round, keyed by team.
 *
 * buildBracketMatchRows puts first-round slot i at standard position
 * bracketPositions(size)[i] (1v8, 4v5, ...), so a team's seed is its slot's
 * position. That only holds for brackets built with standard placement: with
 * N teams, exactly the slots for seeds 1..N are filled (byes on the top seeds).
 * Anything else (older or hand-built brackets) returns null rather than wrong
 * seeds. `opening` is the first round in match-number order; a side is a team
 * key, or null for an empty slot. Shared by web and mobile.
 */
export function openingRoundSeeds(
  opening: readonly { team1: string | null; team2: string | null }[],
): Map<string, number> | null {
  if (opening.length === 0) return null;
  const positions = bracketPositions(opening.length * 2);
  const slots = opening.flatMap(m => [m.team1, m.team2]);
  const teamCount = slots.filter(Boolean).length;
  if (slots.some((team, i) => !!team !== positions[i] <= teamCount)) return null;
  const seeds = new Map<string, number>();
  slots.forEach((team, i) => { if (team) seeds.set(team, positions[i]); });
  return seeds;
}
