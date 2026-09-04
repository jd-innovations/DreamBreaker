import { supabase } from '@/lib/supabase';
import { fetchReservationById } from '@/lib/supabase/reservations';

// Booking Engine Phase 3A. Deliberately Stripe-SDK-free -- this file must
// never import @stripe/stripe-react-native (directly or transitively), so
// that server-side payment lookups (fetchReservationPayment and friends)
// stay usable from any target.
//
// The old restriction that nothing under src/app/ could reach the Stripe SDK
// was web-bundler-specific: Metro's web target refuses
// @stripe/stripe-react-native because of a transitive ReactFabric import.
// That is still true, and the web target still cannot render the booking
// payment flow. It no longer constrains the app, which runs on a custom Expo
// dev client / device build -- useReservationPayment.ts is wired into
// booking/review.tsx as of Phase 3.1.

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
  // 5.4. Named separately from the generic fallback because "Something went
  // wrong" invites a retry that will fail the same way, while this one names
  // the fix. It also states that nothing was charged: the request never left
  // the device, and the fear after a failed payment is always double billing.
  offline: "You're offline. Connect to the internet and try again — nothing was charged.",
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

// How long to wait for the webhook to reflect a payment before handing the
// user back a "still confirming" message. Matches the window
// useTournamentEntryPayment.ts arrived at the hard way: measured production
// latency from PaymentIntent creation to webhook finalization has been ~22s,
// and the poll only starts once PaymentSheet closes. The previous 5 x 1500ms
// (7.5s) window here would have expired on essentially every real payment.
const CONFIRMATION_TIMEOUT_MS = 30_000;

// Polls reservations.status for the webhook-confirmed 'confirmed' state, with
// backoff so a slow confirmation doesn't hammer the API.
//
// Never used to make the client itself declare the reservation finalized --
// see the callers' own comments for the "do not claim finalized from the
// client" contract this exists to support. A false return means ONLY "not
// visible yet", never "the payment failed": Stripe has already captured the
// money by the time this runs, and the webhook is authoritative.
export async function pollForReservationConfirmation(
  reservationId: string,
  timeoutMs = CONFIRMATION_TIMEOUT_MS,
): Promise<boolean> {
  const isConfirmed = async () => {
    const res = await fetchReservationById(reservationId).catch(() => null);
    return res?.status === 'confirmed';
  };

  const deadline = Date.now() + timeoutMs;
  let delay = 750;

  while (Date.now() < deadline) {
    if (await isConfirmed()) return true;
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.4), 4000);
  }

  // One last look after the final wait, so we never report "not yet" on a
  // result that arrived during the sleep.
  return isConfirmed();
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
