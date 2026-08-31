import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { balanceDueCents, effectiveEntryFeeCents } from '@/lib/tournamentFees';
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
    // Division-level override of the tournament's base entry fee. This is the
    // amount the server will actually charge — see @/lib/tournamentFees.
    entry_fee_cents: number | null;
  } | null;
  player: { full_name: string | null; dupr: number | null } | null;
  partner: { full_name: string | null; dupr: number | null } | null;
  // Doubles/mixed teams where each player owes their own entry fee
  // (supabase/migrations/20260817010000_registration_team_payment_groups.sql).
  // NULL for singles and for every registration predating that migration.
  registration_group_id: string | null;
  registration_groups: {
    id: string;
    status: string;
    registration_group_members: { user_id: string; payment_state: string }[] | null;
  } | null;
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
    // Division fee overrides the tournament's, matching what the server charges.
    balanceDue:       balanceDueCents(
                        effectiveEntryFeeCents(div?.entry_fee_cents, t?.entry_fee_cents),
                        row.entry_fee_paid_cents,
                      ),
    partnerRequired:  row.needs_partner,
    partnerStatus:    row.partner_id ? 'selected' : row.needs_partner ? 'choose_later' : 'none',
    partnerId:        row.partner_id ?? undefined,
    partnerName:      row.partner?.full_name ?? undefined,
    partnerDupr:      row.partner?.dupr != null ? String(Number(row.partner.dupr).toFixed(2)) : undefined,
    ...teamFieldsFor(row),
  };
}

// Per-player team payment state, when this registration belongs to one.
// `entry_fee_paid_cents` on this row is only ever THIS player's own payment,
// so the partner's state has to come from their own member row — that is the
// difference between "you paid" and "the team is in".
function teamFieldsFor(row: RegistrationRow): Partial<TournamentRegistration> {
  const group = row.registration_groups;
  if (!group) return {};

  const partnerMember = (group.registration_group_members ?? []).find(m => m.user_id !== row.player_id);

  return {
    teamGroupId: group.id,
    teamStatus:  group.status as TournamentRegistration['teamStatus'],
    teamPartnerPaymentState: partnerMember?.payment_state as TournamentRegistration['teamPartnerPaymentState'],
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
    entryAmountCents: effectiveEntryFeeCents(div?.entry_fee_cents, t?.entry_fee_cents),
    status:           'held',
    heldAt:           row.created_at,
  };
}

const REG_SELECT = `
  id, tournament_id, division_id, player_id, partner_id,
  status, hold_fee_paid_cents, entry_fee_paid_cents, needs_partner, created_at,
  registration_group_id,
  tournaments(name, venue_name, city, state, event_date, entry_fee_cents, hold_fee_cents),
  divisions(name, skill_min, skill_max, entry_fee_cents),
  player:profiles!registrations_player_id_fkey(full_name,dupr),
  partner:profiles!registrations_partner_id_fkey(full_name,dupr),
  registration_groups(id, status, registration_group_members(user_id, payment_state))
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

// Single-registration lookup for the player's own Check-In QR screen. RLS
// ("registrations: player read own") already scopes this to registrations
// the caller owns, so this is safe to expose to any authenticated player.
export async function fetchRegistrationById(id: string): Promise<TournamentRegistration | null> {
  const { data, error } = await supabase
    .from('registrations')
    .select(REG_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToRegistration(data as unknown as RegistrationRow);
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

/** What actually happened, so the caller can tell the user the truth. */
export type CancelRegistrationResult = {
  cancelled: boolean;
  /** 'none' when no refund was owed (inside the window, or already refunded). */
  refundStatus: 'none' | 'submitted' | 'failed';
  refundedCents: number;
  /** Hold My Spot deposit, reported so the deduction can be explained. */
  nonRefundableCents: number;
  error: string | null;
};

/**
 * Cancels a registration through the cancel-registration edge function.
 *
 * Was a direct `update({ status: 'withdrawn' })` from the client, which is why
 * cancelling on mobile silently skipped the refund and the waitlist promotion
 * that cancelling on web performs -- the same person got a different financial
 * outcome depending on which device they used. Neither step can happen from a
 * client: the refund amount has to be derived server-side from what was
 * actually paid, and RLS rightly forbids a client writing to refunds or
 * promoting anyone off a waitlist.
 *
 * It also used to return void and discard the error, so a failed cancellation
 * looked identical to a successful one.
 */
export async function cancelRegistration(id: string): Promise<CancelRegistrationResult> {
  const failed = (error: string): CancelRegistrationResult => ({
    cancelled: false, refundStatus: 'none', refundedCents: 0, nonRefundableCents: 0, error,
  });

  // No reason sent. This used to pass a hardcoded 'Cancelled by player' on
  // every call including the director workspace's, so the refunds audit row
  // recorded a director's cancellation as the player's own. Who cancelled is
  // now derived server-side from the rule that authorised the call.
  const { data, error } = await supabase.functions.invoke('cancel-registration', {
    body: { registrationIds: [id] },
  });

  if (error) return failed('request_failed');

  const outcome = (data as { outcomes?: {
    cancelled: boolean;
    refundStatus: 'none' | 'submitted' | 'failed';
    refundedCents: number;
    nonRefundableCents: number;
    error?: string;
  }[] } | null)?.outcomes?.[0];

  if (!outcome) return failed('no_outcome');

  return {
    cancelled: outcome.cancelled,
    refundStatus: outcome.refundStatus,
    refundedCents: outcome.refundedCents,
    nonRefundableCents: outcome.nonRefundableCents,
    error: outcome.error ?? null,
  };
}

export async function cancelHold(id: string): Promise<void> {
  await supabase
    .from('registrations')
    .update({ status: 'expired_hold', updated_at: new Date().toISOString() })
    .eq('id', id);
}

// Phase 5.1: result shape of the check_in_registration() RPC
// (supabase/migrations/20260814000000_tournament_qr_checkin_phase5_1.sql).
// Both the manual "Check In" button and the QR scanner call this same RPC —
// see that migration's header comment for why a raw client UPDATE was no
// longer sufficient (duplicate check-in, cross-tournament protection,
// confirmation data all need to be server-authoritative and atomic).
export type CheckInResult = {
  result: 'success' | 'already_checked_in' | 'wrong_tournament' | 'unauthorized' | 'ineligible' | 'not_found';
  reason: string | null;
  registrationId: string | null;
  playerName: string | null;
  divisionName: string | null;
  tournamentName: string | null;
  checkedInAt: string | null;
};

export async function checkInRegistration(
  registrationId: string,
  tournamentId: string,
  /** Which surface initiated it. Both paths land here, and the split matters:
   *  a scanner that keeps failing over to manual entry is a broken scanner. */
  method: 'scan' | 'manual' = 'manual',
): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in_registration', {
    p_registration_id: registrationId,
    p_tournament_id: tournamentId,
  });
  if (error) {
    track('checkin_failed', { tournament_id: tournamentId, checkin_method: method, error_code: 'rpc_error' });
    throw new Error(error.message);
  }

  const row = data?.[0];
  if (!row) {
    track('checkin_failed', { tournament_id: tournamentId, checkin_method: method, error_code: 'empty_response' });
    throw new Error('No response from check-in');
  }

  // `result` is the RPC's own enum, not free text — already_checked_in and
  // wrong_tournament are the two worth telling apart at a busy desk. reason and
  // playerName are deliberately never sent.
  track(row.result === 'success' ? 'checkin_succeeded' : 'checkin_failed', {
    tournament_id: tournamentId,
    checkin_method: method,
    ...(row.result === 'success' ? {} : { error_code: row.result as string }),
  });

  return {
    result: row.result as CheckInResult['result'],
    reason: row.reason ?? null,
    registrationId: row.registration_id ?? null,
    playerName: row.player_name ?? null,
    divisionName: row.division_name ?? null,
    tournamentName: row.tournament_name ?? null,
    checkedInAt: row.checked_in_at ?? null,
  };
}

// Manual check-in button wrapper. Throws if the RPC didn't report a fresh
// success -- callers that need to distinguish already-checked-in/
// wrong-tournament/etc. from a hard failure should call
// checkInRegistration() directly instead (as the QR scan flow does).
export async function checkInPlayer(id: string, tournamentId: string): Promise<void> {
  const outcome = await checkInRegistration(id, tournamentId);
  if (outcome.result !== 'success') {
    throw new Error(
      outcome.result === 'already_checked_in' ? 'This player is already checked in.'
      : outcome.result === 'unauthorized'     ? 'You are not authorized to check players into this tournament.'
      : outcome.result === 'wrong_tournament' ? 'This registration belongs to a different tournament.'
      : outcome.result === 'ineligible'       ? 'This registration is not eligible for check-in.'
      : 'Registration not found.',
    );
  }
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
