import {
  getTournamentRegistrations,
  getAllRegistrations,
  type TournamentRegistration,
  type RegistrationStatus,
  type PartnerStatus,
} from '@/lib/registrationStore';
import {
  getPlayerRegStatusInfo,
  type PlayerRegStatusKey,
} from '@/lib/tournamentStatus';
import type { StatusVariant } from '@/components/StatusChip';
import type {
  RegistrationGroupStatus,
  RegistrationMemberState,
} from '@/lib/supabase/registrationGroups';
import { getDivisionsForTournament } from '@/data/divisions';

export type { RegistrationStatus, PartnerStatus };

export type DirectorRegistration = {
  id: string;
  playerName: string;
  playerUserId: string | null;
  partnerStatus: PartnerStatus;
  partnerId?: string;
  partnerName?: string;
  partnerDupr?: string;
  // Doubles/mixed per-player payment state. Present only for registrations
  // that belong to a registration_groups team.
  teamStatus?: RegistrationGroupStatus;
  teamPartnerPaymentState?: RegistrationMemberState;
  divisionId: string;
  divisionName: string;
  divisionLevel: string;
  registrationDate: string;
  status: RegistrationStatus;
  amountPaid: number;
  balanceDue: number;
  // ── Undo flags ────────────────────────────────────────────────────────────
  canUndoCheckIn: boolean;
  canRestoreNoShow: boolean;
  canRestoreCancelled: boolean;
};

export type TournamentMetrics = {
  total: number;
  registered: number;
  checkedIn: number;
  waitlisted: number;
  noShow: number;
  cancelled: number;
  revenueCents: number;
  outstandingCents: number;
};

export type DivisionMetrics = {
  divisionId: string;
  divisionName: string;
  level: string;
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  waitlistedCount: number;
  noShowCount: number;
  openSpots: number;
  revenueCollected: number;
  outstandingBalance: number;
};

function toDirector(r: TournamentRegistration): DirectorRegistration {
  return {
    id:                  r.id,
    playerName:          r.playerName,
    playerUserId:        null,
    partnerStatus:       r.partnerStatus,
    partnerId:           r.partnerId,
    partnerName:         r.partnerName,
    partnerDupr:         r.partnerDupr,
    divisionId:          r.divisionId,
    divisionName:        r.divisionName,
    divisionLevel:       r.divisionLevel,
    registrationDate:    r.registrationDate,
    status:              r.status,
    amountPaid:          r.amountPaid,
    balanceDue:          r.balanceDue,
    canUndoCheckIn:      r.status === 'checked_in',
    canRestoreNoShow:    r.status === 'no_show',
    canRestoreCancelled: r.status === 'cancelled',
  };
}

export function getDirectorRegistrations(tournamentId: string): DirectorRegistration[] {
  return getTournamentRegistrations(tournamentId)
    .filter(r => r.status !== 'cancelled')
    .map(toDirector);
}

export function getDivisionRegistrations(
  tournamentId: string,
  divisionId: string,
): DirectorRegistration[] {
  return getTournamentRegistrations(tournamentId)
    .filter(r => r.divisionId === divisionId && r.status !== 'cancelled')
    .map(toDirector);
}

export function getTournamentMetrics(tournamentId: string): TournamentMetrics {
  const everything = getAllRegistrations().filter(r => r.tournamentId === tournamentId);
  const active     = everything.filter(r => r.status !== 'cancelled');
  return {
    total:            active.length,
    registered:       active.filter(r => r.status === 'registered').length,
    checkedIn:        active.filter(r => r.status === 'checked_in').length,
    waitlisted:       active.filter(r => r.status === 'waitlisted').length,
    noShow:           active.filter(r => r.status === 'no_show').length,
    cancelled:        everything.filter(r => r.status === 'cancelled').length,
    revenueCents:     active.reduce((s, r) => s + r.amountPaid, 0),
    outstandingCents: active
      .filter(r => r.status !== 'no_show')
      .reduce((s, r) => s + r.balanceDue, 0),
  };
}

export function getCancelledDirectorRegistrations(tournamentId: string): DirectorRegistration[] {
  return getAllRegistrations()
    .filter(r => r.tournamentId === tournamentId && r.status === 'cancelled')
    .map(toDirector);
}

export function getDivisionMetrics(tournamentId: string): DivisionMetrics[] {
  const divisions = getDivisionsForTournament(tournamentId);
  const allRegs   = getTournamentRegistrations(tournamentId).filter(r => r.status !== 'cancelled');

  return divisions.map(d => {
    const divRegs         = allRegs.filter(r => r.divisionId === d.id);
    const registeredCount = divRegs.filter(r => r.status === 'registered' || r.status === 'checked_in').length;
    const checkedInCount  = divRegs.filter(r => r.status === 'checked_in').length;
    const waitlistedCount = divRegs.filter(r => r.status === 'waitlisted').length;
    const noShowCount     = divRegs.filter(r => r.status === 'no_show').length;
    const openSpots       = Math.max(0, d.capacity - registeredCount);

    return {
      divisionId:         d.id,
      divisionName:       d.name,
      level:              d.level,
      capacity:           d.capacity,
      registeredCount,
      checkedInCount,
      waitlistedCount,
      noShowCount,
      openSpots,
      revenueCollected:   divRegs.reduce((s, r) => s + r.amountPaid, 0),
      outstandingBalance: divRegs
        .filter(r => r.status !== 'no_show')
        .reduce((s, r) => s + r.balanceDue, 0),
    };
  });
}

// What a director needs to see on a doubles/mixed entry: whose money has
// actually arrived. A registration whose partner hasn't paid is a real, paid
// registration for THIS player — it is not a complete team, and this label is
// what keeps those two things from looking the same on the roster.
export function partnerPaymentLabel(reg: DirectorRegistration): string | null {
  if (!reg.teamStatus) return null;
  switch (reg.teamPartnerPaymentState) {
    case 'paid':            return 'Partner paid';
    case 'declined':        return 'Partner declined';
    case 'expired':         return 'Partner invite expired';
    case 'invited':
    case 'pending_payment': return 'Partner payment pending';
    default:                return reg.teamStatus === 'confirmed' ? 'Partner paid' : 'Partner payment pending';
  }
}

export function partnerPaymentVariant(reg: DirectorRegistration): StatusVariant {
  if (reg.teamPartnerPaymentState === 'paid' || reg.teamStatus === 'confirmed') return 'green';
  if (reg.teamPartnerPaymentState === 'declined' || reg.teamPartnerPaymentState === 'expired') return 'red';
  return 'gold';
}

export function statusLabel(s: RegistrationStatus): string {
  return getPlayerRegStatusInfo(s as PlayerRegStatusKey).label;
}

export function statusVariant(s: RegistrationStatus): StatusVariant {
  return getPlayerRegStatusInfo(s as PlayerRegStatusKey).variant;
}
