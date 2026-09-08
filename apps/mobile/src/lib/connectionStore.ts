// ─── Types ────────────────────────────────────────────────────────────────────

export type FinderPlayer = {
  id: string;
  name: string;
  dupr: number;
  location: string;
  distance: number;
  lookingFor: string;
  photoUri?: string;
};

export type Connection = {
  id: string;
  player: FinderPlayer;
  connectedAt: string;
};

export type ConnectionRequest = {
  id: string;
  player: FinderPlayer;
  direction: 'incoming' | 'outgoing';
  message?: string;
  sentAt: string;
  status: 'pending' | 'viewed' | 'accepted' | 'declined';
};

export type SavedPlayer = {
  player: FinderPlayer;
  savedAt: string;
};

// ─── State ────────────────────────────────────────────────────────────────────

let _connections: Record<string, Connection> = {};
let _requests: ConnectionRequest[]           = [];
let _saved: Record<string, SavedPlayer>      = {};
let _counter = 100;

// ─── Seed mock data ───────────────────────────────────────────────────────────

_requests = [
  {
    id: 'mock-i1',
    player: {
      id: 'mock-tony', name: 'Tony W.', dupr: 4.2,
      location: 'Orlando, FL', distance: 34, lookingFor: 'Tournament Partner',
      photoUri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&q=80',
    },
    direction: 'incoming',
    message: "Hey! Saw your profile and would love to partner up for some doubles. I play mostly 4.0–4.5.",
    sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
  },
  {
    id: 'mock-i2',
    player: {
      id: 'mock-rachel', name: 'Rachel G.', dupr: 3.9,
      location: 'Tampa, FL', distance: 18, lookingFor: 'Mixed Doubles',
      photoUri: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&q=80',
    },
    direction: 'incoming',
    message: 'Looking for a regular practice partner! Your skill level looks like a great match.',
    sentAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
  },
  {
    id: 'mock-o1',
    player: {
      id: 'mock-marcus', name: 'Marcus B.', dupr: 4.1,
      location: 'Clearwater, FL', distance: 22, lookingFor: 'Competitive Doubles',
      photoUri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&q=80',
    },
    direction: 'outgoing',
    sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
  },
  {
    id: 'mock-o2',
    player: {
      id: 'mock-alicia', name: 'Alicia D.', dupr: 3.7,
      location: 'St. Petersburg, FL', distance: 29, lookingFor: 'Community Play',
      photoUri: 'https://images.unsplash.com/photo-1494790108755-2616b612b1e8?w=120&h=120&fit=crop&q=80',
    },
    direction: 'outgoing',
    sentAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status: 'viewed',
  },
];

_connections = {
  'mock-jamie': {
    id: 'conn-mock-jamie',
    player: { id: 'mock-jamie', name: 'Jamie R.', dupr: 4.2, location: 'Lakewood Ranch, FL', distance: 8, lookingFor: 'Competitive Doubles', photoUri: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&q=80' },
    connectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  'mock-derek': {
    id: 'conn-mock-derek',
    player: { id: 'mock-derek', name: 'Derek M.', dupr: 3.8, location: 'Sarasota, FL', distance: 14, lookingFor: 'Mixed Doubles', photoUri: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&q=80' },
    connectedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  'mock-priya': {
    id: 'conn-mock-priya',
    player: { id: 'mock-priya', name: 'Priya K.', dupr: 4.0, location: 'Brandon, FL', distance: 19, lookingFor: 'Tournament Partner', photoUri: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&h=120&fit=crop&q=80' },
    connectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
};

_saved = {
  'mock-sarah': {
    player: { id: 'mock-sarah', name: 'Sarah M.', dupr: 4.0, location: 'Sarasota, FL', distance: 22, lookingFor: 'Mixed Doubles', photoUri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&q=80' },
    savedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  'mock-carlos': {
    player: { id: 'mock-carlos', name: 'Carlos R.', dupr: 3.8, location: 'Tampa, FL', distance: 15, lookingFor: 'Mixed Doubles', photoUri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&q=80' },
    savedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
};

// ─── APIs ─────────────────────────────────────────────────────────────────────

export function sendConnectionRequest(player: FinderPlayer): void {
  const alreadyPending = _requests.some(
    r => r.player.id === player.id && r.direction === 'outgoing' && r.status === 'pending',
  );
  if (alreadyPending || _connections[player.id]) return;
  _counter++;
  _requests.push({
    id: `req-${_counter}`,
    player,
    direction: 'outgoing',
    sentAt: new Date().toISOString(),
    status: 'pending',
  });
}

export function acceptConnectionRequest(requestId: string): void {
  const req = _requests.find(r => r.id === requestId);
  if (!req) return;
  req.status = 'accepted';
  _connections[req.player.id] = {
    id: `conn-${req.player.id}`,
    player: req.player,
    connectedAt: new Date().toISOString(),
  };
}

export function declineConnectionRequest(requestId: string): void {
  const req = _requests.find(r => r.id === requestId);
  if (req) req.status = 'declined';
}

export function cancelConnectionRequest(requestId: string): void {
  _requests = _requests.filter(r => r.id !== requestId);
}

export function removeConnection(playerId: string): void {
  delete _connections[playerId];
}

export function savePlayer(player: FinderPlayer): void {
  if (!_saved[player.id]) {
    _saved[player.id] = { player, savedAt: new Date().toISOString() };
  }
}

export function unsavePlayer(playerId: string): void {
  delete _saved[playerId];
}

export function getConnections(): Connection[] {
  return Object.values(_connections);
}

export function getRequests(): ConnectionRequest[] {
  return [..._requests];
}

export function getSavedPlayers(): SavedPlayer[] {
  return Object.values(_saved);
}

export function isConnected(playerId: string): boolean {
  return !!_connections[playerId];
}

export function hasPendingRequest(playerId: string): boolean {
  return _requests.some(r => r.player.id === playerId && r.direction === 'outgoing' && r.status === 'pending');
}

export function isSaved(playerId: string): boolean {
  return !!_saved[playerId];
}
