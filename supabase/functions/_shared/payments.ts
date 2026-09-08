// Domain-neutral payment-intent creation primitive (TODO1.1.md Task C7 /
// shared payment foundation). ANY current or future paid feature — tournament
// entry fees, Coach Marketplace purchases, whatever comes next — creates its
// PaymentIntent by calling createPayment() from its own thin, trusted edge
// function that has already computed `amountCents` from server-side data.
//
// This module intentionally knows nothing about tournaments, coaches, or any
// other domain. It only knows: who is paying, how much, in what currency,
// and what free-text "purpose" the payment is for. Do not add
// domain-specific fields or branching here — that belongs in the caller.
//
// The actual money-is-real confirmation happens later, out of band, when
// Stripe calls the webhook — this function only ever creates a payment in
// 'requires_confirmation' status. Nothing here marks a payment "succeeded".

// Pinned to the same exact SDK version the web app resolves (web/package.json
// "stripe": "^22.2.1"), and to that SDK's OWN native API version below. Those
// two must move together: this was on stripe@18, whose native version is
// 2025-08-27.basil, while pinning a dahlia apiVersion -- so Stripe was
// answering in dahlia shapes while the SDK's typings described basil, and
// `deno check` failed on every function that imports this file.
//
// Exact rather than a range: this is money code deployed independently of the
// web app, and "whatever npm resolved at deploy time" is not a property you
// want a payment client to have.
import Stripe from "npm:stripe@22.2.1";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // Must equal the pinned SDK's own Stripe.ApiVersion. Setting a version the
  // SDK does not know does not "upgrade" anything -- Stripe honours the header
  // and answers in that version, while the client types keep describing the
  // old one, which is divergence with no signal.
  _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  return _stripe;
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export type CreatePaymentInput = {
  purposeType: string;
  purposeId: string;
  payerUserId: string;
  /** Authoritative amount, computed server-side by the caller — never trust a client-supplied amount here. */
  amountCents: number;
  currency?: string;
  /** Caller-chosen, stable per attempt — lets a retried client call reuse the same PaymentIntent. */
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type CreatePaymentResult = {
  paymentId: string;
  clientSecret: string;
};

/**
 * Creates (or, for a repeated idempotencyKey, returns the existing)
 * PaymentIntent + payments row. Never sets status to 'succeeded' — that only
 * ever happens from a verified Stripe webhook event.
 */
export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  const supabase = getServiceClient();

  const { data: existing } = await supabase
    .from("payments")
    .select("id, provider_payment_intent_id, status")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  const stripe = getStripe();

  if (existing) {
    const intent = await stripe.paymentIntents.retrieve(existing.provider_payment_intent_id as string);
    return { paymentId: existing.id as string, clientSecret: intent.client_secret! };
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency ?? "usd",
      metadata: { purpose_type: input.purposeType, purpose_id: input.purposeId, ...input.metadata },
    },
    { idempotencyKey: input.idempotencyKey },
  );

  const { data: row, error } = await supabase
    .from("payments")
    .insert({
      purpose_type: input.purposeType,
      purpose_id: input.purposeId,
      payer_user_id: input.payerUserId,
      provider_payment_intent_id: intent.id,
      amount_cents: input.amountCents,
      currency: input.currency ?? "usd",
      idempotency_key: input.idempotencyKey,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error || !row) {
    // We created a PaymentIntent but failed to record it — cancel it so it
    // doesn't sit as an orphaned charge target.
    await stripe.paymentIntents.cancel(intent.id).catch(() => {});
    throw new Error(`Failed to record payment: ${error?.message ?? "unknown error"}`);
  }

  return { paymentId: row.id as string, clientSecret: intent.client_secret! };
}
