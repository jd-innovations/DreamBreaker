// Live division leaderboard, shared by mobile and web so both show the same
// standings. Pure: give it one division's matches (pool and elimination, as
// stored in bracket_matches), get back every team's placing, status and
// record. Updates as scores come in; nothing is stored.
//
// Placing rules (owner, 2026-09-28):
//   Final:          winner 1st, loser 2nd.
//   3rd-place match: winner 3rd, loser 4th. Without one, both semifinal losers
//                   are T3.
//   Earlier rounds: a round with M matches places its losers tied at M + 1
//                   (quarterfinals T5, round of 16 T9, ...).
//   Pools:          teams that didn't reach the bracket rank below every
//                   bracket placing, by record.
//   Ties are ordered by point difference, then points scored.
// Byes and walkovers (a match with only one team) count for nobody's record.

import type { TeamPerson } from './teamNames';

export type LeaderboardMatch = {
  id: string;
  round: string;            // round_label: pool | r64 | r32 | r16 | qf | sf | bronze | final
  poolLabel: string | null; // set on pool-play matches
  matchNumber: number;
  /** Team identity: its member ids (profile or guest), any order. Empty = no team yet. */
  team1: string[];
  team2: string[];
  team1Name: string | null;
  team2Name: string | null;
  /** Each side's players, for display (teamNames.ts). Optional: older callers omit it. */
  team1People?: TeamPerson[];
  team2People?: TeamPerson[];
  score1: number | null;
  score2: number | null;
  winner: 1 | 2 | null;
  completed: boolean;
  court: string | null;
};

export type LeaderboardEntry = {
  key: string;
  name: string;
  members: string[];
  /** The team's players, for display (teamNames.ts); empty when the caller gave none. */
  people: TeamPerson[];
  /** 'in' = still playing for a better place; 'placed' = final placing known; 'pool' = out in pools. */
  status: 'in' | 'placed' | 'pool';
  place: number | null;
  /** "Champion", "2nd", "3rd", "4th", "T3", "T5", ... or null while still in. */
  placeLabel: string | null;
  /** While still in: the round of their next match, e.g. "Semifinals", and its court. */
  currentRound: string | null;
  onCourt: string | null;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
};

const ROUND_ORDER: Record<string, number> = {
  pool: 0, r64: 1, r32: 2, r16: 3, qf: 4, sf: 5, bronze: 6, final: 7,
};

export function leaderboardRoundName(round: string, poolLabel: string | null): string {
  if (poolLabel) return `Pool ${poolLabel}`;
  switch (round) {
    case 'final': return 'Final';
    case 'bronze': return '3rd Place';
    case 'sf': return 'Semifinals';
    case 'qf': return 'Quarterfinals';
    case 'r16': return 'Round of 16';
    case 'r32': return 'Round of 32';
    case 'r64': return 'Round of 64';
    default: return 'Early round';
  }
}

const teamKey = (members: string[]) => [...members].sort().join('+');

export function divisionLeaderboard(matches: LeaderboardMatch[]): LeaderboardEntry[] {
  const teams = new Map<string, LeaderboardEntry>();
  const touch = (members: string[], name: string | null, people: TeamPerson[] | undefined): LeaderboardEntry | null => {
    if (members.length === 0) return null;
    const key = teamKey(members);
    let t = teams.get(key);
    if (!t) {
      t = {
        key, name: name ?? 'TBD', members: [...members], people: people ?? [], status: 'in', place: null, placeLabel: null,
        currentRound: null, onCourt: null, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0,
      };
      teams.set(key, t);
    } else if (name && t.name === 'TBD') {
      t.name = name;
    }
    if (t.people.length === 0 && people?.length) t.people = people;
    return t;
  };

  const elim = matches.filter(m => !m.poolLabel);
  const hasBracket = elim.length > 0;
  const roundSize = new Map<string, number>();
  for (const m of elim) roundSize.set(m.round, (roundSize.get(m.round) ?? 0) + 1);
  const hasBronze = roundSize.has('bronze');
  const inBracket = new Set<string>();

  for (const m of matches) {
    const a = touch(m.team1, m.team1Name, m.team1People);
    const b = touch(m.team2, m.team2Name, m.team2People);
    if (!m.poolLabel) {
      if (a) inBracket.add(a.key);
      if (b) inBracket.add(b.key);
    }
    // Only a real, finished match counts: both teams present and a winner.
    if (!a || !b || !m.completed || !m.winner) continue;
    const s1 = m.score1 ?? 0;
    const s2 = m.score2 ?? 0;
    a.pointsFor += s1; a.pointsAgainst += s2;
    b.pointsFor += s2; b.pointsAgainst += s1;
    const [w, l] = m.winner === 1 ? [a, b] : [b, a];
    w.wins += 1; l.losses += 1;

    if (m.poolLabel) continue;
    // Placings decided by elimination results.
    if (m.round === 'final') {
      w.place = 1; w.placeLabel = 'Champion'; w.status = 'placed';
      l.place = 2; l.placeLabel = '2nd'; l.status = 'placed';
    } else if (m.round === 'bronze') {
      w.place = 3; w.placeLabel = '3rd'; w.status = 'placed';
      l.place = 4; l.placeLabel = '4th'; l.status = 'placed';
    } else if (m.round === 'sf') {
      if (!hasBronze) { l.place = 3; l.placeLabel = 'T3'; l.status = 'placed'; }
    } else {
      const place = (roundSize.get(m.round) ?? 1) + 1;
      l.place = place; l.placeLabel = `T${place}`; l.status = 'placed';
    }
  }

  // Still in: the next unfinished match each remaining team appears in.
  const upcoming = [...matches]
    .filter(m => !m.completed)
    .sort((x, y) => (ROUND_ORDER[x.round] ?? 9) - (ROUND_ORDER[y.round] ?? 9) || x.matchNumber - y.matchNumber);
  for (const t of teams.values()) {
    t.pointDiff = t.pointsFor - t.pointsAgainst;
    if (t.status !== 'in') continue;
    const next = upcoming.find(m => teamKey(m.team1) === t.key || teamKey(m.team2) === t.key);
    if (next) {
      t.currentRound = leaderboardRoundName(next.round, next.poolLabel);
      t.onCourt = next.court;
    } else if (hasBracket && !inBracket.has(t.key)) {
      // Pools are over for this team and it didn't reach the bracket.
      t.status = 'pool';
      t.placeLabel = 'Pool stage';
    }
  }

  const byRecord = (x: LeaderboardEntry, y: LeaderboardEntry) =>
    y.pointDiff - x.pointDiff || y.pointsFor - x.pointsFor || x.name.localeCompare(y.name);
  const deepest = (t: LeaderboardEntry) => {
    const r = upcoming.find(m => teamKey(m.team1) === t.key || teamKey(m.team2) === t.key);
    return r ? (ROUND_ORDER[r.round] ?? 0) : -1;
  };

  const still = [...teams.values()].filter(t => t.status === 'in')
    .sort((x, y) => deepest(y) - deepest(x) || y.wins - x.wins || byRecord(x, y));
  const placed = [...teams.values()].filter(t => t.status === 'placed')
    .sort((x, y) => (x.place ?? 0) - (y.place ?? 0) || byRecord(x, y));
  const pool = [...teams.values()].filter(t => t.status === 'pool')
    .sort((x, y) => y.wins - x.wins || byRecord(x, y));
  return [...still, ...placed, ...pool];
}

