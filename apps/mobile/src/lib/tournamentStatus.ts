import type { Tournament } from '@/lib/tournamentTypes';
import type { StatusVariant } from '@/components/StatusChip';
import { isTournamentCompleted } from '@/lib/directorBracketStore';
import { getHeldSpots } from '@/lib/tournamentStore';
import { getRegistrations } from '@/lib/registrationStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TournamentStatusKey =
  | 'draft'
  | 'pending_approval'
  | 'open'
  | 'filling_fast'
  | 'closing_soon'
  | 'registration_closed'
  | 'completed';

export type PlayerRegStatusKey =
  | 'held'
  | 'registered'
  | 'waitlisted'
  | 'checked_in'
  | 'no_show'
  | 'cancelled';

export type StatusInfo = {
  label: string;
  variant: StatusVariant;
  priority: number;
};

// ─── Lookup tables ────────────────────────────────────────────────────────────

const TOURNAMENT_STATUS_INFO: Record<TournamentStatusKey, StatusInfo> = {
  draft:               { label: 'Draft',               variant: 'gray',  priority: 0 },
  pending_approval:    { label: 'Pending Review',       variant: 'gold',  priority: 1 },
  open:                { label: 'Open',               variant: 'green', priority: 2 },
  filling_fast:        { label: 'Filling Fast',        variant: 'gold',  priority: 3 },
  closing_soon:        { label: 'Closing Soon',        variant: 'gold',  priority: 4 },
  registration_closed: { label: 'Registration Closed', variant: 'gray',  priority: 5 },
  completed:           { label: 'Completed',           variant: 'navy',  priority: 6 },
};

const PLAYER_REG_STATUS_INFO: Record<PlayerRegStatusKey, StatusInfo> = {
  checked_in: { label: 'Checked In', variant: 'green', priority: 1 },
  registered: { label: 'Registered', variant: 'green', priority: 2 },
  held:       { label: 'Held',       variant: 'gold',  priority: 3 },
  waitlisted: { label: 'Waitlisted', variant: 'gray',  priority: 4 },
  no_show:    { label: 'No Show',    variant: 'red',   priority: 5 },
  cancelled:  { label: 'Cancelled',  variant: 'gray',  priority: 6 },
};

// ─── APIs ─────────────────────────────────────────────────────────────────────

// event_date is a plain SQL date (YYYY-MM-DD, no time component), so it must
// be compared against the device's local calendar date — not the UTC date
// from toISOString(), which drifts a day off local "today" for part of the
// day in any non-UTC timezone.
export function isTournamentPast(eventDate: string): boolean {
  if (!eventDate) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return eventDate < today;
}

export function getTournamentStatus(tournament: Tournament): TournamentStatusKey {
  if (tournament.status === 'draft') return 'draft';
  if (tournament.status === 'pending_approval') return 'pending_approval';
  if (
    isTournamentCompleted(tournament.id) ||
    tournament.status === 'completed' ||
    isTournamentPast(tournament.eventDate)
  ) {
    return 'completed';
  }
  if (tournament.status === 'full') return 'registration_closed';
  if (tournament.status === 'filling_fast') {
    const spotsLeft = tournament.drawSize - tournament.spotsFilled;
    return spotsLeft / tournament.drawSize <= 0.1 ? 'closing_soon' : 'filling_fast';
  }
  return 'open';
}

export function getPlayerRegistrationStatus(tournamentId: string): PlayerRegStatusKey | null {
  const regs = getRegistrations().filter(r => r.tournamentId === tournamentId);
  if (regs.some(r => r.status === 'checked_in'))  return 'checked_in';
  if (regs.some(r => r.status === 'waitlisted'))  return 'waitlisted';
  if (regs.some(r => r.status === 'registered'))  return 'registered';
  const hasHold = getHeldSpots().some(h => h.tournamentId === tournamentId);
  if (hasHold) return 'held';
  return null;
}

export function getTournamentStatusInfo(key: TournamentStatusKey): StatusInfo {
  return TOURNAMENT_STATUS_INFO[key];
}

export function getPlayerRegStatusInfo(key: PlayerRegStatusKey): StatusInfo {
  return PLAYER_REG_STATUS_INFO[key];
}
