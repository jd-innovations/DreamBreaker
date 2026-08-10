// ─── Types ───────────────────────────────────────────────────────────────────

export type RRPlayer = {
  id: string;
  name: string;
  dupr?: string;
  city?: string;
  avatarInitials: string;
  status: 'registered' | 'invited';
};

// ─── Store ───────────────────────────────────────────────────────────────────

let _rosters: Record<string, RRPlayer[]> = {};

export function setRoster(tournamentId: string, players: RRPlayer[]): void {
  _rosters[tournamentId] = [...players];
}

export function getRoster(tournamentId: string): RRPlayer[] {
  return _rosters[tournamentId] ?? [];
}

export function addPlayer(tournamentId: string, player: RRPlayer): void {
  if (!_rosters[tournamentId]) _rosters[tournamentId] = [];
  _rosters[tournamentId] = [..._rosters[tournamentId], player];
}

export function removePlayer(tournamentId: string, playerId: string): void {
  if (!_rosters[tournamentId]) return;
  _rosters[tournamentId] = _rosters[tournamentId].filter(p => p.id !== playerId);
}

export function clearRoster(tournamentId: string): void {
  _rosters[tournamentId] = [];
}

export function getRosterCount(tournamentId: string): number {
  return (_rosters[tournamentId] ?? []).length;
}

// ─── Mock Player Sets ─────────────────────────────────────────────────────────

const MOCK_POOL: Omit<RRPlayer, 'id' | 'status'>[] = [
  { name: 'Sarah M.',    dupr: '4.2', city: 'Lakewood Ranch', avatarInitials: 'SM' },
  { name: 'Mike R.',     dupr: '4.0', city: 'Sarasota',       avatarInitials: 'MR' },
  { name: 'Olivia H.',   dupr: '3.8', city: 'Bradenton',      avatarInitials: 'OH' },
  { name: 'Chris R.',    dupr: '4.1', city: 'Venice',         avatarInitials: 'CR' },
  { name: 'Marcus B.',   dupr: '3.9', city: 'Lakewood Ranch', avatarInitials: 'MB' },
  { name: 'Anna L.',     dupr: '4.3', city: 'Sarasota',       avatarInitials: 'AL' },
  { name: 'Derek H.',    dupr: '3.7', city: 'Bradenton',      avatarInitials: 'DH' },
  { name: 'Priya N.',    dupr: '4.0', city: 'Venice',         avatarInitials: 'PN' },
  { name: 'Tom W.',      dupr: '3.9', city: 'Sarasota',       avatarInitials: 'TW' },
  { name: 'Lisa K.',     dupr: '4.2', city: 'Lakewood Ranch', avatarInitials: 'LK' },
  { name: 'James F.',    dupr: '3.8', city: 'Bradenton',      avatarInitials: 'JF' },
  { name: 'Rachel C.',   dupr: '4.1', city: 'Sarasota',       avatarInitials: 'RC' },
  { name: 'Omar S.',     dupr: '3.6', city: 'Venice',         avatarInitials: 'OS' },
  { name: 'Megan V.',    dupr: '4.0', city: 'Lakewood Ranch', avatarInitials: 'MV' },
  { name: 'Brandon P.',  dupr: '3.9', city: 'Sarasota',       avatarInitials: 'BP' },
  { name: 'Tina J.',     dupr: '4.1', city: 'Bradenton',      avatarInitials: 'TJ' },
];

export function buildTestPlayers(count: 4 | 8 | 12 | 16): RRPlayer[] {
  return MOCK_POOL.slice(0, count).map((p, i) => ({
    ...p,
    id: `mock-${i + 1}`,
    status: 'registered' as const,
  }));
}
