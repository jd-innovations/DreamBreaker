import * as Crypto from 'expo-crypto';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '@/lib/supabase';
import { isPlayerHeld, isPlayerRegistered } from '@/lib/supabase/registrations';
import { fetchRegistrationGroup, memberFor } from '@/lib/supabase/registrationGroups';

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

async function waitForHold(tournamentId: string, divisionId: string, playerId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await isPlayerHeld(tournamentId, divisionId, playerId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

// Team payments confirm ONE player's obligation, so the thing to wait for is
// that player's own member row flipping to 'paid' — never the group reaching
// 'confirmed', which requires the partner to have paid too and may not happen
// for days.
async function waitForOwnObligationPaid(groupId: string, playerId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const group = await fetchRegistrationGroup(groupId);
    const me = group ? memberFor(group, playerId) : null;
    if (me?.paymentState === 'paid') return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

export function useTournamentEntryPayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  async function presentTournamentPayment(clientSecret: string): Promise<PayTournamentEntryResult> {
    const { error: initError } = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: 'DreamBreaker PB',
    });
    if (initError) {
      console.error('[presentTournamentPayment] initPaymentSheet error:', initError.code, initError.message);
      return { ok: false, reason: 'failed' };
    }

    const { error: presentError } = await presentPaymentSheet();
    if (presentError) {
      console.error('[presentTournamentPayment] presentPaymentSheet error:', presentError.code, presentError.message);
      if (presentError.code === 'Canceled') return { ok: false, reason: 'canceled' };
      return { ok: false, reason: 'failed' };
    }

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
    return registered ? { ok: true } : { ok: false, reason: 'failed' };
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
    return held ? { ok: true } : { ok: false, reason: 'failed' };
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
    return registered ? { ok: true } : { ok: false, reason: 'failed' };
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
    return paid ? { ok: true, groupId } : { ok: false, reason: 'failed' };
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
    return paid ? { ok: true, groupId: input.groupId } : { ok: false, reason: 'failed' };
  }

  return {
    payTournamentEntry,
    payTournamentHold,
    payTournamentBalance,
    payTournamentTeamEntry,
    payTournamentTeamShare,
  };
}
