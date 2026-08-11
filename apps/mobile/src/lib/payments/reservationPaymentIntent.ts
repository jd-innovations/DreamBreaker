import { supabase } from '@/lib/supabase';
import { fetchReservationById } from '@/lib/supabase/reservations';

// Booking Engine Phase 3A. Deliberately Stripe-SDK-free -- this file must
// never import @stripe/stripe-react-native (directly or transitively).
// Confirmed 2026-08-11: importing that package anywhere reachable from
// src/app/ breaks Expo Router's route-manifest bundle on BOTH available
// targets in this dev environment (web: "Importing react-native internals
// is not supported on web" via a transitive ReactFabric import in its
// helpers.js; Expo Go: "Unable to resolve module @stripe/stripe-react-native").
// See BOOKING_ENGINE_PHASE3_REPORT.md. useReservationPayment.ts (the actual
// PaymentSheet hook) imports the functions below rather than duplicating
// them, but is itself only safe to import from a custom Expo dev client
// build -- not from any screen under src/app/ in this environment.

export const RESERVATION_PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to pay for this reservation.',
  unauthorized: 'Please sign in to pay for this reservation.',
  not_organizer: 'Only the organizer can pay for this reservation.',
  reservation_not_found: 'This reservation no longer exists.',
  already_confirmed: 'This reservation is already confirmed.',
  reservation_unavailable: 'This reservation is no longer available.',
  hold_expired: 'Your hold expired. Please choose a new time.',
  no_payment_required: 'This reservation has no charge to pay.',
  payment_intent_failed: 'Could not start payment. Please try again.',
};

export function reservationPaymentErrorMessage(code: string): string {
  return RESERVATION_PAYMENT_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

async function extractErrorCode(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through to unknown_error
    }
  }
  return 'unknown_error';
}

export type CreateBookingPaymentIntentResult =
  | { ok: true; clientSecret: string; amountCents: number }
  | { ok: false; code: string };

// Calls create-booking-payment-intent (supabase/functions/) -- resolves the
// authoritative, server-snapshotted reservations.final_price_cents (already
// incl. any Flash Deal discount) and creates/reuses a `payments` row + Stripe
// PaymentIntent attached to the EXISTING reservation. Never creates a second
// reservation.
export async function createBookingPaymentIntent(
  reservationId: string,
  attemptId: string,
): Promise<CreateBookingPaymentIntentResult> {
  const { data, error } = await supabase.functions.invoke('create-booking-payment-intent', {
    body: { reservationId, attemptId },
  });
  if (error || !data) {
    return { ok: false, code: await extractErrorCode(error) };
  }
  return { ok: true, clientSecret: data.clientSecret, amountCents: data.amountCents };
}

// Polls reservations.status for the webhook-confirmed 'confirmed' state.
// Never used to make the client itself declare the reservation finalized --
// see the callers' own comments for the "do not claim finalized from the
// client" contract this exists to support.
export async function pollForReservationConfirmation(
  reservationId: string,
  attempts = 5,
  intervalMs = 1500,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetchReservationById(reservationId).catch(() => null);
    if (res?.status === 'confirmed') return true;
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

// ── Payment status lookup (for Review, Confirmation, My Bookings, Game Status) ─
//
// A reservation confirmed via the pre-Stripe test-mode path (confirmReservation()
// called directly, with no PaymentIntent ever created) has NO payments row at
// all -- that's expected, not an error. Callers should treat "no row found"
// as "test mode / no payment record," not a failure.

export type ReservationPaymentStatus = {
  id: string;
  status: 'requires_confirmation' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded' | 'partially_refunded';
  provider: string;
  amountCents: number;
  reservationId: string;
};

export async function fetchReservationPayment(reservationId: string): Promise<ReservationPaymentStatus | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, status, provider, amount_cents, purpose_id')
    .eq('purpose_type', 'reservation_payment')
    .eq('purpose_id', reservationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, status: data.status, provider: data.provider, amountCents: data.amount_cents, reservationId: data.purpose_id };
}

// Bulk variant for My Bookings -- one query for every reservation on the
// screen instead of N, matching the batched-lookup pattern its enrich() step
// already uses for facilities/courts/ball_machines/roster counts.
export async function fetchReservationPayments(reservationIds: string[]): Promise<Map<string, ReservationPaymentStatus>> {
  if (reservationIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('payments')
    .select('id, status, provider, amount_cents, purpose_id, created_at')
    .eq('purpose_type', 'reservation_payment')
    .in('purpose_id', reservationIds)
    .order('created_at', { ascending: false });
  if (error || !data) return new Map();

  const map = new Map<string, ReservationPaymentStatus>();
  for (const row of data) {
    if (map.has(row.purpose_id)) continue; // already-newer row kept (data is ordered desc)
    map.set(row.purpose_id, { id: row.id, status: row.status, provider: row.provider, amountCents: row.amount_cents, reservationId: row.purpose_id });
  }
  return map;
}

export function reservationPaymentStatusLabel(payment: ReservationPaymentStatus | null): string {
  if (!payment) return 'Test Mode';
  if (payment.provider === 'dev_test') return payment.status === 'succeeded' ? 'Paid (Dev Test)' : 'Dev Test Pending';
  switch (payment.status) {
    case 'succeeded': return 'Paid';
    case 'requires_confirmation':
    case 'processing': return 'Payment Pending';
    case 'failed': return 'Payment Failed';
    case 'canceled': return 'Payment Canceled';
    case 'refunded': return 'Refunded';
    case 'partially_refunded': return 'Partially Refunded';
    default: return 'Test Mode';
  }
}
