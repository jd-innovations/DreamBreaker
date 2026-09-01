// Cancels a court or ball-machine booking and issues any refund the facility's
// cancellation policy owes. Facility Marketplace Phase 8; the reservation twin
// of cancel-registration.
//
// Ordering is deliberate and is copied from cancel-registration, because the
// reasoning transfers exactly:
//
//   1. authorise      -- who may cancel this booking
//   2. record intent  -- refunds row written BEFORE Stripe is called
//   3. cancel         -- reservation -> cancelled
//   4. ask Stripe     -- refunds.create, idempotent per payment
//   5. settle         -- refunds row + payments.refunded_amount_cents
//
// The refunds row is written first so a crash between "we decided you are owed
// money" and "Stripe has it" leaves evidence instead of silence. Cancellation
// happens before the Stripe call because holding a court hostage to a
// payment-provider outage is worse than owing money that is on record -- a
// failed refund is a row someone can retry, a failed cancellation is a player
// still holding a slot they have left.
//
// The amount is NEVER taken from the request. compute_reservation_refund()
// derives it from what was actually paid; a client-supplied figure would be a
// client deciding how much money to send itself.
//
// Cancelling inside the window still CANCELS -- it just does not refund. The
// court was held and nobody else could book it, so the facility is paid
// (v_facility_payable_reservations), and the two conditions are exact
// complements so one payment is never both refunded and paid out.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient, getStripe } from "../_shared/payments.ts";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type Computed = {
  refundable: boolean;
  refundable_cents: number;
  payment_id: string | null;
  window_hours: number;
  hours_until_slot: number;
  reason: string | null;
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
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: CORS });
  }

  let reservationId = "";
  try {
    const body = await req.json();
    reservationId = typeof body.reservationId === "string" ? body.reservationId : "";
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }
  if (!reservationId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  // 1. What is owed, decided server-side.
  const { data: computedRaw, error: computeError } = await service
    .rpc("compute_reservation_refund", { p_reservation_id: reservationId });

  if (computeError) {
    return new Response(JSON.stringify({ error: "compute_failed", detail: computeError.message }), {
      status: 500, headers: CORS,
    });
  }

  const computed = (Array.isArray(computedRaw) ? computedRaw[0] : computedRaw) as Computed | undefined;
  if (!computed) {
    return new Response(JSON.stringify({ error: "reservation_not_found" }), { status: 404, headers: CORS });
  }

  const shouldRefund = computed.refundable && computed.refundable_cents > 0 && !!computed.payment_id;
  let refundId: string | null = null;

  // 2. Record intent, before Stripe.
  if (shouldRefund) {
    const { data: refundRow, error: refundInsertError } = await service
      .from("refunds")
      .insert({
        payment_id: computed.payment_id,
        amount_cents: computed.refundable_cents,
        kind: "policy",
        reason: "Booking cancelled " + Math.floor(computed.hours_until_slot) +
                "h before start; facility window is " + computed.window_hours + "h.",
        requested_by: user.id,
        status: "pending",
        provider: "stripe",
        // What the policy said at the moment it was applied. A window changed
        // next month must not make this decision unexplainable.
        policy_snapshot: {
          window_hours: computed.window_hours,
          hours_until_slot: computed.hours_until_slot,
          reservation_id: reservationId,
        },
      })
      .select("id")
      .single();

    if (refundInsertError || !refundRow) {
      return new Response(JSON.stringify({ error: "refund_record_failed", detail: refundInsertError?.message }), {
        status: 500, headers: CORS,
      });
    }
    refundId = refundRow.id;
  }

  // 3. Cancel, under the CALLER's rights.
  //
  // cancel_reservation() authorises: organizer, or manager-or-above at the
  // facility. Running it as the user rather than as service_role is what keeps
  // that check real.
  const { error: cancelError } = await userClient
    .rpc("cancel_reservation", { p_reservation_id: reservationId });

  if (cancelError) {
    // Nothing has been sent to Stripe yet. Void the intent so a pending refund
    // does not sit against a booking that is still live.
    if (refundId) {
      await service.from("refunds")
        .update({ status: "canceled", failure_reason: "cancellation refused: " + cancelError.message })
        .eq("id", refundId);
    }
    const msg = cancelError.message ?? "";
    const status = msg.includes("not_authorized") ? 403
      : msg.includes("already_terminal") ? 409
      : msg.includes("reservation_not_found") ? 404 : 400;
    return new Response(JSON.stringify({ error: msg || "cancel_failed" }), { status, headers: CORS });
  }

  if (!shouldRefund) {
    return new Response(JSON.stringify({
      ok: true,
      cancelled: true,
      refunded: false,
      reason: computed.reason,
      windowHours: computed.window_hours,
    }), { headers: CORS });
  }

  // 4. Stripe.
  try {
    const { data: payment } = await service
      .from("payments")
      .select("provider_payment_intent_id, refunded_amount_cents")
      .eq("id", computed.payment_id as string)
      .single();

    if (!payment?.provider_payment_intent_id) {
      await service.from("refunds")
        .update({ status: "failed", failure_reason: "payment has no provider intent id" })
        .eq("id", refundId as string);
      return new Response(JSON.stringify({ error: "refund_failed", detail: "no_payment_intent" }), {
        status: 500, headers: CORS,
      });
    }

    await service.from("refunds").update({ status: "submitted" }).eq("id", refundId as string);

    const refund = await getStripe().refunds.create(
      {
        payment_intent: payment.provider_payment_intent_id,
        amount: computed.refundable_cents,
        metadata: { refund_id: refundId as string, reservation_id: reservationId },
      },
      // The refunds row id: a retry returns Stripe's original refund rather
      // than issuing a second one.
      { idempotencyKey: "reservation_refund:" + refundId },
    );

    // 5. Settle.
    await service.from("refunds")
      .update({
        status: "succeeded",
        provider_refund_id: refund.id,
        completed_at: new Date().toISOString(),
      })
      .eq("id", refundId as string);

    await service.from("payments")
      .update({
        refunded_amount_cents: (payment.refunded_amount_cents ?? 0) + computed.refundable_cents,
        status: "refunded",
      })
      .eq("id", computed.payment_id as string);

    return new Response(JSON.stringify({
      ok: true,
      cancelled: true,
      refunded: true,
      refundedCents: computed.refundable_cents,
      stripeRefundId: refund.id,
    }), { headers: CORS });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cancel-reservation] refund failed", detail);
    // The booking is cancelled and the row records what is owed. A failed
    // refund is retryable from the refunds table; it is not lost.
    await service.from("refunds")
      .update({ status: "failed", failure_reason: detail.slice(0, 400) })
      .eq("id", refundId as string);

    return new Response(JSON.stringify({
      ok: true,
      cancelled: true,
      refunded: false,
      refundPending: true,
      detail: detail.slice(0, 200),
    }), { headers: CORS });
  }
});
