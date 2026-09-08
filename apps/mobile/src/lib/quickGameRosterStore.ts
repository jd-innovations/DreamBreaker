// ─── Types ───────────────────────────────────────────────────────────────────

export type QGPlayer = {
  id: string;
  name: string;
  dupr?: string;
  city?: string;
  avatarInitials: string;
  status: 'registered' | 'invited';
};

// ─── Store ───────────────────────────────────────────────────────────────────

let _rosters: Record<string, QGPlayer[]> = {};

export function setRoster(gameId: string, players: QGPlayer[]): void {
  _rosters[gameId] = [...players];
}

export function getRoster(gameId: string): QGPlayer[] {
  return _rosters[gameId] ?? [];
}

export function addPlayer(gameId: string, player: QGPlayer): void {
  if (!_rosters[gameId]) _rosters[gameId] = [];
  _rosters[gameId] = [..._rosters[gameId], player];
}

export function removePlayer(gameId: string, playerId: string): void {
  if (!_rosters[gameId]) return;
  _rosters[gameId] = _rosters[gameId].filter(p => p.id !== playerId);
}

export function clearRoster(gameId: string): void {
  _rosters[gameId] = [];
}

export function getRosterCount(gameId: string): number {
  return (_rosters[gameId] ?? []).length;
}

// ─── Mock Player Pool ─────────────────────────────────────────────────────────

const MOCK_POOL: Omit<QGPlayer, 'id' | 'status'>[] = [
  { name: 'Sarah M.',   dupr: '4.2', city: 'Lakewood Ranch', avatarInitials: 'SM' },
  { name: 'Mike R.',    dupr: '4.0', city: 'Sarasota',       avatarInitials: 'MR' },
  { name: 'Olivia H.',  dupr: '3.8', city: 'Bradenton',      avatarInitials: 'OH' },
  { name: 'Chris R.',   dupr: '4.1', city: 'Venice',         avatarInitials: 'CR' },
  { name: 'Marcus B.',  dupr: '3.9', city: 'Lakewood Ranch', avatarInitials: 'MB' },
  { name: 'Anna L.',    dupr: '4.3', city: 'Sarasota',       avatarInitials: 'AL' },
  { name: 'Derek H.',   dupr: '3.7', city: 'Bradenton',      avatarInitials: 'DH' },
  { name: 'Priya N.',   dupr: '4.0', city: 'Venice',         avatarInitials: 'PN' },
  { name: 'Tom W.',     dupr: '3.9', city: 'Sarasota',       avatarInitials: 'TW' },
  { name: 'Lisa K.',    dupr: '4.2', city: 'Lakewood Ranch', avatarInitials: 'LK' },
  { name: 'James F.',   dupr: '3.8', city: 'Bradenton',      avatarInitials: 'JF' },
  { name: 'Rachel C.',  dupr: '4.1', city: 'Sarasota',       avatarInitials: 'RC' },
];

export function buildTestPlayers(count: 4 | 8 | 12): QGPlayer[] {
  return MOCK_POOL.slice(0, count).map((p, i) => ({
    ...p,
    id: `qg-mock-${i + 1}`,
    status: 'registered' as const,
  }));
}
