// Session-lifetime UI state for the log-session flow. Canonical match data is
// persisted in Supabase; this store only carries ids and screen context between
// the existing route screens.

export type RosterSlot = 'partner' | 'opponent1' | 'opponent2';
export type SessionFormat = 'singles' | 'doubles';

export type Comparison = 'weaker' | 'similar' | 'stronger';
export type ComparisonAmount = 'slightly' | 'much' | null;

export type RosterPlayer = {
  temporary: boolean;
  profileId?: string | null;
  sessionParticipantId?: string | null;
  name: string;
  avatarUrl: string | null;
  comparison?: Comparison;
  amount?: ComparisonAmount;
  phone?: string | null;
};

type RosterState = {
  partner: RosterPlayer | null;
  opponent1: RosterPlayer | null;
  opponent2: RosterPlayer | null;
};

export type SavedGameSummary = {
  id: string;
  gameNumber: number;
  myScore: number;
  opponentScore: number;
  myTeamLabel: string;
  opponentsLabel: string;
};

export type ParticipantDeliveryStatus =
  | 'recorded_by_you'
  | 'in_app_shared'
  | 'not_shared'
  | 'share_initiated'
  | 'claimed'
  | 'expired';

export type ParticipantDelivery = {
  sessionParticipantId: string;
  profileId: string | null;
  guestPlayerId: string | null;
  displayName: string;
  phone: string | null;
  participantKind: 'registered' | 'guest';
  deliveryStatus: ParticipantDeliveryStatus;
  guestShareId: string | null;
  claimStatus?: 'pending' | 'claimed' | 'expired' | 'revoked' | null;
};

type LocationState = {
  facilityId: string | null;
  facilityName: string | null;
  facilityLocation: string | null;
  facilityPhotoUrl: string | null;
};

type LogSessionState = {
  sessionId: string | null;
  selfSessionParticipantId: string | null;
  format: SessionFormat;
  roster: RosterState;
  games: SavedGameSummary[];
  deliveries: ParticipantDelivery[];
  location: LocationState;
  notes: string | null;
};

const emptyRoster: RosterState = { partner: null, opponent1: null, opponent2: null };
const emptyLocation: LocationState = {
  facilityId: null,
  facilityName: null,
  facilityLocation: null,
  facilityPhotoUrl: null,
};

let state: LogSessionState = {
  sessionId: null,
  selfSessionParticipantId: null,
  format: 'doubles',
  roster: emptyRoster,
  games: [],
  deliveries: [],
  location: emptyLocation,
  notes: null,
};

export function getLogSessionState(): LogSessionState {
  return state;
}

export function getRoster(): RosterState {
  return state.roster;
}

export function setRosterSlot(slot: RosterSlot, player: RosterPlayer) {
  state = { ...state, roster: { ...state.roster, [slot]: player } };
}

export function setRosterSlotPhone(slot: RosterSlot, phone: string) {
  const current = state.roster[slot];
  if (!current) return;
  state = {
    ...state,
    roster: { ...state.roster, [slot]: { ...current, phone } },
  };
}

export function setRosterSlotParticipantId(slot: RosterSlot, sessionParticipantId: string) {
  const current = state.roster[slot];
  if (!current) return;
  state = {
    ...state,
    roster: { ...state.roster, [slot]: { ...current, sessionParticipantId } },
  };
}

export function setSessionFormat(format: SessionFormat) {
  state = { ...state, format };
}

export function getSessionFormat(): SessionFormat {
  return state.format;
}

export function setPersistedSession(sessionId: string, selfSessionParticipantId: string) {
  state = { ...state, sessionId, selfSessionParticipantId };
}

export function setSelfSessionParticipantId(selfSessionParticipantId: string) {
  state = { ...state, selfSessionParticipantId };
}

export function addSavedGame(game: SavedGameSummary) {
  const existing = state.games.filter((item) => item.gameNumber !== game.gameNumber);
  state = { ...state, games: [...existing, game].sort((a, b) => a.gameNumber - b.gameNumber) };
}

export function getSavedGames(): SavedGameSummary[] {
  return state.games;
}

export function setParticipantDeliveries(deliveries: ParticipantDelivery[]) {
  state = { ...state, deliveries };
}

export function updateParticipantDeliveryStatus(sessionParticipantId: string, deliveryStatus: ParticipantDeliveryStatus) {
  state = {
    ...state,
    deliveries: state.deliveries.map((delivery) => (
      delivery.sessionParticipantId === sessionParticipantId ? { ...delivery, deliveryStatus } : delivery
    )),
  };
}

export function getParticipantDeliveries(): ParticipantDelivery[] {
  return state.deliveries;
}

export function setSessionLocation(location: LocationState) {
  state = { ...state, location };
}

export function getSessionLocation(): LocationState {
  return state.location;
}

export function setSessionNotes(notes: string | null) {
  state = { ...state, notes };
}

export function getSessionNotes(): string | null {
  return state.notes;
}

export function clearRoster() {
  state = { ...state, roster: emptyRoster };
}

export function clearLogSession() {
  state = {
    sessionId: null,
    selfSessionParticipantId: null,
    format: 'doubles',
    roster: emptyRoster,
    games: [],
    deliveries: [],
    location: emptyLocation,
    notes: null,
  };
}
