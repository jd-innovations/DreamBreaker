import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { finalizePaymentSucceeded } from "@/lib/payments/finalizePayment";

// Development/test-only payment success simulator. Lets Coach Marketplace
// (and any other) downstream state machines be exercised end-to-end without
// Stripe connectivity, WITHOUT duplicating finalization logic — this route
// creates a payments row and hands off to the exact same
// finalizePaymentSucceeded() the real Stripe webhook calls.
//
//   REAL STRIPE EVENT ──┐
//                       ├─▶ finalizePaymentSucceeded()
//   THIS ROUTE ─────────┘
//
// Safety, all defense-in-depth (any one alone would be enough to keep this
// out of production, all three are present on purpose):
//   1. Hard 404 whenever NODE_ENV === "production".
//   2. Requires DEV_TOOLS_SECRET to be set in the environment AND echoed
//      back in an x-dev-tools-secret header — if the env var isn't
//      explicitly configured, this route always 404s. Nothing enables it by
//      accident; it has to be turned on on purpose in a non-prod environment.
//   3. Every payment this route creates is provider: "dev_test" with a
//      provider_payment_intent_id prefixed "dev_test_" — structurally
//      impossible to confuse with a real Stripe "pi_..." id, and trivially
//      filterable out of any financial reporting.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const devSecret = process.env.DEV_TOOLS_SECRET;
  if (!devSecret || request.headers.get("x-dev-tools-secret") !== devSecret) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: {
    purposeType?: unknown;
    purposeId?: unknown;
    payerUserId?: unknown;
    amountCents?: unknown;
    currency?: unknown;
    metadata?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const purposeType = typeof body.purposeType === "string" ? body.purposeType : "";
  const purposeId = typeof body.purposeId === "string" ? body.purposeId : "";
  const payerUserId = typeof body.payerUserId === "string" ? body.payerUserId : "";
  const amountCents = typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : NaN;
  const currency = typeof body.currency === "string" ? body.currency : "usd";
  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, string>)
      : {};

  if (!purposeType || !purposeId || !payerUserId || !Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const service = createServiceClient();
  const devId = randomUUID();

  const { data: payment, error } = await service
    .from("payments")
    .insert({
      purpose_type: purposeType,
      purpose_id: purposeId,
      payer_user_id: payerUserId,
      provider: "dev_test",
      provider_payment_intent_id: `dev_test_${devId}`,
      idempotency_key: `dev_test_${devId}`,
      amount_cents: amountCents,
      currency,
      metadata,
    })
    .select("id")
    .single();

  if (error || !payment) {
    return NextResponse.json({ error: "insert_failed", detail: error?.message }, { status: 500 });
  }

  await finalizePaymentSucceeded(service, payment.id);

  const { data: finalRow } = await service.from("payments").select("id, status").eq("id", payment.id).single();

  return NextResponse.json({ paymentId: payment.id, status: finalRow?.status ?? "unknown", simulated: true });
}
