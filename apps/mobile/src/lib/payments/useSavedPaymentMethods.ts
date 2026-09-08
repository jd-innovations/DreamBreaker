import { useState } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { createSetupIntent, confirmPaymentMethod, type SavedPaymentMethod } from './paymentMethods';
import { track } from '@/lib/analytics';
import { isOnlineNow } from '@/lib/network';

// The Stripe-SDK-importing half of paymentMethods.ts, split out for the same
// reason useReservationPayment.ts is split from reservationPaymentIntent.ts:
// @stripe/stripe-react-native is native-only and unavailable on the web
// Metro target, so only the screen that actually presents PaymentSheet should
// pull it in.
//
// "Add a card" contract, mirroring useReservationPayment.ts's money contract
// but applied to card attachment: this hook never declares a card saved off
// PaymentSheet's client-side result alone. presentPaymentSheet() succeeding
// only means Stripe confirmed the SetupIntent; confirmPaymentMethod() (the
// edge function) re-retrieves that SetupIntent from Stripe server-side and
// only THEN writes the local payment_methods row. See that function's own
// comment for why this is safe to do synchronously rather than via webhook.

export type AddCardOutcome =
  | { status: 'saved'; paymentMethod: SavedPaymentMethod }
  | { status: 'canceled' }
  | { status: 'failed'; message: string }
  | { status: 'error'; code: string };

// SetupIntent client secrets are "seti_<id>_secret_<secret>" -- the id is
// everything before "_secret_". Stripe does not return the SetupIntent id
// separately from presentPaymentSheet(), so it's recovered from the client
// secret this hook already has in closure, the same way Stripe's own guides
// do it for this exact case.
function setupIntentIdFromClientSecret(clientSecret: string): string {
  return clientSecret.split('_secret_')[0];
}

export function useSavedPaymentMethods() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [processing, setProcessing] = useState(false);

  async function addPaymentMethod(): Promise<AddCardOutcome> {
    setProcessing(true);
    // Reuses the existing payment_started/succeeded/failed/canceled events
    // (packages/shared/src/analytics.ts) rather than inventing new ones —
    // that union is a deliberate allowlist ("an event that is never analysed
    // is still a row someone has to reason about"), and this genuinely is a
    // Stripe payment-sheet funnel, just presenting a SetupIntent instead of a
    // PaymentIntent. `source: 'add_card'` (an already-allowed property)
    // distinguishes it from a real charge in the funnel data.
    const SOURCE = 'add_card';
    track('payment_started', { source: SOURCE });
    try {
      if (!(await isOnlineNow())) {
        track('payment_failed', { source: SOURCE, error_code: 'offline' });
        return { status: 'error', code: 'offline' };
      }

      const intentResult = await createSetupIntent();
      if (!intentResult.ok) {
        track('payment_failed', { source: SOURCE, error_code: intentResult.code });
        return { status: 'error', code: intentResult.code };
      }

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: intentResult.setupIntentClientSecret,
        customerId: intentResult.customerId,
        customerEphemeralKeySecret: intentResult.ephemeralKeySecret,
        merchantDisplayName: 'Pickleball App',
      });
      if (initError) {
        track('payment_failed', { source: SOURCE, error_code: initError.code ?? 'init_failed' });
        return { status: 'error', code: initError.code ?? 'init_failed' };
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') {
          track('payment_canceled', { source: SOURCE });
          return { status: 'canceled' };
        }
        // The Stripe code, never presentError.message -- same rule
        // useReservationPayment.ts follows, for the same reason: that string
        // can name the card or the decline reason.
        track('payment_failed', { source: SOURCE, error_code: presentError.code ?? 'present_failed' });
        return { status: 'failed', message: presentError.message ?? 'Could not save this card.' };
      }

      const setupIntentId = setupIntentIdFromClientSecret(intentResult.setupIntentClientSecret);
      const confirmResult = await confirmPaymentMethod(setupIntentId);
      if (!confirmResult.ok) {
        track('payment_failed', { source: SOURCE, error_code: confirmResult.code });
        return { status: 'error', code: confirmResult.code };
      }

      track('payment_succeeded', { source: SOURCE });
      return { status: 'saved', paymentMethod: confirmResult.paymentMethod };
    } finally {
      setProcessing(false);
    }
  }

  return { addPaymentMethod, processing };
}
