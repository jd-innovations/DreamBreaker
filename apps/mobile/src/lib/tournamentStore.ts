export type HeldSpot = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  divisionId: string;
  divisionName: string;
  divisionLevel: string;
  venue: string;
  city: string;
  state: string;
  date: string;
  holdAmountCents: number;
  entryAmountCents: number;
  status: 'held' | 'registered' | 'cancelled';
  heldAt: string;
};

let _held: HeldSpot[] = [];
let _counter = 0;

export function holdSpot(spot: Omit<HeldSpot, 'id' | 'heldAt' | 'status'>): HeldSpot {
  _counter++;
  const entry: HeldSpot = {
    ...spot,
    id:     `hold-${_counter}`,
    heldAt: new Date().toISOString(),
    status: 'held',
  };
  _held.push(entry);
  return entry;
}

export function getHeldSpots(): HeldSpot[] {
  return _held.filter(h => h.status === 'held');
}

export function markHoldAsRegistered(tournamentId: string, divisionId: string): void {
  _held = _held.map(h =>
    h.tournamentId === tournamentId && h.divisionId === divisionId && h.status === 'held'
      ? { ...h, status: 'registered' }
      : h,
  );
}

export function hasAnyHold(tournamentId: string): boolean {
  return _held.some(h => h.tournamentId === tournamentId && h.status === 'held');
}

export function getAllHeldSpots(): HeldSpot[] {
  return [..._held];
}

export function cancelHold(holdId: string): void {
  _held = _held.map(h => h.id === holdId ? { ...h, status: 'cancelled' } : h);
}

export function isHeld(tournamentId: string, divisionId: string): boolean {
  return _held.some(
    h => h.tournamentId === tournamentId && h.divisionId === divisionId && h.status === 'held',
  );
}
