// Session-lifetime UI state for the booking wizard (Search -> Results ->
// Facility Detail -> Choose Time & Court -> Players -> Review & Pay ->
// Confirmation). Mirrors logSessionStore.ts's shape exactly: canonical
// booking data is persisted in Supabase once a hold exists
// (public.reservations, via reservations.ts); this store only carries
// search params, the in-progress selection, and ids between the flat-file
// wizard screens that precede a real reservation id.

export type BookingGameFormat = 'singles' | 'doubles';
export type BookingAssetType  = 'court' | 'ball_machine';

export type BookingSearchState = {
  locationQuery:    string | null;
  locationLat:      number | null;
  locationLng:      number | null;
  date:             string | null; // ISO date (yyyy-mm-dd)
  gameFormat:       BookingGameFormat;
  playersInGroup:   number;        // doubles: 1-4, singles: 1-2
  assetTypeFilter:  BookingAssetType | null; // null = both
};

export type BookingFacilityState = {
  facilityId:   string | null;
  facilityName: string | null;
};

export type BookingSelectionState = {
  assetType:                BookingAssetType | null;
  assetId:                  string | null;
  assetName:                string | null;
  startsAt:                 string | null; // ISO datetime
  endsAt:                   string | null;
  basePriceCents:           number | null;
  flashDealDiscountPercent: number | null;
  finalPriceCents:          number | null;
};

type BookingState = {
  search:            BookingSearchState;
  facility:          BookingFacilityState;
  selection:         BookingSelectionState;
  reservationId:     string | null; // set once create_reservation() succeeds (hold created)
  invitedProfileIds: string[];      // players queued/sent an invite this session
};

const emptySearch: BookingSearchState = {
  locationQuery:   null,
  locationLat:     null,
  locationLng:     null,
  date:            null,
  gameFormat:      'doubles', // spec: doubles is the default game format
  playersInGroup:  2,
  assetTypeFilter: null,
};

const emptyFacility: BookingFacilityState = {
  facilityId:   null,
  facilityName: null,
};

const emptySelection: BookingSelectionState = {
  assetType:                null,
  assetId:                  null,
  assetName:                null,
  startsAt:                 null,
  endsAt:                   null,
  basePriceCents:           null,
  flashDealDiscountPercent: null,
  finalPriceCents:          null,
};

let state: BookingState = {
  search:            emptySearch,
  facility:          emptyFacility,
  selection:         emptySelection,
  reservationId:     null,
  invitedProfileIds: [],
};

export function getBookingState(): BookingState {
  return state;
}

export function setBookingSearch(patch: Partial<BookingSearchState>) {
  state = { ...state, search: { ...state.search, ...patch } };
}

export function getBookingSearch(): BookingSearchState {
  return state.search;
}

export function setBookingFacility(facilityId: string, facilityName: string) {
  state = { ...state, facility: { facilityId, facilityName } };
}

export function getBookingFacility(): BookingFacilityState {
  return state.facility;
}

export function setBookingSelection(patch: Partial<BookingSelectionState>) {
  state = { ...state, selection: { ...state.selection, ...patch } };
}

export function getBookingSelection(): BookingSelectionState {
  return state.selection;
}

export function setBookingReservationId(reservationId: string | null) {
  state = { ...state, reservationId };
}

export function getBookingReservationId(): string | null {
  return state.reservationId;
}

export function addInvitedProfileId(profileId: string) {
  if (state.invitedProfileIds.includes(profileId)) return;
  state = { ...state, invitedProfileIds: [...state.invitedProfileIds, profileId] };
}

export function removeInvitedProfileId(profileId: string) {
  state = { ...state, invitedProfileIds: state.invitedProfileIds.filter(id => id !== profileId) };
}

export function getInvitedProfileIds(): string[] {
  return state.invitedProfileIds;
}

export function clearBookingDraft() {
  state = {
    search:            emptySearch,
    facility:          emptyFacility,
    selection:         emptySelection,
    reservationId:     null,
    invitedProfileIds: [],
  };
}
