import { supabase } from '@/lib/supabase';

// Facility Marketplace Phase 5 — check-in.
//
// Attendance only. Payout eligibility is the slot elapsing, not the scan (see
// v_facility_payable_reservations), so nothing here moves money and a no-show
// still pays the facility.

export type CheckInResult = {
  reservationId: string;
  facilityName: string | null;
  assetName: string | null;
  playerName: string | null;
  slotStart: string;
  alreadyCheckedIn: boolean;
};

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in.',
  invalid_method: 'Something went wrong reading that code.',
  reservation_not_found: 'No booking matches that code. Check the characters and try again.',
  not_facility_staff: 'That booking is for a different facility.',
  reservation_not_confirmed: 'That booking is not confirmed — it may be unpaid, cancelled or expired.',
  too_early: 'Too early. Check-in opens two hours before the booking starts.',
  slot_ended: 'That booking has already ended.',
};

// Supabase rejects with a PostgrestError — a plain object, not an Error.
export function checkInErrorMessage(err: unknown): string {
  const raw =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return text;
  }
  return raw || 'Could not check in. Please try again.';
}

/** What the player's QR encodes. Plain text so a desk can read it aloud. */
export function checkInQrValue(code: string): string {
  return code.trim().toUpperCase();
}

export async function checkInReservation(
  code: string,
  method: 'qr' | 'manual',
): Promise<{ ok: true; result: CheckInResult } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('check_in_reservation', {
    p_code: code.trim().toUpperCase(),
    p_method: method,
  });
  if (error) return { ok: false, message: checkInErrorMessage(error) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, message: MESSAGES.reservation_not_found };

  return {
    ok: true,
    result: {
      reservationId: row.reservation_id,
      facilityName: row.facility_name,
      assetName: row.asset_name,
      playerName: row.player_name,
      slotStart: row.slot_start,
      alreadyCheckedIn: !!row.already_checked_in,
    },
  };
}

/** The player's own code, for the booking screen. */
export async function fetchCheckInCode(reservationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('reservations')
    .select('check_in_code')
    .eq('id', reservationId)
    .maybeSingle();
  if (error || !data) return null;
  return data.check_in_code;
}
