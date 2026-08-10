import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { isPlayerRegistered } from '@/lib/supabase/registrations';

// First domain-specific consumer of the shared payment foundation
// (supabase/functions/_shared/payments.ts). Replaces the direct client
// write to registrations.entry_fee_paid_cents that TODO1.1.md flags as
// Task C7 — the client never declares payment success itself; it only
// presents Stripe's native PaymentSheet, then waits for the server (which
// only creates the registration after a webhook-confirmed PaymentIntent) to
// reflect it.
//
// `useStripe` from '@stripe/stripe-react-native' is intentionally NOT
// imported here right now: it's a native module that Expo Router's
// route-manifest bundling pulls in eagerly for every screen (tournament/[id]/
// register.tsx imports this file), which breaks Metro module resolution
// under Expo Go for the whole app, not just this screen. Booking Engine's
// payment phase is deferred (see BOOKING_ENGINE_PHASE1_REPORT.md / the
// Phase 2 plan), and per that same direction this tournament-payment path
// is stubbed out too until the app moves to a custom dev client build.
// Re-add `import { useStripe } from '@stripe/stripe-react-native';` and the
// initPaymentSheet/presentPaymentSheet calls below when that lands.

export type PayTournamentEntryInput = {
  tournamentId: string;
  divisionId: string;
  playerId: string;
  partnerId?: string;
  needsPartner: boolean;
};

export type PayTournamentEntryFailureReason =
  | 'already_registered'
  | 'no_payment_required'
  | 'canceled'
  | 'failed';

export type PayTournamentEntryResult =
  | { ok: true }
  | { ok: false; reason: PayTournamentEntryFailureReason };

async function waitForRegistration(tournamentId: string, playerId: string): Promise<boolean> {
  // The registrations row is created by the webhook handler, asynchronously
  // relative to presentPaymentSheet() resolving — poll briefly rather than
  // assuming it already exists.
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await isPlayerRegistered(tournamentId, playerId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

export function useTournamentEntryPayment() {
  async function payTournamentEntry(_input: PayTournamentEntryInput): Promise<PayTournamentEntryResult> {
    // Stubbed — see the module-level comment above. Fails closed (never
    // silently pretends a payment succeeded) rather than calling Stripe.
    return { ok: false, reason: 'failed' };
  }

  return { payTournamentEntry };
}
