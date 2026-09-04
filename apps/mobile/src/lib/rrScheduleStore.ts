// ─── Types ───────────────────────────────────────────────────────────────────

export type RRParticipant = {
  id: string;
  name: string;
  dupr?: string;
  avatarInitials: string;
};

export type RRMatch = {
  id: string;
  roundNumber: number;
  courtNumber: number;
  scheduledTime?: string;
  player1: RRParticipant | null;
  player2: RRParticipant | null;
  score1?: number;
  score2?: number;
  winnerId?: string;
  status: 'scheduled' | 'completed';
};

export type RRRound = {
  id: string;
  roundNumber: number;
  matches: RRMatch[];
  byePlayerId?: string;
  byePlayerName?: string;
};

// ─── Store ───────────────────────────────────────────────────────────────────

let _schedules: Record<string, RRRound[]> = {};

export function setSchedule(tournamentId: string, rounds: RRRound[]): void {
  _schedules[tournamentId] = rounds;
}

export function getSchedule(tournamentId: string): RRRound[] | null {
  return _schedules[tournamentId] ?? null;
}

export function clearSchedule(tournamentId: string): void {
  delete _schedules[tournamentId];
}

export function hasSchedule(tournamentId: string): boolean {
  return tournamentId in _schedules && _schedules[tournamentId].length > 0;
}

export function saveMatchResult(
  tournamentId: string,
  matchId: string,
  score1: number,
  score2: number,
): void {
  const rounds = _schedules[tournamentId];
  if (!rounds) return;

  for (const round of rounds) {
    const idx = round.matches.findIndex(m => m.id === matchId);
    if (idx === -1) continue;

    const match = round.matches[idx];
    if (!match.player1 || !match.player2) return;

    const winnerId = score1 > score2 ? match.player1.id : match.player2.id;
    round.matches[idx] = {
      ...match,
      score1,
      score2,
      winnerId,
      status: 'completed',
    };
    return;
  }
}

// ─── Mock Players ─────────────────────────────────────────────────────────────

const MOCK_PLAYERS_16: RRParticipant[] = [
  { id: 'p1',  name: 'Sarah M.',    dupr: '4.2', avatarInitials: 'SM' },
  { id: 'p2',  name: 'Mike R.',     dupr: '4.0', avatarInitials: 'MR' },
  { id: 'p3',  name: 'Jenna L.',    dupr: '3.8', avatarInitials: 'JL' },
  { id: 'p4',  name: 'Carlos T.',   dupr: '4.1', avatarInitials: 'CT' },
  { id: 'p5',  name: 'Amy B.',      dupr: '3.9', avatarInitials: 'AB' },
  { id: 'p6',  name: 'Derek H.',    dupr: '4.3', avatarInitials: 'DH' },
  { id: 'p7',  name: 'Priya N.',    dupr: '3.7', avatarInitials: 'PN' },
  { id: 'p8',  name: 'Tom W.',      dupr: '4.0', avatarInitials: 'TW' },
  { id: 'p9',  name: 'Lisa K.',     dupr: '3.9', avatarInitials: 'LK' },
  { id: 'p10', name: 'James F.',    dupr: '4.2', avatarInitials: 'JF' },
  { id: 'p11', name: 'Rachel C.',   dupr: '3.8', avatarInitials: 'RC' },
  { id: 'p12', name: 'Omar S.',     dupr: '4.1', avatarInitials: 'OS' },
  { id: 'p13', name: 'Megan V.',    dupr: '3.6', avatarInitials: 'MV' },
  { id: 'p14', name: 'Brandon P.',  dupr: '4.0', avatarInitials: 'BP' },
  { id: 'p15', name: 'Tina J.',     dupr: '3.9', avatarInitials: 'TJ' },
  { id: 'p16', name: 'Kevin D.',    dupr: '4.1', avatarInitials: 'KD' },
];

export const MOCK_PLAYER_SETS: Record<4 | 8 | 12 | 16, RRParticipant[]> = {
  4:  MOCK_PLAYERS_16.slice(0, 4),
  8:  MOCK_PLAYERS_16.slice(0, 8),
  12: MOCK_PLAYERS_16.slice(0, 12),
  16: MOCK_PLAYERS_16,
};

export const DEFAULT_MOCK_PLAYERS = MOCK_PLAYER_SETS[8];

// ─── Schedule Algorithm ───────────────────────────────────────────────────────

const BYE_PARTICIPANT: RRParticipant = {
  id: 'bye',
  name: 'BYE',
  avatarInitials: '—',
};

const BASE_HOUR = 18; // 6:00 PM start

function mockTime(roundIdx: number, matchIdx: number): string {
  // Each round is 45 min apart; within a round courts run concurrently
  const totalMinutes = BASE_HOUR * 60 + roundIdx * 45;
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m === 0 ? '00' : String(m).padStart(2, '0');
  return `${displayH}:${displayM} ${period}`;
}

export function buildRRSchedule(
  players: RRParticipant[],
  courts: number = 4,
): RRRound[] {
  const isOdd = players.length % 2 !== 0;
  const ring = isOdd ? [...players, BYE_PARTICIPANT] : [...players];
  const n = ring.length; // always even
  const numRounds = n - 1;

  const rounds: RRRound[] = [];

  for (let rIdx = 0; rIdx < numRounds; rIdx++) {
    const matches: RRMatch[] = [];
    let matchIdx = 0;
    let byePlayerId: string | undefined;
    let byePlayerName: string | undefined;

    for (let i = 0; i < n / 2; i++) {
      const p1 = ring[i];
      const p2 = ring[n - 1 - i];

      // Record which player has the BYE this round
      if (p1.id === 'bye') { byePlayerId = p2.id; byePlayerName = p2.name; continue; }
      if (p2.id === 'bye') { byePlayerId = p1.id; byePlayerName = p1.name; continue; }

      const courtNumber = (matchIdx % courts) + 1;
      const time = mockTime(rIdx, matchIdx);

      matches.push({
        id:            `rr-r${rIdx + 1}-m${matchIdx + 1}`,
        roundNumber:   rIdx + 1,
        courtNumber,
        scheduledTime: time,
        player1:       p1,
        player2:       p2,
        status:        'scheduled',
      });
      matchIdx++;
    }

    rounds.push({
      id:          `round-${rIdx + 1}`,
      roundNumber: rIdx + 1,
      matches,
      byePlayerId,
      byePlayerName,
    });

    // Rotate: fix index 0, rotate the rest
    const last = ring.pop()!;
    ring.splice(1, 0, last);
  }

  return rounds;
}
