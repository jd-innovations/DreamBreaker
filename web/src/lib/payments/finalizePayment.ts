import { createServiceClient } from "@/lib/supabase/service";

// Shared purchase-finalization service (Coach Marketplace phased plan,
// Phase 0 dev/test mechanism). This is the ONE place that decides what
// happens when a payment succeeds — every domain's downstream logic
// (tournament registration today, Coach Marketplace purchases later) is
// dispatched from here by payments.purpose_type.
//
//   REAL STRIPE EVENT ──┐
//                       ├─▶ finalizePaymentSucceeded() ─▶ dispatchPaymentSucceeded()
//   DEV TEST EVENT ─────┘
//
// The Stripe webhook (web/src/app/api/stripe/webhooks/route.ts) and the
// dev-only simulation route (web/src/app/api/dev/simulate-payment/route.ts)
// both call finalizePaymentSucceeded() — neither one re-implements
// domain finalization logic itself. Do not add a second implementation of
// any of this.

export type ServiceClient = ReturnType<typeof createServiceClient>;

export type PaymentRow = {
  id: string;
  purpose_type: string;
  purpose_id: string;
  payer_user_id: string;
  amount_cents: number;
  metadata: unknown;
  status: string;
  provider: string;
  provider_payment_intent_id: string | null;
};

export function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string>;
}

/**
 * The single entrypoint for "this payment succeeded." Idempotent — calling
 * it twice for an already-succeeded payment is a no-op. Never call this
 * directly from a client-reachable code path without first having verified
 * the success out-of-band (a Stripe webhook signature, or the dev-only
 * simulation route's own guards) — this function itself trusts its caller
 * completely.
 */
export async function finalizePaymentSucceeded(service: ServiceClient, paymentId: string): Promise<void> {
  const { data: payment } = await service
    .from("payments")
    .select("id, purpose_type, purpose_id, payer_user_id, amount_cents, metadata, status, provider, provider_payment_intent_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    console.error(`[finalizePaymentSucceeded] No payments row ${paymentId}`);
    return;
  }
  if (payment.status === "succeeded") return; // already finalized

  await service
    .from("payments")
    .update({ status: "succeeded", confirmed_at: new Date().toISOString() })
    .eq("id", payment.id);

  await dispatchPaymentSucceeded(service, payment as PaymentRow);
}

// Domain dispatch: the only place in the shared payment foundation that
// knows about individual features. Adding a new domain (e.g. Coach
// Marketplace, Phase 3) means adding a case here, not touching payments/
// webhook idempotency logic or the dev simulation route.
async function dispatchPaymentSucceeded(service: ServiceClient, payment: PaymentRow) {
  if (payment.purpose_type === "tournament_registration_entry") {
    await finalizeTournamentRegistrationEntry(service, payment);
  } else if (payment.purpose_type === "tournament_registration_hold") {
    await finalizeTournamentRegistrationHold(service, payment);
  } else if (payment.purpose_type === "tournament_registration_balance") {
    await finalizeTournamentRegistrationBalance(service, payment);
  } else if (payment.purpose_type === "tournament_team_entry") {
    await finalizeTournamentTeamEntry(service, payment);
  } else if (payment.purpose_type === "coach_offer_purchase") {
    await finalizeCoachOfferPurchase(service, payment);
  } else if (payment.purpose_type === "reservation_payment") {
    await finalizeReservationPayment(service, payment);
  }
}

async function finalizeTournamentRegistrationHold(service: ServiceClient, payment: PaymentRow) {
  const meta = asStringRecord(payment.metadata);
  const tournamentId = meta.tournamentId ?? payment.purpose_id;
  const divisionId = meta.divisionId;
  const playerId = meta.playerId ?? payment.payer_user_id;
  const needsPartner = meta.needsPartner === "true";

  if (!divisionId) {
    console.error(`[finalizeTournamentRegistrationHold] payment ${payment.id} missing divisionId metadata`);
    return;
  }

  const { count } = await service
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .in("status", ["held", "registered", "checked_in", "waitlisted", "waitlist_offered"]);
  if ((count ?? 0) > 0) return;

  const { data: tournament } = await service
    .from("tournaments")
    .select("hold_duration_hours")
    .eq("id", tournamentId)
    .maybeSingle();

  const holdHours = Number(tournament?.hold_duration_hours ?? 72);
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + holdHours * 60 * 60 * 1000).toISOString();

  await service.from("registrations").insert({
    tournament_id: tournamentId,
    division_id: divisionId,
    player_id: playerId,
    status: "held",
    hold_fee_paid_cents: payment.amount_cents,
    entry_fee_paid_cents: 0,
    hold_expires_at: holdExpiresAt,
    stripe_hold_intent_id: payment.provider_payment_intent_id,
    needs_partner: needsPartner,
    director_added: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}

async function finalizeTournamentRegistrationBalance(service: ServiceClient, payment: PaymentRow) {
  const meta = asStringRecord(payment.metadata);
  const registrationId = meta.registrationId;
  const partnerId = meta.partnerId || null;
  const entryFeeCents = Number.parseInt(meta.entryFeeCents ?? "", 10);

  if (!registrationId || !Number.isFinite(entryFeeCents) || entryFeeCents <= 0) {
    console.error(`[finalizeTournamentRegistrationBalance] payment ${payment.id} missing registration metadata`);
    return;
  }

  const { data: registration } = await service
    .from("registrations")
    .select("id, status, player_id, tournament_id, division_id")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration || registration.status !== "held") return;

  const now = new Date().toISOString();
  await service
    .from("registrations")
    .update({
      status: "registered",
      partner_id: partnerId,
      entry_fee_paid_cents: entryFeeCents,
      converted_at: now,
      updated_at: now,
      stripe_entry_intent_id: payment.provider_payment_intent_id,
    })
    .eq("id", registrationId)
    .eq("status", "held");

  // A hold converted with a named partner still owes a SECOND entry fee —
  // this player's balance payment covered only their own. Give the partner
  // their own obligation so the team can't look complete on one payment.
  await ensureTeamObligation(service, payment, {
    tournamentId: meta.tournamentId || registration.tournament_id || "",
    divisionId: meta.divisionId || registration.division_id || "",
    playerId: registration.player_id,
    partnerId,
    amountCents: entryFeeCents,
  });
}

// Shared bridge from the single-payer registration paths (direct entry, and
// hold -> balance conversion) into the per-player team model. It creates the
// team + both obligations, then settles ONLY the paying player's own share.
// The partner is left 'invited' and pays through
// create-tournament-team-member-payment-intent.
//
// No-op for singles and for any registration without a named partner, which
// is why the existing flows are otherwise unchanged.
async function ensureTeamObligation(
  service: ServiceClient,
  payment: PaymentRow,
  input: { tournamentId: string; divisionId: string; playerId: string; partnerId: string | null; amountCents: number },
) {
  if (!input.partnerId || !input.tournamentId || !input.divisionId) return;
  if (input.partnerId === input.playerId) return;
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return;

  const { data: tournament } = await service
    .from("tournaments")
    .select("registration_closes_at")
    .eq("id", input.tournamentId)
    .maybeSingle();

  const { data: groupRows, error: groupError } = await service.rpc("ensure_registration_group", {
    p_tournament_id: input.tournamentId,
    p_division_id: input.divisionId,
    p_initiator_id: input.playerId,
    p_partner_id: input.partnerId,
    p_amount_due_cents: input.amountCents,
    p_expires_at: tournament?.registration_closes_at ?? undefined,
  });

  const group = Array.isArray(groupRows) ? groupRows[0] : groupRows;
  if (groupError || !group?.initiator_member_id) {
    console.error(`[ensureTeamObligation] payment ${payment.id} could not create team obligations:`, groupError?.message);
    return;
  }

  const { error } = await service.rpc("mark_registration_group_member_paid", {
    p_member_id: group.initiator_member_id,
    p_payment_id: payment.id,
    p_amount_cents: input.amountCents,
    p_stripe_intent_id: payment.provider_payment_intent_id ?? undefined,
  });

  if (error) {
    console.error(`[ensureTeamObligation] payment ${payment.id} could not settle initiator obligation:`, error.message);
  }
}

async function finalizeTournamentRegistrationEntry(service: ServiceClient, payment: PaymentRow) {
  const meta = asStringRecord(payment.metadata);
  const tournamentId = meta.tournamentId ?? payment.purpose_id;
  const divisionId = meta.divisionId;
  const playerId = meta.playerId ?? payment.payer_user_id;
  const partnerId = meta.partnerId || null;
  const needsPartner = meta.needsPartner === "true";

  if (!divisionId) {
    console.error(`[finalizeTournamentRegistrationEntry] payment ${payment.id} missing divisionId metadata`);
    return;
  }

  // Defense in depth against duplicate finalization beyond the webhook
  // idempotency table (e.g. a manual retry): skip if already registered.
  const { count } = await service
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .in("status", ["registered", "checked_in", "waitlisted", "waitlist_offered"]);
  if ((count ?? 0) > 0) return;

  const now = new Date().toISOString();
  await service.from("registrations").insert({
    tournament_id: tournamentId,
    division_id: divisionId,
    player_id: playerId,
    partner_id: partnerId,
    status: "registered",
    hold_fee_paid_cents: 0,
    entry_fee_paid_cents: payment.amount_cents,
    stripe_entry_intent_id: payment.provider_payment_intent_id,
    needs_partner: needsPartner,
    director_added: false,
    created_at: now,
    updated_at: now,
  });

  // This endpoint charges one player only. If a partner was named, that
  // partner still owes their own entry fee — record it rather than letting
  // the team look complete. (The mobile client routes doubles-with-partner
  // through create-tournament-team-entry-payment-intent instead; this covers
  // any caller that still comes through here.)
  await ensureTeamObligation(service, payment, {
    tournamentId,
    divisionId,
    playerId,
    partnerId,
    amountCents: payment.amount_cents,
  });
}

// Per-player team obligation (supabase/migrations/20260817010000_registration_
// team_payment_groups.sql). This settles exactly ONE player's share of a
// doubles/mixed team — the payer's own registrations row is created here, and
// their teammate's obligation is untouched. The team only becomes 'confirmed'
// when the last outstanding member's payment lands here too; that transition
// is derived by trg_sync_registration_group_status from the member rows, so
// nothing in this function can declare a team confirmed on its own.
//
// Idempotent via mark_registration_group_member_paid(), which returns the
// existing registration id unchanged for an already-paid member.
async function finalizeTournamentTeamEntry(service: ServiceClient, payment: PaymentRow) {
  const meta = asStringRecord(payment.metadata);
  const memberId = meta.memberId;

  if (!memberId) {
    console.error(`[finalizeTournamentTeamEntry] payment ${payment.id} missing memberId metadata`);
    return;
  }

  const { error } = await service.rpc("mark_registration_group_member_paid", {
    p_member_id: memberId,
    p_payment_id: payment.id,
    p_amount_cents: payment.amount_cents,
    p_stripe_intent_id: payment.provider_payment_intent_id ?? undefined,
  });

  if (error) {
    console.error(`[finalizeTournamentTeamEntry] payment ${payment.id} member ${memberId} failed:`, error.message);
  }
}

// Coach Marketplace V1 Phase 3. The purchase row (coach_offer_purchases)
// already exists in 'payment_pending' status by the time this runs — it was
// created by the create_coach_offer_purchase() RPC, which is also where
// every financial term was resolved and locked. This function's only job is
// to commit that already-decided outcome: flip status, decrement inventory
// exactly once, and append the one 'purchase' ledger event. It must never
// recompute or revalidate price/commission/fee — those are immutable.
async function finalizeCoachOfferPurchase(service: ServiceClient, payment: PaymentRow) {
  const purchaseId = payment.purpose_id;

  const { data: purchase } = await service
    .from("coach_offer_purchases")
    .select(
      "id, status, offer_id, participant_quantity, buyer_total_charged_cents, commission_source, commission_pct, platform_commission_amount_cents, coach_net_proceeds_cents",
    )
    .eq("id", purchaseId)
    .maybeSingle();

  if (!purchase) {
    console.error(`[finalizeCoachOfferPurchase] No coach_offer_purchases row ${purchaseId} for payment ${payment.id}`);
    return;
  }
  // Idempotency: a purchase can only ever leave 'payment_pending' once (the
  // DB trigger trg_protect_coach_offer_purchase_integrity also enforces
  // this at the schema level) — a repeated success event for the same
  // payment is therefore a safe no-op here.
  if (purchase.status !== "payment_pending") return;

  const processingFeeStatus = payment.provider === "dev_test" ? "not_applicable_dev_test" : "pending_reconciliation";
  const now = new Date().toISOString();

  await service
    .from("coach_offer_purchases")
    .update({ status: "finalized", paid_at: now, processing_fee_status: processingFeeStatus })
    .eq("id", purchase.id);

  await service.rpc("finalize_coach_offer_purchase_inventory", {
    p_offer_id: purchase.offer_id,
    p_quantity: purchase.participant_quantity,
  });

  await service.from("coach_offer_purchase_ledger_events").insert({
    purchase_id: purchase.id,
    event_type: "purchase",
    amount_cents: purchase.buyer_total_charged_cents,
    metadata: {
      paymentId: payment.id,
      commissionSource: purchase.commission_source,
      commissionPct: purchase.commission_pct,
      platformCommissionAmountCents: purchase.platform_commission_amount_cents,
      coachNetProceedsCents: purchase.coach_net_proceeds_cents,
      processingFeeStatus,
    },
  });

  // Phase 4: consumes the now-finalized purchase to issue the Wallet
  // voucher + its entitlement row(s). Self-idempotent (unique indexes on
  // both tables), so calling this is safe even though the payment_pending
  // guard above already means it only ever runs once per purchase today.
  await service.rpc("create_coach_voucher_from_finalized_purchase", { p_purchase_id: purchase.id });
}

// Booking Engine Phase 3A. Unlike tournament registration (which inserts a
// brand-new row here) or coach purchases (which flip an existing
// payment_pending row), the reservations row here already exists in 'held'
// status — create_reservation() (the Choose Time & Court RPC) created it
// before any payment was attempted. This function's only job is the same
// held -> confirmed transition the player-facing confirm_reservation() RPC
// performs, done directly with the service client (which bypasses RLS) so it
// never depends on the organizer's own session being live when a webhook
// fires asynchronously, possibly minutes later. Never call
// confirm_reservation() itself from here — that RPC checks
// organizer_id = auth.uid(), which is null for a service-role caller.
async function finalizeReservationPayment(service: ServiceClient, payment: PaymentRow) {
  const meta = asStringRecord(payment.metadata);
  const reservationId = meta.reservationId ?? payment.purpose_id;

  const { data: reservation } = await service
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
    .maybeSingle();

  if (!reservation) {
    console.error(`[finalizeReservationPayment] No reservations row ${reservationId} for payment ${payment.id}`);
    return;
  }

  // Idempotency: a repeated success event for the same payment (webhook
  // redelivery, or a manual retry) is a safe no-op once already confirmed.
  if (reservation.status === "confirmed") return;

  if (reservation.status !== "held") {
    // Payment succeeded but the reservation is no longer held (cancelled or
    // expired out from under it, e.g. the organizer cancelled while
    // PaymentSheet was open). Refund automation is explicitly out of scope
    // for Phase 3A — this is logged so it can be handled manually until a
    // refund foundation exists; it must NOT be silently confirmed, since the
    // slot itself may already be gone.
    console.error(
      `[finalizeReservationPayment] Payment ${payment.id} succeeded but reservation ${reservationId} is '${reservation.status}', not 'held' — needs manual review/refund.`,
    );
    return;
  }

  await service
    .from("reservations")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), hold_expires_at: null })
    .eq("id", reservationId)
    .eq("status", "held");
}
