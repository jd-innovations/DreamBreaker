import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe, getServiceClient } from "../_shared/payments.ts";

// Step 2 of "save a card": the mobile client calls this immediately after
// presentPaymentSheet() (or confirmSetupIntent()) reports success client-side.
//
// Same principle _shared/payments.ts documents for money -- never trust a
// bare client-reported success -- applied to card attachment instead: this
// function re-retrieves the SetupIntent from Stripe by id and only writes a
// local row if Stripe itself confirms status "succeeded" with a payment
// method attached to THIS user's Customer. A client that lied about success,
// or replayed someone else's setupIntentId, gets nothing written.
//
// This app has no mobile-reachable Stripe webhook receiver -- the only
// webhook endpoint is web/src/app/api/stripe/webhooks/route.ts, in a
// different app with its own deploy. Re-verifying synchronously here (rather
// than waiting on that route to learn payment_method.attached) keeps the
// mobile payment-methods feature self-contained, and is safe specifically
// because SetupIntent confirmation -- unlike a PaymentIntent charge -- is a
// synchronous, immediately-authoritative Stripe API call with no further
// async settlement step to race.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
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

  let setupIntentId = "";
  try {
    const body = await req.json();
    if (typeof body?.setupIntentId === "string") setupIntentId = body.setupIntentId;
  } catch {
    // fall through to the empty-string check below
  }
  if (!setupIntentId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: "profile_not_found" }), { status: 404, headers: CORS });
  }

  try {
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });

    if (setupIntent.customer !== profile.stripe_customer_id) {
      // Not this user's setup intent -- same "not found" as a genuinely
      // missing one, not "forbidden": do not confirm someone else's
      // setupIntentId is real.
      return new Response(JSON.stringify({ error: "setup_intent_not_found" }), { status: 404, headers: CORS });
    }

    if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) {
      return new Response(JSON.stringify({ error: "setup_intent_not_succeeded" }), { status: 409, headers: CORS });
    }

    const pm = setupIntent.payment_method;
    const paymentMethod = typeof pm === "string" ? await stripe.paymentMethods.retrieve(pm) : pm;
    const card = paymentMethod.card;
    if (!card) {
      // payment_method_types is locked to ["card"] on creation (see
      // create-setup-intent), so this should be unreachable -- guarded
      // anyway rather than writing a row with null card fields.
      return new Response(JSON.stringify({ error: "not_a_card" }), { status: 422, headers: CORS });
    }

    const { count: existingCount } = await service
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id);

    const { data: row, error: upsertError } = await service
      .from("payment_methods")
      .upsert(
        {
          profile_id: user.id,
          stripe_payment_method_id: paymentMethod.id,
          brand: card.brand,
          last4: card.last4,
          exp_month: card.exp_month,
          exp_year: card.exp_year,
          // Only ever set true here on the very first card. A later card
          // becoming default is a separate, explicit set_default_payment_method
          // call -- attaching a second card should never silently demote the
          // first without the user asking for that.
          is_default: (existingCount ?? 0) === 0,
        },
        { onConflict: "stripe_payment_method_id" },
      )
      .select()
      .single();

    if (upsertError || !row) {
      console.error("[confirm-payment-method] attached in Stripe but not saved", upsertError);
      return new Response(JSON.stringify({ error: "payment_method_save_failed" }), { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({ paymentMethod: row }), { headers: CORS });
  } catch (err) {
    console.error("[confirm-payment-method]", err);
    return new Response(JSON.stringify({ error: "confirm_failed" }), { status: 500, headers: CORS });
  }
});
