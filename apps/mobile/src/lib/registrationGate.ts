import type { Tournament } from '@/lib/tournamentTypes';
import { isTournamentPast } from '@/lib/tournamentStatus';

export type RegReason =
  | 'not_published'
  | 'completed'
  | 'closed'
  | 'not_open_yet'
  | 'open';

export type RegAvailability = {
  available: boolean;
  reason: RegReason;
  label: string;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function getRegistrationAvailability(tournament: Tournament): RegAvailability {
  const now = new Date();
  const { status, registrationOpensAt, registrationClosesAt } = tournament;

  if (
    status === 'draft' ||
    status === 'pending_approval' ||
    status === 'cancelled'
  ) {
    return { available: false, reason: 'not_published', label: 'Tournament not published' };
  }

  if (status === 'completed' || isTournamentPast(tournament.eventDate)) {
    return { available: false, reason: 'completed', label: 'Tournament completed' };
  }

  if (status === 'full') {
    return { available: false, reason: 'closed', label: 'Registration closed' };
  }

  if (registrationOpensAt && now < new Date(registrationOpensAt)) {
    return {
      available: false,
      reason: 'not_open_yet',
      label: `Registration opens ${fmtDate(registrationOpensAt)}`,
    };
  }

  if (registrationClosesAt && now > new Date(registrationClosesAt)) {
    return { available: false, reason: 'closed', label: 'Registration closed' };
  }

  // status is open or filling_fast, dates are either not set or within range
  return { available: true, reason: 'open', label: 'Registration open' };
}
