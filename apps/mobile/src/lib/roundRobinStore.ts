export type RoundRobin = {
  id: string;
  type: 'round_robin';
  title: string;
  imageUri: string;
  date: string;
  startTime: string;
  duration: string;
  locationName: string;
  locationAddress: string;
  skillRange: string;
  minPlayers: number;
  maxPlayers: number;
  currentPlayers: number;
  matchFormat: string;
  matchesPerPlayer: string;
  scoreRecording: string;
  visibility: 'public' | 'invite_only';
  notes: string;
  organizerId: string;
  organizerName: string;
  status: 'open' | 'cancelled' | 'completed';
  createdAt: string;
};

let _current: RoundRobin | null = null;

export function setRoundRobin(rr: RoundRobin) { _current = rr; }
export function getRoundRobin(): RoundRobin | null { return _current; }
export function clearRoundRobin() { _current = null; }

export function updateStatus(status: RoundRobin['status']): void {
  if (_current) _current = { ..._current, status };
}

export function updateCurrentPlayers(count: number): void {
  if (_current) _current = { ..._current, currentPlayers: count };
}
