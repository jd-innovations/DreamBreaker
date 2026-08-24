// Cancels one or more tournament registrations and issues any refund the
// cancellation policy owes. Refund foundation, part 2 (part 1 is migration
// 20260824170000: the refunds table and compute_registration_refund).
//
// Ordering is deliberate and is the whole design:
//
//   1. authorise      -- who may cancel this row
//   2. record intent  -- refunds row written BEFORE Stripe is called
//   3. cancel         -- registration -> withdrawn
//   4. ask Stripe     -- refunds.create, idempotent per payment
//   5. promote        -- next waitlisted player, window met or not
//
// The refunds row is written first so a crash between "we decided you are owed
// money" and "Stripe has it" leaves evidence instead of silence. Cancellation
// happens before the Stripe call because holding someone's spot hostage to a
// payment-provider outage is worse than owing them money you have recorded --
// a failed refund is a row someone can retry, a failed cancellation is a
// person still registered for an event they have left.
//
// The amount is NEVER taken from the request. compute_registration_refund()
// derives it from what the player actually paid; a client-supplied figure
// would be a client deciding how much money to send itself.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18";
import { getServiceClient, getStripe } from "../_shared/payments.ts";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type RequestBody = {
  registrationIds?: unknown;
  reason?: unknown;
};

type Outcome = {
  registrationId: string;
  cancelled: boolean;
  refundStatus: "none" | "submitted" | "failed";
  refundedCents: number;
  nonRefundableCents: number;
  ineligibleReason: string | null;
  error?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: CORS });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const registrationIds = Array.isArray(body.registrationIds)
    ? body.registrationIds.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Cancelled by player";

  if (registrationIds.length === 0) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }
  // A doubles team is two members. Anything larger is not a shape this endpoint
  // produces, so treat it as malformed rather than looping over it.
  if (registrationIds.length > 2) {
    return new Response(JSON.stringify({ error: "too_many_registrations" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();
  const outcomes: Outcome[] = [];

  for (const registrationId of registrationIds) {
    outcomes.push(await cancelOne(service, registrationId, user.id, reason));
  }

  return new Response(JSON.stringify({ outcomes }), { headers: CORS });
});

type ServiceClient = ReturnType<typeof getServiceClient>;

async function cancelOne(
  service: ServiceClient,
  registrationId: string,
  actorId: string,
  reason: string,
): Promise<Outcome> {
  const base: Outcome = {
    registrationId,
    cancelled: false,
    refundStatus: "none",
    refundedCents: 0,
    nonRefundableCents: 0,
    ineligibleReason: null,
  };

  const { data: reg } = await service
    .from("registrations")
    .select("id, status, tournament_id, player_id, partner_id, registration_group_id, stripe_entry_intent_id")
    .eq("id", registrationId)
    .maybeSingle();

  if (!reg) return { ...base, error: "registration_not_found" };

  // Authorisation FIRST. This used to sit below the already-withdrawn check,
  // which meant any signed-in caller could pass an arbitrary registration id
  // and tell "does not exist" apart from "exists and is withdrawn" by the
  // response shape -- an enumeration oracle over other people's registrations.
  // Nothing was modifiable that way, but the status of a stranger's row is not
  // ours to confirm either.
  if (!(await mayCancel(service, reg, actorId))) {
    return { ...base, error: "not_authorized" };
  }

  // Already gone. Idempotent by design: a retried request must not produce a
  // second refund, and the unique index on refunds would reject it anyway.
  if (reg.status === "withdrawn") return { ...base, cancelled: true, ineligibleReason: "already_withdrawn" };

  // ── 1. What is owed, decided server-side ──────────────────────────────────
  const { data: quoteRows, error: quoteError } = await service
    .rpc("compute_registration_refund", { p_registration_id: registrationId });

  if (quoteError) {
    console.error(`[cancel-registration] compute failed for ${registrationId} :: ${quoteError.message}`);
    return { ...base, error: "refund_computation_failed" };
  }

  const quote = (Array.isArray(quoteRows) ? quoteRows[0] : quoteRows) as {
    eligible: boolean;
    refundable_cents: number;
    non_refundable_cents: number;
    cutoff_days: number;
    days_until_event: number;
    entry_payment_id: string | null;
    ineligible_reason: string | null;
  } | undefined;

  if (!quote) return { ...base, error: "refund_computation_failed" };

  base.nonRefundableCents = quote.non_refundable_cents ?? 0;
  base.ineligibleReason = quote.ineligible_reason;

  // ── 2. Record the obligation before asking Stripe for anything ────────────
  let refundRowId: string | null = null;
  if (quote.eligible && quote.entry_payment_id && quote.refundable_cents > 0) {
    const { data: refundRow, error: refundInsertError } = await service
      .from("refunds")
      .insert({
        payment_id: quote.entry_payment_id,
        registration_id: registrationId,
        amount_cents: quote.refundable_cents,
        kind: "policy",
        reason,
        requested_by: actorId,
        // Frozen as evaluated. A director can change refund_cutoff_days later;
        // without this nobody can reconstruct why this amount was chosen.
        policy_snapshot: {
          cutoff_days: quote.cutoff_days,
          days_until_event: quote.days_until_event,
          refundable_cents: quote.refundable_cents,
          non_refundable_cents: quote.non_refundable_cents,
          evaluated_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (refundInsertError) {
      // The partial unique index rejects a second live refund for the same
      // payment. That is a duplicate request, not a failure — do not cancel
      // twice or refund twice, just report it.
      console.error(`[cancel-registration] refund row insert failed for ${registrationId} :: ${refundInsertError.message}`);
      return { ...base, error: "refund_already_in_progress" };
    }
    refundRowId = refundRow.id as string;
  }

  // ── 3. Cancel, before Stripe ──────────────────────────────────────────────
  const { error: cancelError } = await service
    .from("registrations")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("status", reg.status);

  if (cancelError) {
    // Nothing has been refunded yet. Void the intent so the row does not sit
    // pending forever against a registration that is still active.
    if (refundRowId) {
      await service.from("refunds")
        .update({ status: "canceled", failure_reason: `cancellation failed: ${cancelError.message}` })
        .eq("id", refundRowId);
    }
    return { ...base, error: "cancellation_failed" };
  }
  base.cancelled = true;

  // A partner left behind keeps their spot and needs a replacement, which is
  // theirs to find.
  if (reg.partner_id) {
    await service
      .from("registrations")
      .update({ needs_partner: true, partner_id: null, updated_at: new Date().toISOString() })
      .eq("tournament_id", reg.tournament_id)
      .eq("player_id", reg.partner_id)
      .neq("status", "withdrawn");
  }

  // ── 4. Ask Stripe ─────────────────────────────────────────────────────────
  if (refundRowId && quote.entry_payment_id) {
    const ok = await submitRefund(service, refundRowId, quote.entry_payment_id, quote.refundable_cents);
    base.refundStatus = ok ? "submitted" : "failed";
    base.refundedCents = ok ? quote.refundable_cents : 0;
  }

  // ── 5. Promote, window met or not ─────────────────────────────────────────
  // A freed spot is a freed spot; whether the leaver got their money back has
  // nothing to do with whether someone else can take it.
  const { error: promoteError } = await service
    .rpc("promote_next_waitlisted", { p_tournament_id: reg.tournament_id });
  if (promoteError) {
    console.error(`[cancel-registration] promotion failed for ${reg.tournament_id} :: ${promoteError.message}`);
  }

  return base;
}

/**
 * Own registration, or the person who actually paid for it. The payer rule is
 * what lets one half of a team cancel the other: they funded that entry, so
 * they may release it — and since Stripe returns money to the original payment
 * method, the refund goes back to them.
 */
async function mayCancel(
  service: ServiceClient,
  reg: { id: string; player_id: string | null; stripe_entry_intent_id: string | null },
  actorId: string,
): Promise<boolean> {
  if (reg.player_id && reg.player_id === actorId) return true;

  if (reg.stripe_entry_intent_id) {
    const { data: payment } = await service
      .from("payments")
      .select("payer_user_id")
      .eq("provider_payment_intent_id", reg.stripe_entry_intent_id)
      .maybeSingle();
    if (payment?.payer_user_id === actorId) return true;
  }

  // Team obligations settled through the group model record the payment
  // directly on the member row.
  const { data: member } = await service
    .from("registration_group_members")
    .select("payment_id")
    .eq("registration_id", reg.id)
    .not("payment_id", "is", null)
    .maybeSingle();

  if (member?.payment_id) {
    const { data: payment } = await service
      .from("payments")
      .select("payer_user_id")
      .eq("id", member.payment_id)
      .maybeSingle();
    if (payment?.payer_user_id === actorId) return true;
  }

  return false;
}

/**
 * Idempotency key is derived from the payment, not the request, so a retried
 * or double-submitted cancellation reuses the same Stripe refund instead of
 * issuing a second one.
 *
 * Does NOT write payments.refunded_amount_cents — the charge.refunded webhook
 * owns that, and having two writers for the same field is how a refund ends up
 * counted twice.
 */
async function submitRefund(
  service: ServiceClient,
  refundRowId: string,
  paymentId: string,
  amountCents: number,
): Promise<boolean> {
  const { data: payment } = await service
    .from("payments")
    .select("provider_payment_intent_id")
    .eq("id", paymentId)
    .maybeSingle();

  const intentId = payment?.provider_payment_intent_id;
  if (!intentId) {
    await service.from("refunds")
      .update({ status: "failed", failure_reason: "payment has no provider_payment_intent_id" })
      .eq("id", refundRowId);
    return false;
  }

  try {
    const refund = await getStripe().refunds.create(
      { payment_intent: intentId, amount: amountCents },
      { idempotencyKey: `refund:${paymentId}:${amountCents}` },
    );
    await service.from("refunds")
      .update({ status: "submitted", provider_refund_id: refund.id })
      .eq("id", refundRowId);
    return true;
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError ? err.message : String(err);
    // Left as 'failed' rather than retried here: the row is the retry handle,
    // and a refund that silently retries inside a request is how you end up
    // sending money twice.
    console.error(
      `[cancel-registration] PAYMENT_RECONCILIATION_REQUIRED refund failed ` +
        `refund=${refundRowId} payment=${paymentId} amount_cents=${amountCents} :: ${message}`,
    );
    await service.from("refunds")
      .update({ status: "failed", failure_reason: message })
      .eq("id", refundRowId);
    return false;
  }
}
