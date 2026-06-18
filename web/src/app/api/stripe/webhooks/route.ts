import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
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

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const service = createServiceClient();

    if (account.charges_enabled) {
      // Onboarding complete — set timestamp if not already set
      await service
        .from("profiles")
        .update({ stripe_connect_onboarded_at: new Date().toISOString() })
        .eq("stripe_connect_account_id", account.id)
        .is("stripe_connect_onboarded_at", null);
    } else {
      // Account disabled (e.g. Stripe suspended it) — clear the timestamp
      await service
        .from("profiles")
        .update({ stripe_connect_onboarded_at: null })
        .eq("stripe_connect_account_id", account.id);
    }
  }

  // All other event types: acknowledge and ignore
  return NextResponse.json({ received: true });
}
