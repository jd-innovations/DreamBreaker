import * as Crypto from 'expo-crypto';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase';
import { isPlayerHeld, isPlayerRegistered } from '@/lib/supabase/registrations';
import { fetchRegistrationGroup, memberFor } from '@/lib/supabase/registrationGroups';
import { track } from '@/lib/analytics';

// First domain-specific consumer of the shared payment foundation
// (supabase/functions/_shared/payments.ts). Replaces the direct client
// write to registrations.entry_fee_paid_cents that TODO1.1.md flags as
// Task C7 — the client never declares payment success itself; it only
// presents Stripe's native PaymentSheet, then waits for the server (which
// only creates the registration after a webhook-confirmed PaymentIntent) to
// reflect it. Mirrors useReservationPayment.ts's contract and shape.

export type PayTournamentEntryInput = {
  tournamentId: string;
  divisionId: string;
  playerId: string;
  partnerId?: string;
  needsPartner: boolean;
};

export type PayTournamentHoldInput = {
  tournamentId: string;
  divisionId: string;
  playerId: string;
  needsPartner: boolean;
};

export type PayTournamentBalanceInput = {
  registrationId: string;
  tournamentId: string;
  playerId: string;
  partnerId?: string;
};

export type PayTournamentTeamEntryInput = {
  tournamentId: string;
  divisionId: string;
  playerId: string;
  partnerId: string;
};

export type PayTournamentTeamShareInput = {
  groupId: string;
  playerId: string;
};

export type PayTournamentEntryFailureReason =
  | 'already_registered'
  | 'partner_already_registered'
  | 'invite_not_active'
  | 'no_payment_required'
  | 'canceled'
  // NOT a failure. Stripe captured the payment, but the webhook hadn't
  // reflected it before we stopped waiting. The money is real and the
  // registration will appear. Callers MUST NOT show a failure message for
  // this — telling someone their payment failed seconds after their card was
  // charged is the worst thing this flow can do, and it invites a duplicate
  // charge when they retry.
  | 'pending_confirmation'
  | 'failed';

export type PayTournamentEntryResult =
  | { ok: true }
  | { ok: false; reason: PayTournamentEntryFailureReason };

export type PayTournamentTeamResult =
  | { ok: true; groupId: string }
  | { ok: false; reason: PayTournamentEntryFailureReason };

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

// How long to wait for the webhook to reflect a payment before handing the
// user back a "still confirming" message. Measured production latency from
// PaymentIntent creation to webhook finalization has been ~22s, and the poll
// only starts once PaymentSheet closes — a 10s window (the original value)
// expired on perfectly good payments and told people they had failed.
const CONFIRMATION_TIMEOUT_MS = 30_000;

/**
 * Polls until the webhook's effect is visible, with backoff so a slow
 * confirmation doesn't hammer the API.
 *
 * A false return means ONLY "not visible yet" — never "the payment failed".
 * Stripe has already captured the money by this point; the webhook is
 * authoritative and will land. Callers must not present this as a failure.
 */
async function waitForConfirmation(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;
  let delay = 750;

  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.4), 4000);
  }

  // One last look after the final wait, so we never report "not yet" on a
  // result that arrived during the sleep.
  return check();
}

async function waitForRegistration(tournamentId: string, playerId: string): Promise<boolean> {
  return waitForConfirmation(() => isPlayerRegistered(tournamentId, playerId));
}

async function waitForHold(tournamentId: string, divisionId: string, playerId: string): Promise<boolean> {
  return waitForConfirmation(() => isPlayerHeld(tournamentId, divisionId, playerId));
}

// Team payments confirm ONE player's obligation, so the thing to wait for is
// that player's own member row flipping to 'paid' — never the group reaching
// 'confirmed', which requires the partner to have paid too and may not happen
// for days.
async function waitForOwnObligationPaid(groupId: string, playerId: string): Promise<boolean> {
  return waitForConfirmation(async () => {
    const group = await fetchRegistrationGroup(groupId);
    const me = group ? memberFor(group, playerId) : null;
    return me?.paymentState === 'paid';
  });
}

export function useTournamentEntryPayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  async function presentTournamentPayment(clientSecret: string): Promise<PayTournamentEntryResult> {
    // Instrumented here rather than in each of the four entry paths (solo,
    // partner, group, waitlist): they all funnel through this one sheet, and
    // four copies would be four chances for the branches to disagree.
    track('payment_started', { source: 'tournament_entry' });

    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: 'Pickleball App',
    });
    if (initError) {
      console.error('[presentTournamentPayment] initPaymentSheet error:', initError.code, initError.message);
      track('payment_failed', { source: 'tournament_entry', error_code: initError.code ?? 'init_failed' });
      return { ok: false, reason: 'failed' };
    }

    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      console.error('[presentTournamentPayment] presentPaymentSheet error:', presentError.code, presentError.message);
      if (presentError.code === 'Canceled') {
        track('payment_canceled', { source: 'tournament_entry' });
        return { ok: false, reason: 'canceled' };
      }
      // The code, never the message: it is user-facing text and can name the
      // card or the decline reason.
      track('payment_failed', { source: 'tournament_entry', error_code: presentError.code ?? 'present_failed' });
      return { ok: false, reason: 'failed' };
    }

    track('payment_succeeded', { source: 'tournament_entry' });
    return { ok: true };
  }

  async function payTournamentEntry(input: PayTournamentEntryInput): Promise<PayTournamentEntryResult> {
    const attemptId = Crypto.randomUUID();

    const { data, error } = await supabase.functions.invoke('create-tournament-entry-payment-intent', {
      body: {
        tournamentId: input.tournamentId,
        divisionId:   input.divisionId,
        partnerId:    input.partnerId ?? null,
        needsPartner: input.needsPartner,
        attemptId,
      },
    });

    if (error || !data?.clientSecret) {
      const code = await extractErrorCode(error);
      if (code === 'already_registered') return { ok: false, reason: 'already_registered' };
      if (code === 'no_payment_required') return { ok: false, reason: 'no_payment_required' };
      return { ok: false, reason: 'failed' };
    }

    const payment = await presentTournamentPayment(data.clientSecret);
    if (!payment.ok) return payment;

    // PaymentSheet succeeded client-side. Per the contract above, this is
    // NOT itself proof the registration exists — poll for the
    // webhook-confirmed registrations row before reporting success.
    const registered = await waitForRegistration(input.tournamentId, input.playerId);
    return registered ? { ok: true } : { ok: false, reason: 'pending_confirmation' };
  }

  async function payTournamentHold(input: PayTournamentHoldInput): Promise<PayTournamentEntryResult> {
    const attemptId = Crypto.randomUUID();

    const { data, error } = await supabase.functions.invoke('create-tournament-hold-payment-intent', {
      body: {
        tournamentId: input.tournamentId,
        divisionId:   input.divisionId,
        needsPartner: input.needsPartner,
        attemptId,
      },
    });

    if (error || !data?.clientSecret) {
      const code = await extractErrorCode(error);
      if (code === 'already_registered') return { ok: false, reason: 'already_registered' };
      if (code === 'no_payment_required') return { ok: false, reason: 'no_payment_required' };
      return { ok: false, reason: 'failed' };
    }

    const payment = await presentTournamentPayment(data.clientSecret);
    if (!payment.ok) return payment;

    const held = await waitForHold(input.tournamentId, input.divisionId, input.playerId);
    return held ? { ok: true } : { ok: false, reason: 'pending_confirmation' };
  }

  async function payTournamentBalance(input: PayTournamentBalanceInput): Promise<PayTournamentEntryResult> {
    const attemptId = Crypto.randomUUID();

    const { data, error } = await supabase.functions.invoke('create-tournament-entry-balance-payment-intent', {
      body: {
        registrationId: input.registrationId,
        partnerId:      input.partnerId ?? null,
        attemptId,
      },
    });

    if (error || !data?.clientSecret) {
      const code = await extractErrorCode(error);
      if (code === 'already_registered') return { ok: false, reason: 'already_registered' };
      if (code === 'no_payment_required') return { ok: false, reason: 'no_payment_required' };
      return { ok: false, reason: 'failed' };
    }

    const payment = await presentTournamentPayment(data.clientSecret);
    if (!payment.ok) return payment;

    const registered = await waitForRegistration(input.tournamentId, input.playerId);
    return registered ? { ok: true } : { ok: false, reason: 'pending_confirmation' };
  }

  // Doubles/mixed, initiating player. Creates the team and BOTH obligations
  // server-side, then charges this player for their own share only — the
  // partner is left owing their own entry fee and pays via
  // payTournamentTeamShare below. Success here means "you are paid", never
  // "the team is in".
  async function payTournamentTeamEntry(input: PayTournamentTeamEntryInput): Promise<PayTournamentTeamResult> {
    const attemptId = Crypto.randomUUID();

    const { data, error } = await supabase.functions.invoke('create-tournament-team-entry-payment-intent', {
      body: {
        tournamentId: input.tournamentId,
        divisionId:   input.divisionId,
        partnerId:    input.partnerId,
        attemptId,
      },
    });

    if (error || !data?.clientSecret || !data?.groupId) {
      const code = await extractErrorCode(error);
      if (code === 'already_registered') return { ok: false, reason: 'already_registered' };
      if (code === 'partner_already_registered') return { ok: false, reason: 'partner_already_registered' };
      if (code === 'no_payment_required') return { ok: false, reason: 'no_payment_required' };
      return { ok: false, reason: 'failed' };
    }

    const groupId: string = data.groupId;

    const payment = await presentTournamentPayment(data.clientSecret);
    if (!payment.ok) return payment;

    const paid = await waitForOwnObligationPaid(groupId, input.playerId);
    return paid ? { ok: true, groupId } : { ok: false, reason: 'pending_confirmation' };
  }

  // The invited partner paying their own share of an existing team.
  async function payTournamentTeamShare(input: PayTournamentTeamShareInput): Promise<PayTournamentTeamResult> {
    const attemptId = Crypto.randomUUID();

    const { data, error } = await supabase.functions.invoke('create-tournament-team-member-payment-intent', {
      body: { groupId: input.groupId, attemptId },
    });

    if (error || !data?.clientSecret) {
      const code = await extractErrorCode(error);
      if (code === 'already_registered') return { ok: false, reason: 'already_registered' };
      if (code === 'no_payment_required') return { ok: false, reason: 'no_payment_required' };
      if (code === 'invite_not_active' || code === 'invite_expired' || code === 'invite_not_found') {
        return { ok: false, reason: 'invite_not_active' };
      }
      return { ok: false, reason: 'failed' };
    }

    const payment = await presentTournamentPayment(data.clientSecret);
    if (!payment.ok) return payment;

    const paid = await waitForOwnObligationPaid(input.groupId, input.playerId);
    return paid ? { ok: true, groupId: input.groupId } : { ok: false, reason: 'pending_confirmation' };
  }

  return {
    payTournamentEntry,
    payTournamentHold,
    payTournamentBalance,
    payTournamentTeamEntry,
    payTournamentTeamShare,
  };
}
