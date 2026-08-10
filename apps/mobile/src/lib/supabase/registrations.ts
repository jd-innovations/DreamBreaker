import { supabase } from '@/lib/supabase';
import type { TournamentRegistration, RegistrationStatus } from '@/lib/registrationStore';
export type { TournamentRegistration };
import type { HeldSpot } from '@/lib/tournamentStore';

// ─── DB → App type mappers ────────────────────────────────────────────────────

function dbStatusToAppStatus(s: string): RegistrationStatus {
  switch (s) {
    case 'checked_in':       return 'checked_in';
    case 'waitlisted':
    case 'waitlist_offered': return 'waitlisted';
    case 'withdrawn':
    case 'disqualified':
    case 'expired_hold':     return 'cancelled';
    case 'no_show':          return 'no_show';
    default:                 return 'registered';
  }
}

// Joins with tournaments + divisions to get display names needed by screens
export type RegistrationRow = {
  id: string;
  tournament_id: string;
  division_id: string | null;
  player_id: string;
  partner_id: string | null;
  status: string;
  hold_fee_paid_cents: number;
  entry_fee_paid_cents: number;
  needs_partner: boolean;
  created_at: string;
  tournaments: {
    name: string;
    venue_name: string | null;
    city: string;
    state: string;
    event_date: string;
    entry_fee_cents: number;
    hold_fee_cents: number;
  } | null;
  divisions: {
    name: string;
    skill_min: number | null;
    skill_max: number | null;
  } | null;
  player: { full_name: string | null; dupr: number | null } | null;
  partner: { full_name: string | null; dupr: number | null } | null;
};

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function rowToRegistration(row: RegistrationRow): TournamentRegistration {
  const t = row.tournaments;
  const div = row.divisions;
  const skillMin = div?.skill_min;
  const skillMax = div?.skill_max;
  const level = skillMin != null && skillMax != null
    ? `${skillMin}-${skillMax}`
    : '';

  return {
    id:               row.id,
    tournamentId:     row.tournament_id,
    tournamentName:   t?.name ?? '',
    divisionId:       row.division_id ?? '',
    divisionName:     div?.name ?? '',
    divisionLevel:    level,
    venue:            t?.venue_name ?? '',
    city:             t?.city ?? '',
    state:            t?.state ?? '',
    date:             t ? formatDate(t.event_date) : '',
    playerId:         row.player_id,
    playerName:       row.player?.full_name ?? '',
    registrationDate: row.created_at,
    status:           dbStatusToAppStatus(row.status),
    amountPaid:       row.entry_fee_paid_cents,
    balanceDue:       Math.max(0, (t?.entry_fee_cents ?? 0) - row.entry_fee_paid_cents),
    partnerRequired:  row.needs_partner,
    partnerStatus:    row.partner_id ? 'selected' : row.needs_partner ? 'choose_later' : 'none',
    partnerId:        row.partner_id ?? undefined,
    partnerName:      row.partner?.full_name ?? undefined,
    partnerDupr:      row.partner?.dupr != null ? String(Number(row.partner.dupr).toFixed(2)) : undefined,
  };
}

function rowToHeldSpot(row: RegistrationRow): HeldSpot {
  const t = row.tournaments;
  const div = row.divisions;
  const skillMin = div?.skill_min;
  const skillMax = div?.skill_max;
  const level = skillMin != null && skillMax != null
    ? `${skillMin}-${skillMax}`
    : '';

  return {
    id:               row.id,
    tournamentId:     row.tournament_id,
    tournamentName:   t?.name ?? '',
    divisionId:       row.division_id ?? '',
    divisionName:     div?.name ?? '',
    divisionLevel:    level,
    venue:            t?.venue_name ?? '',
    city:             t?.city ?? '',
    state:            t?.state ?? '',
    date:             t ? formatDate(t.event_date) : '',
    holdAmountCents:  row.hold_fee_paid_cents,
    entryAmountCents: t?.entry_fee_cents ?? 0,
    status:           'held',
    heldAt:           row.created_at,
  };
}

const REG_SELECT = `
  id, tournament_id, division_id, player_id, partner_id,
  status, hold_fee_paid_cents, entry_fee_paid_cents, needs_partner, created_at,
  tournaments(name, venue_name, city, state, event_date, entry_fee_cents, hold_fee_cents),
  divisions(name, skill_min, skill_max),
  player:profiles!registrations_player_id_fkey(full_name,dupr),
  partner:profiles!registrations_partner_id_fkey(full_name,dupr)
`.trim();

// ─── Player queries ───────────────────────────────────────────────────────────

export async function fetchPlayerRegistrations(playerId: string): Promise<TournamentRegistration[]> {
  const { data, error } = await supabase
    .from('registrations')
    .select(REG_SELECT)
    .eq('player_id', playerId)
    .in('status', ['registered', 'checked_in', 'waitlisted', 'waitlist_offered', 'no_show']);

  if (error || !data) return [];
  return (data as unknown as RegistrationRow[]).map(rowToRegistration);
}

export async function fetchPlayerHolds(playerId: string): Promise<HeldSpot[]> {
  const { data, error } = await supabase
    .from('registrations')
    .select(REG_SELECT)
    .eq('player_id', playerId)
    .eq('status', 'held');

  if (error || !data) return [];
  return (data as unknown as RegistrationRow[]).map(rowToHeldSpot);
}

export async function fetchTournamentRegistrations(tournamentId: string): Promise<TournamentRegistration[]> {
  const { data, error } = await supabase
    .from('registrations')
    .select(REG_SELECT)
    .eq('tournament_id', tournamentId)
    .not('status', 'in', '(held,expired_hold)');

  if (error || !data) return [];
  return (data as unknown as RegistrationRow[]).map(rowToRegistration);
}

// ─── Player state checks ──────────────────────────────────────────────────────

export async function isPlayerRegistered(tournamentId: string, playerId: string): Promise<boolean> {
  const { count } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerId)
    .in('status', ['registered', 'checked_in', 'waitlisted', 'waitlist_offered']);

  return (count ?? 0) > 0;
}

export async function isPlayerHeld(
  tournamentId: string,
  divisionId: string,
  playerId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('division_id', divisionId)
    .eq('player_id', playerId)
    .eq('status', 'held');

  return (count ?? 0) > 0;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createHold(input: {
  tournamentId: string;
  divisionId: string;
  playerId: string;
  holdFeePaidCents: number;
  needsPartner: boolean;
}): Promise<HeldSpot | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('registrations')
    .insert({
      tournament_id:        input.tournamentId,
      division_id:          input.divisionId,
      player_id:            input.playerId,
      status:               'held',
      hold_fee_paid_cents:  input.holdFeePaidCents,
      entry_fee_paid_cents: 0,
      needs_partner:        input.needsPartner,
      director_added:       false,
      created_at:           now,
      updated_at:           now,
    })
    .select(REG_SELECT)
    .single();

  if (error || !data) return null;
  return rowToHeldSpot(data as unknown as RegistrationRow);
}

export async function convertHoldToRegistration(
  holdId: string,
  entryFeePaidCents: number,
): Promise<TournamentRegistration | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('registrations')
    .update({ status: 'registered', entry_fee_paid_cents: entryFeePaidCents, converted_at: now, updated_at: now })
    .eq('id', holdId)
    .select(REG_SELECT)
    .single();

  if (error || !data) return null;
  return rowToRegistration(data as unknown as RegistrationRow);
}

export async function cancelRegistration(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function cancelHold(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'expired_hold', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function checkInPlayer(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'checked_in', checked_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function undoCheckIn(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'registered', checked_in_at: null, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function markNoShow(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'no_show', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function moveToWaitlist(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'waitlisted', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function restoreFromWaitlist(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'registered', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function restoreNoShow(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'registered', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'no_show');
}

export async function createRegistration(input: {
  tournamentId: string;
  divisionId: string;
  playerId: string;
  entryFeePaidCents: number;
  needsPartner: boolean;
  partnerId?: string;
}): Promise<TournamentRegistration | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('registrations')
    .insert({
      tournament_id:        input.tournamentId,
      division_id:          input.divisionId,
      player_id:            input.playerId,
      partner_id:           input.partnerId ?? null,
      status:               'registered',
      hold_fee_paid_cents:  0,
      entry_fee_paid_cents: input.entryFeePaidCents,
      needs_partner:        input.needsPartner,
      director_added:       false,
      created_at:           now,
      updated_at:           now,
    })
    .select(REG_SELECT)
    .single();

  if (error || !data) return null;
  return rowToRegistration(data as unknown as RegistrationRow);
}

export async function restoreCancelled(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'registered', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'withdrawn');
}
