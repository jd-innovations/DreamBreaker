import { useState } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { createBookingPaymentIntent, pollForReservationConfirmation } from './reservationPaymentIntent';

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
    try {
      const intentResult = await createBookingPaymentIntent(reservationId, attemptId);
      if (!intentResult.ok) return { status: 'error', code: intentResult.code };

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: intentResult.clientSecret,
        merchantDisplayName: 'Pickleball App',
      });
      if (initError) return { status: 'error', code: initError.code ?? 'init_failed' };

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return { status: 'canceled' };
        return { status: 'failed', message: presentError.message ?? 'Payment failed.' };
      }

      // PaymentSheet succeeded client-side. Per the contract above, this is
      // NOT itself proof the reservation is confirmed -- poll briefly for the
      // server-confirmed state before reporting anything stronger than
      // "succeeded, pending confirmation."
      const confirmed = await pollForReservationConfirmation(reservationId);
      return confirmed ? { status: 'confirmed' } : { status: 'succeeded_pending_confirmation' };
    } finally {
      setProcessing(false);
    }
  }

  return { payForReservation, processing };
}
