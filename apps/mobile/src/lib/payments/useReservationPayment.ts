import { useState } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { createBookingPaymentIntent, pollForReservationConfirmation } from './reservationPaymentIntent';

// Booking Engine Phase 3A — the real PaymentSheet hook. NOT currently
// imported by any screen under src/app/: doing so breaks the Metro bundle in
// this dev environment (see reservationPaymentIntent.ts's header comment and
// BOOKING_ENGINE_PHASE3_REPORT.md). This file is code-complete and ready to
// wire into booking/review.tsx the moment the app runs via a custom Expo dev
// client on a real device/simulator instead.
//
// Follows the contract documented in the (stubbed) useTournamentEntryPayment.ts:
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
