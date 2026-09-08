import { useState } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { createCoachOfferPaymentIntent, pollForCoachPurchaseFinalized } from './coachOfferPaymentIntent';
import { track } from '@/lib/analytics';
import { isOnlineNow } from '@/lib/network';

// Coach Marketplace — the PaymentSheet hook for buying a lesson.
//
// Same contract as useReservationPayment.ts and useTournamentEntryPayment.ts:
// the client NEVER declares a purchase finalized off its own PaymentSheet
// result. It creates the PaymentIntent, presents Stripe's native sheet, then
// polls the server for the webhook-confirmed state. The webhook is what
// appends the ledger event and issues the wallet voucher; nothing here does.
//
// Importing this (and therefore @stripe/stripe-react-native) from a screen
// means that screen only bundles on native targets — Metro's web bundler
// refuses the Stripe SDK over a transitive ReactFabric import. Verify on a dev
// client device build, not `expo start --web`.

export type CoachPaymentOutcome =
  | { status: 'finalized'; purchaseId: string }
  | { status: 'succeeded_pending_confirmation'; purchaseId: string }
  | { status: 'canceled' }
  | { status: 'failed'; message: string }
  | { status: 'error'; code: string };

export function useCoachOfferPayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [processing, setProcessing] = useState(false);

  async function payForCoachOffer(
    offerId: string,
    participantQuantity: number,
    attemptId: string,
  ): Promise<CoachPaymentOutcome> {
    setProcessing(true);
    // Every branch below reports exactly once. A payment funnel with a silent
    // branch is worse than none: a start with no outcome is indistinguishable
    // from a crash mid-checkout.
    track('payment_started', { offer_id: offerId, source: 'lessons' });
    try {
      // Checked at the tap, not at render: the connection can drop between the
      // screen painting and the tap that moves money. Refusing before the sheet
      // opens is the only failure mode with a clear recovery path.
      if (!(await isOnlineNow())) {
        track('payment_failed', { offer_id: offerId, error_code: 'offline' });
        return { status: 'error', code: 'offline' };
      }

      const intentResult = await createCoachOfferPaymentIntent(offerId, participantQuantity, attemptId);
      if (!intentResult.ok) {
        track('payment_failed', { offer_id: offerId, error_code: intentResult.code });
        return { status: 'error', code: intentResult.code };
      }

      const { purchaseId } = intentResult;

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: intentResult.clientSecret,
        merchantDisplayName: 'Pickleball App',
      });
      if (initError) {
        track('payment_failed', { offer_id: offerId, purchase_id: purchaseId, error_code: initError.code ?? 'init_failed' });
        return { status: 'error', code: initError.code ?? 'init_failed' };
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        // Canceled is its own event, not a failure. Someone closing the sheet
        // is a normal outcome, and filing it as a failure would make the
        // payment system look broken in proportion to how many people browse.
        //
        // The abandoned purchase row stays `payment_pending` and simply stops
        // holding inventory once it expires — the RPC counts only unexpired
        // holds, so nothing needs cleaning up here.
        if (presentError.code === 'Canceled') {
          track('payment_canceled', { offer_id: offerId, purchase_id: purchaseId });
          return { status: 'canceled' };
        }
        // The Stripe code, never presentError.message — that string is shown to
        // the user and can name the card or the decline reason.
        track('payment_failed', { offer_id: offerId, purchase_id: purchaseId, error_code: presentError.code ?? 'present_failed' });
        return { status: 'failed', message: presentError.message ?? 'Payment failed.' };
      }

      // PaymentSheet succeeded client-side. Per the contract above, that is not
      // itself proof the purchase is finalized or the voucher issued — poll for
      // the server-confirmed state before reporting anything stronger.
      const finalized = await pollForCoachPurchaseFinalized(purchaseId);
      // The two success shapes are not the same thing: "the card was charged"
      // and "the lesson is booked" diverging is exactly what the reconciliation
      // path exists to catch, and the rate is worth watching without opening
      // the admin screen.
      track('payment_succeeded', {
        offer_id: offerId,
        purchase_id: purchaseId,
        result: finalized ? 'confirmed' : 'pending_confirmation',
      });
      return finalized
        ? { status: 'finalized', purchaseId }
        : { status: 'succeeded_pending_confirmation', purchaseId };
    } finally {
      setProcessing(false);
    }
  }

  return { payForCoachOffer, processing };
}
