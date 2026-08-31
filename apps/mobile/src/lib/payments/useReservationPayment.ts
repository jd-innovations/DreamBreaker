import { useState } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { createBookingPaymentIntent, pollForReservationConfirmation } from './reservationPaymentIntent';
import { track } from '@/lib/analytics';
import { isOnlineNow } from '@/lib/network';

// Booking Engine Phase 3A — the real PaymentSheet hook, wired into
// booking/review.tsx as of Phase 3.1. Importing this (and therefore
// @stripe/stripe-react-native) from a screen means the booking flow only
// bundles on native targets; Metro's web bundler still refuses the Stripe SDK
// over a transitive ReactFabric import. Verify on a dev-client device build,
// not `expo start --web`.
//
// Follows the same contract as useTournamentEntryPayment.ts:
// the client NEVER declares a reservation production-confirmed off its own
// PaymentSheet result. It only creates the PaymentIntent, presents Stripe's
// native PaymentSheet, then polls the server for the webhook-confirmed state
// -- mirroring that hook's waitForRegistration() polling pattern, but
// against reservations.status instead of a registrations row.

export type PaymentOutcome =
  | { status: 'confirmed' }
  | { status: 'succeeded_pending_confirmation' }
  | { status: 'canceled' }
  | { status: 'failed'; message: string }
  | { status: 'error'; code: string };

export function useReservationPayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [processing, setProcessing] = useState(false);

  async function payForReservation(reservationId: string, attemptId: string): Promise<PaymentOutcome> {
    setProcessing(true);
    // Every branch below reports exactly once, because a payment funnel with a
    // silent branch is worse than none: a start with no outcome is
    // indistinguishable from a crash mid-checkout, which is the one thing you
    // would drop everything to investigate.
    track('payment_started', { reservation_id: reservationId, source: 'booking' });
    try {
      // Checked here, not at render: the connection can drop between the screen
      // painting and the tap, and this is the tap that moves money.
      //
      // Stripe would fail on its own, but not cleanly — initPaymentSheet can
      // hang, and a PaymentSheet that opens and then errors mid-flow is how a
      // user ends up unsure whether they were charged. 5.4's requirement is "no
      // false success while offline"; refusing before the sheet opens is the
      // only version of that with a clear recovery path.
      if (!(await isOnlineNow())) {
        track('payment_failed', { reservation_id: reservationId, error_code: 'offline' });
        return { status: 'error', code: 'offline' };
      }

      const intentResult = await createBookingPaymentIntent(reservationId, attemptId);
      if (!intentResult.ok) {
        track('payment_failed', { reservation_id: reservationId, error_code: intentResult.code });
        return { status: 'error', code: intentResult.code };
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: intentResult.clientSecret,
        merchantDisplayName: 'Pickleball App',
      });
      if (initError) {
        track('payment_failed', { reservation_id: reservationId, error_code: initError.code ?? 'init_failed' });
        return { status: 'error', code: initError.code ?? 'init_failed' };
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        // Canceled is its own event, not a failure. Someone closing the sheet
        // is a normal outcome; filing it as a failure would make the payment
        // system look broken in proportion to how many people browse.
        if (presentError.code === 'Canceled') {
          track('payment_canceled', { reservation_id: reservationId });
          return { status: 'canceled' };
        }
        // The Stripe code, never presentError.message — that string is shown to
        // the user and can name the card or the decline reason.
        track('payment_failed', { reservation_id: reservationId, error_code: presentError.code ?? 'present_failed' });
        return { status: 'failed', message: presentError.message ?? 'Payment failed.' };
      }

      // PaymentSheet succeeded client-side. Per the contract above, this is
      // NOT itself proof the reservation is confirmed -- poll briefly for the
      // server-confirmed state before reporting anything stronger than
      // "succeeded, pending confirmation."
      const confirmed = await pollForReservationConfirmation(reservationId);
      // `result` separates the two success shapes. They are not the same thing:
      // "the card was charged" and "the reservation is confirmed" diverging is
      // precisely the condition 3.3's reconciliation queue exists to catch, and
      // the rate is worth watching without opening the admin screen.
      track('payment_succeeded', {
        reservation_id: reservationId,
        result: confirmed ? 'confirmed' : 'pending_confirmation',
      });
      return confirmed ? { status: 'confirmed' } : { status: 'succeeded_pending_confirmation' };
    } finally {
      setProcessing(false);
    }
  }

  return { payForReservation, processing };
}
