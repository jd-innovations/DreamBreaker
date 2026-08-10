export type RegistrationStatus =
  | 'registered'
  | 'waitlisted'
  | 'cancelled'
  | 'checked_in'
  | 'no_show';

export type PartnerStatus = 'none' | 'choose_later' | 'selected';

export type TournamentRegistration = {
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
  playerId: string;
  playerName: string;
  registrationDate: string;
  status: RegistrationStatus;
  amountPaid: number;
  balanceDue: number;
  partnerRequired: boolean;
  partnerStatus: PartnerStatus;
  partnerId?: string;
  partnerName?: string;
  partnerDupr?: string;
};

let _registrations: TournamentRegistration[] = [];
let _counter = 0;

export function registerPlayer(
  data: Omit<TournamentRegistration, 'id' | 'registrationDate' | 'status'>,
): TournamentRegistration {
  _counter++;
  const entry: TournamentRegistration = {
    ...data,
    id:               `reg-${_counter}`,
    registrationDate: new Date().toISOString(),
    status:           'registered',
  };
  _registrations.push(entry);
  return entry;
}

export function getRegistrations(): TournamentRegistration[] {
  return _registrations.filter(r => r.status !== 'cancelled');
}

export function getAllRegistrations(): TournamentRegistration[] {
  return [..._registrations];
}

export function getRegistration(id: string): TournamentRegistration | null {
  return _registrations.find(r => r.id === id) ?? null;
}

export function getTournamentRegistrations(tournamentId: string): TournamentRegistration[] {
  return _registrations.filter(r => r.tournamentId === tournamentId && r.status !== 'cancelled');
}

export function isRegistered(tournamentId: string, divisionId?: string): boolean {
  return _registrations.some(r => {
    if (r.tournamentId !== tournamentId || r.status === 'cancelled') return false;
    return divisionId ? r.divisionId === divisionId : true;
  });
}

export function hasAnyRegistration(tournamentId: string): boolean {
  return isRegistered(tournamentId);
}

export function cancelRegistration(id: string): void {
  _registrations = _registrations.map(r =>
    r.id === id ? { ...r, status: 'cancelled' } : r,
  );
}

export function checkInPlayer(id: string): void {
  _registrations = _registrations.map(r =>
    r.id === id ? { ...r, status: 'checked_in' } : r,
  );
}

export function markNoShow(id: string): void {
  _registrations = _registrations.map(r =>
    r.id === id ? { ...r, status: 'no_show' } : r,
  );
}

export function moveToWaitlist(id: string): void {
  const reg = _registrations.find(r => r.id === id);
  if (!reg) return;
  if (reg.status === 'checked_in') return; // business rule: cannot waitlist a checked-in player
  _registrations = _registrations.map(r =>
    r.id === id ? { ...r, status: 'waitlisted' } : r,
  );
}

export function restoreFromWaitlist(id: string): void {
  _registrations = _registrations.map(r =>
    r.id === id && r.status === 'waitlisted' ? { ...r, status: 'registered' } : r,
  );
}

export function undoCheckIn(id: string): void {
  _registrations = _registrations.map(r =>
    r.id === id && r.status === 'checked_in' ? { ...r, status: 'registered' } : r,
  );
}

export function restoreNoShow(id: string): void {
  _registrations = _registrations.map(r =>
    r.id === id && r.status === 'no_show' ? { ...r, status: 'registered' } : r,
  );
}

export function restoreCancelledRegistration(id: string): void {
  _registrations = _registrations.map(r =>
    r.id === id && r.status === 'cancelled' ? { ...r, status: 'registered' } : r,
  );
}
