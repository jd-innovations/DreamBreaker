import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { isOnlineNow } from '@/lib/network';
import { track } from '@/lib/analytics';

// A joiner paying their own convenience fee.
//
// join_reservation() has already reserved the seat as `held` with a 10-minute
// expiry, so by the time this runs the seat is theirs — nothing here decides
// capacity, and nothing here can oversell.
//
// Deliberately thinner than useReservationPayment: that hook polls the server
// because a reservation is only production-confirmed by a webhook. A join fee
// confirms the caller's OWN seat row and nothing else, so the confirm RPC is
// the authority and there is nothing to wait for.

export type JoinFeeOutcome =
  | { status: 'confirmed' }
  | { status: 'no_fee' }
  | { status: 'canceled' }
  | { status: 'failed'; message: string }
  | { status: 'error'; code: string };

async function createJoinFeeIntent(
  reservationId: string,
  attemptId: string,
): Promise<{ ok: true; clientSecret: string; amountCents: number } | { ok: false; code: string }> {
  const { data, error } = await supabase.functions.invoke('create-join-fee-payment-intent', {
    body: { reservationId, attemptId },
  });

  if (error) {
    const code = typeof data?.error === 'string' ? data.error : 'payment_intent_failed';
    return { ok: false, code };
  }
  if (!data?.clientSecret) return { ok: false, code: 'payment_intent_failed' };
  return { ok: true, clientSecret: data.clientSecret, amountCents: data.amountCents ?? 0 };
}

export function useJoinFeePayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [processing, setProcessing] = useState(false);

  async function payJoinFee(reservationId: string, attemptId: string): Promise<JoinFeeOutcome> {
    setProcessing(true);
    track('payment_started', { reservation_id: reservationId, source: 'join_fee' });
    try {
      // Checked at the tap, not at render: the connection can drop between the
      // screen painting and the moment that moves money.
      if (!(await isOnlineNow())) {
        track('payment_failed', { reservation_id: reservationId, source: 'join_fee', reason: 'offline' });
        return { status: 'error', code: 'offline' };
      }

      const intent = await createJoinFeeIntent(reservationId, attemptId);
      if (!intent.ok) {
        // The seat exists and needs no charge — join_reservation already
        // confirmed it. Not a failure.
        if (intent.code === 'no_payment_required' || intent.code === 'already_paid') {
          track('payment_succeeded', { reservation_id: reservationId, source: 'join_fee', reason: intent.code });
          return { status: 'no_fee' };
        }
        track('payment_failed', { reservation_id: reservationId, source: 'join_fee', reason: intent.code });
        return { status: 'error', code: intent.code };
      }

      const init = await initPaymentSheet({
        merchantDisplayName: 'Pickleball App',
        paymentIntentClientSecret: intent.clientSecret,
      });
      if (init.error) {
        track('payment_failed', { reservation_id: reservationId, source: 'join_fee', reason: 'init_failed' });
        return { status: 'failed', message: init.error.message };
      }

      const result = await presentPaymentSheet();
      if (result.error) {
        const canceled = result.error.code === 'Canceled';
        track(canceled ? 'payment_canceled' : 'payment_failed',
              { reservation_id: reservationId, source: 'join_fee' });
        return canceled
          ? { status: 'canceled' }
          : { status: 'failed', message: result.error.message };
      }

      const { error: confirmError } = await supabase.rpc('confirm_reservation_player', {
        p_reservation_id: reservationId,
      });
      if (confirmError) {
        // Paid but not seated. Says so rather than claiming success — the
        // charge is real and support needs to be able to find it.
        track('payment_failed', { reservation_id: reservationId, source: 'join_fee', reason: 'confirm_failed' });
        return { status: 'error', code: 'paid_but_not_confirmed' };
      }

      track('payment_succeeded', { reservation_id: reservationId, source: 'join_fee' });
      return { status: 'confirmed' };
    } finally {
      setProcessing(false);
    }
  }

  return { payJoinFee, processing };
}

export function joinFeeErrorMessage(code: string): string {
  switch (code) {
    case 'offline':
      return 'You appear to be offline. Reconnect and try again.';
    case 'hold_expired':
      return 'Your seat was released while you were paying. Try joining again.';
    case 'not_joined':
      return 'That booking no longer has a seat held for you.';
    case 'organizer_already_paid':
      return 'You booked this court, so your fee was already paid.';
    case 'paid_but_not_confirmed':
      return 'Your payment went through but we could not seat you. Contact support and we will sort it out.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
