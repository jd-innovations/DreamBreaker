import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe, getServiceClient } from "../_shared/payments.ts";

// Coach Marketplace Phase 7 — refunding a purchase.
//
// Admin-authorised only, and always with a reason. Spec §27: an unused
// purchase is non-refundable by default, so every refund is an exception
// someone decided to make and must be attributable.
//
// Same ordering discipline as the payout runner:
//
//   1. claim_coach_refund()  — records the intent, in the database, and takes
//                              the unique index that stops a second refund
//   2. stripe.refunds.create() + optional transfer reversal
//   3. settle_coach_refund() — marks the purchase refunded, revokes unredeemed
//                              entitlements, writes the ledger events
//
// Claiming first means a crash between 1 and 2 leaves a pending refund to
// investigate rather than money returned with no record of why.
//
// The authorization check lives in claim_coach_refund (is_admin()), not here —
// the database refuses a non-admin regardless of what any client sends.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type Claimed = {
  refund_id: string;
  amount_cents: number;
  payment_intent_id: string;
  already_paid_out: boolean;
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

  let purchaseId = "";
  let reason = "";
  try {
    const body = await req.json();
    purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    reason = typeof body.reason === "string" ? body.reason : "";
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  if (!purchaseId || !reason.trim()) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  // Claimed under the CALLER's JWT so is_admin() sees the real actor and the
  // refund is attributed to them. Everything after runs as service_role.
  const { data: claimedRaw, error: claimError } = await userClient
    .rpc("claim_coach_refund", { p_purchase_id: purchaseId, p_reason: reason });

  if (claimError) {
    const msg = claimError.message ?? "claim_failed";
    const status = msg.includes("admin_only") ? 403 : 400;
    return new Response(JSON.stringify({ error: msg }), { status, headers: CORS });
  }

  const claimed = (Array.isArray(claimedRaw) ? claimedRaw[0] : claimedRaw) as Claimed | undefined;
  if (!claimed?.refund_id) {
    return new Response(JSON.stringify({ error: "claim_failed" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();
  const stripe = getStripe();

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: claimed.payment_intent_id,
        metadata: { refund_id: claimed.refund_id, purchase_id: purchaseId },
      },
      // The refund row's id: a retry returns Stripe's original refund rather
      // than issuing a second one.
      { idempotencyKey: `coach_refund:${claimed.refund_id}` },
    );

    // Clawback. Only attempted when the coach was actually paid — reversing a
    // transfer that never happened is not a no-op, it is an error.
    let reversedCents = 0;
    let shortfallCents = 0;

    if (claimed.already_paid_out) {
      const { data: items } = await service
        .from("coach_payout_items")
        .select("amount_cents, batch_id, coach_payout_batches!inner(stripe_transfer_id, status)")
        .eq("purchase_id", purchaseId);

      for (const it of items ?? []) {
        const batch = (it as unknown as { coach_payout_batches: { stripe_transfer_id: string | null; status: string } })
          .coach_payout_batches;
        if (batch?.status !== "paid" || !batch.stripe_transfer_id) continue;

        try {
          const rev = await stripe.transfers.createReversal(
            batch.stripe_transfer_id,
            { amount: it.amount_cents, metadata: { refund_id: claimed.refund_id } },
            { idempotencyKey: `coach_payout_reversal:${claimed.refund_id}:${batch.stripe_transfer_id}` },
          );
          reversedCents += rev.amount;
        } catch (revErr) {
          // A coach who has already paid the money out of their connected
          // account cannot have it reversed. Recorded as a shortfall rather
          // than swallowed: money owed that nobody can see is money written
          // off by accident.
          console.error("[refund-coach-purchase] reversal failed", batch.stripe_transfer_id, revErr);
          shortfallCents += it.amount_cents;
        }
      }
    }

    await service.rpc("settle_coach_refund", {
      p_refund_id: claimed.refund_id,
      p_stripe_refund_id: refund.id,
      p_reversed_cents: reversedCents,
      p_shortfall_cents: shortfallCents,
    });

    return new Response(JSON.stringify({
      ok: true,
      refundId: claimed.refund_id,
      stripeRefundId: refund.id,
      amountCents: claimed.amount_cents,
      payoutReversedCents: reversedCents,
      clawbackShortfallCents: shortfallCents,
    }), { headers: CORS });
  } catch (err) {
    const reasonText = err instanceof Error ? err.message : String(err);
    console.error("[refund-coach-purchase]", reasonText);
    await service.rpc("settle_coach_refund", {
      p_refund_id: claimed.refund_id,
      p_stripe_refund_id: null,
      p_reversed_cents: 0,
      p_shortfall_cents: 0,
      p_failure: reasonText.slice(0, 400),
    });
    return new Response(JSON.stringify({ error: "refund_failed", detail: reasonText.slice(0, 200) }), {
      status: 500, headers: CORS,
    });
  }
});
