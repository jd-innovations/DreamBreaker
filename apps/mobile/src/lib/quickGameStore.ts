export type QuickGame = {
  id: string;
  type: 'quick_game';
  title: string;
  imageUri: string;
  date: string;
  startTime: string;
  duration: string;
  locationName: string;
  locationAddress: string;
  skillRange: string;
  playersNeeded: number;
  currentPlayers: number;
  visibility: 'public' | 'invite_only';
  organizerId: string;
  organizerName: string;
  status: 'open' | 'cancelled';
  createdAt: string;
};

let _current: QuickGame | null = null;

export function setCurrentGame(g: QuickGame) { _current = g; }
export function getCurrentGame(): QuickGame | null { return _current; }
export function clearCurrentGame() { _current = null; }
export function updateStatus(status: QuickGame['status']) {
  if (_current) _current = { ..._current, status };
}
