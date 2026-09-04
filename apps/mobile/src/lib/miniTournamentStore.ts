export type MiniTournament = {
  id: string;
  type: 'mini_tournament';
  title: string;
  imageUri: string;
  date: string;
  startTime: string;
  duration: string;
  tournamentType: 'Single Elimination' | 'Pool Play' | 'RR to Bracket';
  singlesOrDoubles: 'Singles' | 'Doubles' | 'Mixed Doubles';
  locationName: string;
  locationAddress: string;
  skillRange: string;
  maxPlayers: number;
  currentPlayers: number;
  matchFormat: string;
  scoreTracking: string;
  warmupTime: string;
  visibility: 'public' | 'invite_only';
  notes: string;
  organizerId: string;
  organizerName: string;
  status: 'open' | 'cancelled' | 'completed';
  createdAt: string;
};

let _current: MiniTournament | null = null;

export function setMiniTournament(mt: MiniTournament) { _current = mt; }
export function getMiniTournament(): MiniTournament | null { return _current; }
export function clearMiniTournament() { _current = null; }

export function updateCurrentPlayers(count: number): void {
  if (_current) _current = { ..._current, currentPlayers: count };
}

export function updateTournamentStatus(status: MiniTournament['status']): void {
  if (_current) _current = { ..._current, status };
}
