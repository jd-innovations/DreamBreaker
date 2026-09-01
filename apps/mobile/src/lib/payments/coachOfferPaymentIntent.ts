import { supabase } from '@/lib/supabase';

// Coach Marketplace — the client half of the purchase path.
//
// Deliberately Stripe-SDK-free, same rule as reservationPaymentIntent.ts: this
// file must never import @stripe/stripe-react-native, directly or
// transitively, so status lookups stay usable from any target. The SDK lives
// in useCoachOfferPayment.ts alone.
//
// One structural difference from bookings and tournaments, and it matters:
// there is no purchase row before this runs. create-coach-offer-purchase-payment-intent
// calls create_coach_offer_purchase() to MINT the row (resolving price,
// commission, buyer fee, inventory and purchase limits entirely server-side)
// and only then creates the PaymentIntent. So the client sends an offer id and
// gets a purchase id back — it never sends an amount, and never learns the
// price until the server has committed to it.

// Every code create_coach_offer_purchase() can raise, read out of the deployed
// function rather than guessed. An unmapped code falls through to the generic
// message, so a new server-side check degrades to vague-but-honest instead of
// showing a raw Postgres string.
export const COACH_OFFER_PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to book this lesson.',
  offer_not_found: 'This lesson is no longer available.',
  offer_not_active: 'This lesson is not currently open for booking.',
  offer_sold_out: 'This lesson just sold out.',
  cannot_purchase_own_offer: 'You cannot book your own lesson.',
  coach_not_publish_ready: 'This coach is not set up to accept bookings yet.',
  purchase_limit_exceeded: 'You have reached the booking limit for this lesson.',
  participant_quantity_exceeds_offer_max: 'That is more participants than this lesson allows.',
  // The RPC rejects premium_only offers outright: no Premium membership system
  // exists anywhere in the repo. Named rather than hidden so the message is
  // true — this is not a temporary glitch the user can retry past.
  premium_membership_not_available: 'This lesson is limited to Premium members, which is not available yet.',
  payment_intent_failed: 'Could not start payment. Please try again.',
  // States plainly that nothing was charged: the request never left the device,
  // and the fear after a failed payment is always double billing.
  offline: "You're offline. Connect to the internet and try again — nothing was charged.",
};

export function coachOfferPaymentErrorMessage(code: string): string {
  return COACH_OFFER_PAYMENT_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
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

export type CreateCoachOfferPaymentIntentResult =
  | { ok: true; clientSecret: string; purchaseId: string; amountCents: number }
  | { ok: false; code: string };

/**
 * Mints the purchase and its PaymentIntent in one server round trip.
 *
 * `attemptId` is folded into the edge function's idempotency key
 * (`coach_offer_purchase:<purchaseId>:<attemptId>`), so a retry of the same
 * attempt reuses the same PaymentIntent instead of charging twice.
 */
export async function createCoachOfferPaymentIntent(
  offerId: string,
  participantQuantity: number,
  attemptId: string,
): Promise<CreateCoachOfferPaymentIntentResult> {
  const { data, error } = await supabase.functions.invoke('create-coach-offer-purchase-payment-intent', {
    body: { offerId, participantQuantity, attemptId },
  });
  if (error || !data) {
    return { ok: false, code: await extractErrorCode(error) };
  }
  return {
    ok: true,
    clientSecret: data.clientSecret,
    purchaseId: data.purchaseId,
    amountCents: data.amountCents,
  };
}

// Matches the window the booking and tournament hooks arrived at the hard way:
// measured production latency from PaymentIntent creation to webhook
// finalization has been ~22s, and polling only starts once PaymentSheet closes.
const CONFIRMATION_TIMEOUT_MS = 30_000;

/**
 * Polls coach_offer_purchases.status for the webhook-confirmed 'finalized'
 * state, with backoff.
 *
 * A false return means ONLY "not visible yet", never "the payment failed":
 * Stripe has already captured the money by the time this runs, and the webhook
 * is authoritative. The client must never declare a purchase finalized on the
 * strength of its own PaymentSheet result — that is what lets "the card was
 * charged" and "the lesson is booked" silently diverge.
 */
export async function pollForCoachPurchaseFinalized(
  purchaseId: string,
  timeoutMs = CONFIRMATION_TIMEOUT_MS,
): Promise<boolean> {
  const isFinalized = async () => {
    const { data } = await supabase
      .from('coach_offer_purchases')
      .select('status')
      .eq('id', purchaseId)
      .maybeSingle();
    return data?.status === 'finalized';
  };

  const deadline = Date.now() + timeoutMs;
  let delay = 750;

  while (Date.now() < deadline) {
    if (await isFinalized()) return true;
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.4), 4000);
  }

  // One last look after the final wait, so a result that arrived during the
  // sleep is not reported as "not yet".
  return isFinalized();
}
