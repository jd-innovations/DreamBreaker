import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import { fetchTournamentRegistrations } from '@/lib/supabase/registrations';
import type { Tournament } from '@/lib/tournamentTypes';
import type { DivisionData } from '@/data/divisions';
import type { TournamentRegistration } from '@/lib/registrationStore';

export type TournamentReportMetrics = {
  total: number;
  registered: number;
  checkedIn: number;
  waitlisted: number;
  noShow: number;
  cancelled: number;
  revenueCents: number;
  outstandingCents: number;
};

export type DivisionReportRow = {
  divisionId: string;
  divisionName: string;
  level: string;
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  waitlistedCount: number;
  noShowCount: number;
};

export type TournamentReport = {
  tournament: Tournament;
  metrics: TournamentReportMetrics;
  divisions: DivisionReportRow[];
  roster: TournamentRegistration[];
};

// Registration statuses included in the exported roster — mirrors what
// director.tsx/command-center.tsx already treat as "on the books" (i.e.
// excludes held/expired-hold spots, which fetchTournamentRegistrations
// already filters out server-side).
export async function fetchTournamentReport(tournamentId: string): Promise<TournamentReport | null> {
  const [tournament, divisions, roster] = await Promise.all([
    fetchTournamentById(tournamentId),
    fetchDivisionsForTournament(tournamentId),
    fetchTournamentRegistrations(tournamentId),
  ]);
  if (!tournament) return null;

  const active = roster.filter(r => r.status !== 'cancelled');

  const metrics: TournamentReportMetrics = {
    total:            active.length,
    registered:       active.filter(r => r.status === 'registered').length,
    checkedIn:        active.filter(r => r.status === 'checked_in').length,
    waitlisted:       active.filter(r => r.status === 'waitlisted').length,
    noShow:           active.filter(r => r.status === 'no_show').length,
    cancelled:        roster.filter(r => r.status === 'cancelled').length,
    revenueCents:     active.reduce((s, r) => s + r.amountPaid, 0),
    outstandingCents: active.filter(r => r.status !== 'no_show').reduce((s, r) => s + r.balanceDue, 0),
  };

  const divisionRows: DivisionReportRow[] = divisions.map((d: DivisionData) => {
    const divRegs = active.filter(r => r.divisionId === d.id);
    return {
      divisionId:      d.id,
      divisionName:    d.name,
      level:           d.level,
      capacity:        d.capacity,
      registeredCount: divRegs.filter(r => r.status === 'registered' || r.status === 'checked_in').length,
      checkedInCount:  divRegs.filter(r => r.status === 'checked_in').length,
      waitlistedCount: divRegs.filter(r => r.status === 'waitlisted').length,
      noShowCount:     divRegs.filter(r => r.status === 'no_show').length,
    };
  });

  return { tournament, metrics, divisions: divisionRows, roster };
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function buildRosterCsv(roster: TournamentRegistration[]): string {
  const header = [
    'Player', 'Division', 'Status', 'Partner',
    'Amount Paid', 'Balance Due', 'Registered On',
  ];
  const rows = roster.map(r => [
    r.playerName,
    r.divisionName,
    r.status,
    r.partnerName ?? '',
    fmtCents(r.amountPaid),
    fmtCents(r.balanceDue),
    r.registrationDate,
  ]);
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
}

// Writes the roster CSV to a temp file and opens the native share sheet.
// Throws if the device has no share target (Sharing.isAvailableAsync() is
// false) — callers should surface that to the user rather than fail silently.
export async function exportRosterCsv(tournamentName: string, roster: TournamentRegistration[]): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');

  const csv = buildRosterCsv(roster);
  const safeName = tournamentName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'tournament';
  const file = new File(Paths.cache, `${safeName}-roster.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: `${tournamentName} Roster`,
    UTI: 'public.comma-separated-values-text',
  });
}
