import type { RRRound } from './rrScheduleStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RRStanding = {
  playerId: string;
  playerName: string;
  dupr?: string;
  avatarInitials: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  winPercentage: number;
  rank: number;
};

// ─── Computation ─────────────────────────────────────────────────────────────

export function computeStandings(rounds: RRRound[]): RRStanding[] {
  const map = new Map<string, RRStanding>();

  function ensure(
    id: string, name: string, dupr: string | undefined, initials: string,
  ): void {
    if (!map.has(id)) {
      map.set(id, {
        playerId: id, playerName: name, dupr, avatarInitials: initials,
        matchesPlayed: 0, wins: 0, losses: 0,
        pointsFor: 0, pointsAgainst: 0,
        pointDifferential: 0, winPercentage: 0, rank: 0,
      });
    }
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      const p1 = match.player1;
      const p2 = match.player2;
      if (!p1 || !p2) continue;

      ensure(p1.id, p1.name, p1.dupr, p1.avatarInitials);
      ensure(p2.id, p2.name, p2.dupr, p2.avatarInitials);

      if (match.status !== 'completed') continue;
      if (match.score1 === undefined || match.score2 === undefined) continue;
      if (!match.winnerId) continue;

      const r1 = map.get(p1.id)!;
      const r2 = map.get(p2.id)!;

      r1.matchesPlayed++;
      r2.matchesPlayed++;
      r1.pointsFor     += match.score1;
      r1.pointsAgainst += match.score2;
      r2.pointsFor     += match.score2;
      r2.pointsAgainst += match.score1;

      if (match.winnerId === p1.id) {
        r1.wins++;
        r2.losses++;
      } else {
        r2.wins++;
        r1.losses++;
      }
    }
  }

  const standings = Array.from(map.values()).map(s => ({
    ...s,
    pointDifferential: s.pointsFor - s.pointsAgainst,
    winPercentage: s.matchesPlayed > 0 ? s.wins / s.matchesPlayed : 0,
  }));

  standings.sort((a, b) => {
    if (b.wins !== a.wins)                       return b.wins - a.wins;
    if (b.winPercentage !== a.winPercentage)      return b.winPercentage - a.winPercentage;
    if (b.pointDifferential !== a.pointDifferential) return b.pointDifferential - a.pointDifferential;
    if (b.pointsFor !== a.pointsFor)             return b.pointsFor - a.pointsFor;
    return a.playerName.localeCompare(b.playerName);
  });

  standings.forEach((s, i) => { s.rank = i + 1; });

  return standings;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function fmtDiff(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
