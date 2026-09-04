import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPayment } from "../_shared/payments.ts";

// Coach Marketplace V1 Phase 3. Mirrors create-tournament-entry-payment-intent's
// structure exactly: this function's only job is to hand off to the shared
// payment primitive once an authoritative purchase has been established —
// it must never compute or trust a client-supplied price/commission itself.
//
// Unlike the tournament function, ALL price/commission/fee resolution and
// inventory/limit enforcement lives in the create_coach_offer_purchase()
// Postgres RPC (SECURITY DEFINER), not here — that RPC is also exactly what
// the dev-testing path calls directly via SQL, so there is exactly one
// implementation of "what a coach offer purchase costs," reachable both
// from this real-money path and from internal testing.
//
// REQUIRES STRIPE: createPayment() below calls the real Stripe API and will
// throw if STRIPE_SECRET_KEY is not configured. This function is written
// and deployed, but — per explicit project direction — has NOT been
// exercised end-to-end, the same deferred-validation status as
// create-tournament-entry-payment-intent. Phase 3 dev/testing bypasses this
// function entirely: call create_coach_offer_purchase() directly, then
// POST /api/dev/simulate-payment with purposeType="coach_offer_purchase".

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type RequestBody = {
  offerId?: unknown;
  participantQuantity?: unknown;
  /** Client-generated id distinguishing one checkout attempt from another (for idempotency-key retry dedup). Not trusted for anything else. */
  attemptId?: unknown;
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

  const offerId = typeof body.offerId === "string" ? body.offerId : "";
  const participantQuantity = typeof body.participantQuantity === "number" ? Math.trunc(body.participantQuantity) : 1;
  const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : "default";

  if (!offerId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  // Authoritative purchase creation — validates offer/coach state, resolves
  // price/commission/fee, enforces inventory + purchase limits, all
  // server-side inside the RPC. Runs under the caller's own JWT (RLS-safe;
  // auth.uid() inside the function resolves to this user).
  const { data: purchase, error: rpcError } = await userClient
    .rpc("create_coach_offer_purchase", { p_offer_id: offerId, p_participant_quantity: participantQuantity })
    .single();

  if (rpcError || !purchase) {
    const message = rpcError?.message ?? "purchase_failed";
    const status = message.includes("not_authenticated") ? 401 : 400;
    return new Response(JSON.stringify({ error: message }), { status, headers: CORS });
  }

  const purchaseRow = purchase as { id: string; buyer_total_charged_cents: number };

  try {
    const { clientSecret } = await createPayment({
      purposeType: "coach_offer_purchase",
      purposeId: purchaseRow.id,
      payerUserId: user.id,
      amountCents: purchaseRow.buyer_total_charged_cents,
      idempotencyKey: `coach_offer_purchase:${purchaseRow.id}:${attemptId}`,
      metadata: { offerId, purchaseId: purchaseRow.id },
    });

    return new Response(
      JSON.stringify({ clientSecret, purchaseId: purchaseRow.id, amountCents: purchaseRow.buyer_total_charged_cents }),
      { headers: CORS },
    );
  } catch (err) {
    console.error("[create-coach-offer-purchase-payment-intent]", err);
    return new Response(JSON.stringify({ error: "payment_intent_failed" }), { status: 500, headers: CORS });
  }
});
