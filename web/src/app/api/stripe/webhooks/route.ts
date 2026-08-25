import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { finalizePaymentSucceeded, type ServiceClient } from "@/lib/payments/finalizePayment";
import type Stripe from "stripe";

// Next.js must not parse the body — Stripe signature verification needs the raw bytes.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const service = createServiceClient();

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;

    // Shared across director and coach — this table update is role-neutral;
    // the coach_status transition below is the only role-specific bit, and
    // only touches rows where is_coach is true.
    if (account.charges_enabled) {
      // Onboarding complete — set timestamp if not already set
      await service
        .from("profiles")
        .update({ stripe_connect_onboarded_at: new Date().toISOString() })
        .eq("stripe_connect_account_id", account.id)
        .is("stripe_connect_onboarded_at", null);

      await service
        .from("profiles")
        .update({ coach_status: "active" })
        .eq("stripe_connect_account_id", account.id)
        .eq("is_coach", true)
        .in("coach_status", ["onboarding", "restricted"]);
    } else {
      // Account disabled (e.g. Stripe suspended it) — clear the timestamp
      await service
        .from("profiles")
        .update({ stripe_connect_onboarded_at: null })
        .eq("stripe_connect_account_id", account.id);

      await service
        .from("profiles")
        .update({ coach_status: "restricted" })
        .eq("stripe_connect_account_id", account.id)
        .eq("is_coach", true)
        .eq("coach_status", "active");
    }

    return NextResponse.json({ received: true });
  }

  // ── Shared payment foundation (TODO1.1.md Task C7) ─────────────────────────
  // This is the ONE place a REAL payments.status transition to 'succeeded'/
  // 'failed'/'refunded' happens from Stripe — never from a client request.
  // Actual domain finalization logic lives in
  // web/src/lib/payments/finalizePayment.ts, shared with the dev-only
  // simulation route (web/src/app/api/dev/simulate-payment/route.ts) so
  // there is exactly one implementation of "what happens when a payment
  // succeeds," regardless of which event source triggered it.
  const PAYMENT_EVENT_TYPES = new Set([
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "charge.refunded",
  ]);

  if (PAYMENT_EVENT_TYPES.has(event.type)) {
    // Idempotency: record the event id first. A unique-violation means this
    // event was already processed (Stripe redelivers on timeout) — no-op.
    const { error: dedupeError } = await service
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, type: event.type, payload: JSON.parse(JSON.stringify(event)) });

    if (dedupeError) {
      // A unique violation means Stripe redelivered an event we already
      // handled — acknowledge and stop.
      if (dedupeError.code === "23505") {
        return NextResponse.json({ received: true, deduped: true });
      }

      // Any OTHER insert failure is not a duplicate, it is a failure to record
      // this event at all. Returning 200 here would tell Stripe the event was
      // delivered, so it would never retry — leaving a captured payment with
      // payments.status still 'requires_confirmation' and no reservation,
      // registration or voucher created, permanently and with no log line.
      // 500 makes Stripe redeliver, and the unique index still protects us if
      // the row did land after all.
      console.error(
        `[stripe webhook] PAYMENT_RECONCILIATION_REQUIRED could not record event ` +
          `${event.id} type=${event.type} :: ${dedupeError.message} (code ${dedupeError.code}) ` +
          `— returning 500 so Stripe retries`,
      );
      return NextResponse.json({ error: "Could not record event" }, { status: 500 });
    }

    await handlePaymentEvent(service, event);

    await service
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
  }

  // All other event types: acknowledge and ignore
  return NextResponse.json({ received: true });
}

async function handlePaymentEvent(service: ServiceClient, event: Stripe.Event) {
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!intentId) return;

    const { data: payment } = await service
      .from("payments")
      .select("id, amount_cents")
      .eq("provider_payment_intent_id", intentId)
      .maybeSingle();
    if (!payment) return;

    const refundedAmount = charge.amount_refunded;
    const status = refundedAmount >= payment.amount_cents ? "refunded" : "partially_refunded";
    await service
      .from("payments")
      .update({ refunded_amount_cents: refundedAmount, status })
      .eq("id", payment.id);

    // Settle the refunds row too. Nothing else ever did: cancel-registration
    // leaves it at 'submitted' after the Stripe call returns, and this handler
    // used to update only payments — so every refund the product has ever
    // issued sat at 'submitted' permanently, indistinguishable from one Stripe
    // never acknowledged. The reconciliation queue's `refund_stuck` check reads
    // exactly that, and without this it would report every healthy refund as
    // broken.
    //
    // Scoped to non-terminal rows so a redelivered charge.refunded cannot
    // resurrect a refund someone marked failed or canceled by hand, and keyed
    // on the payment rather than the Stripe refund id because a refund issued
    // from the Stripe dashboard has no row here to match on.
    const { error: settleError } = await service
      .from("refunds")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("payment_id", payment.id)
      .in("status", ["pending", "submitted"]);

    if (settleError) {
      // The money is back — only the audit row is behind. Not worth a 500 and
      // a redelivery, but it must not vanish: the queue will surface the row
      // as refund_stuck until someone closes it.
      console.error(
        `[stripe webhook] could not settle refunds row for payment ${payment.id} :: ${settleError.message}`,
      );
    }
    return;
  }

  const intent = event.data.object as Stripe.PaymentIntent;
  const { data: payment } = await service
    .from("payments")
    .select("id, status")
    .eq("provider_payment_intent_id", intent.id)
    .maybeSingle();

  if (!payment) {
    console.error(`[stripe webhook] No payments row for PaymentIntent ${intent.id}`);
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    await finalizePaymentSucceeded(service, payment.id);
    return;
  }

  if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
    const status = event.type === "payment_intent.canceled" ? "canceled" : "failed";
    await service
      .from("payments")
      .update({
        status,
        failed_at: new Date().toISOString(),
        failure_reason: intent.last_payment_error?.message ?? null,
      })
      .eq("id", payment.id);
  }
}
