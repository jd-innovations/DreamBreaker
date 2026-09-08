import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe, getServiceClient } from "../_shared/payments.ts";

// Step 1 of "save a card" (apps/mobile payments-settings.tsx's real
// implementation of the placeholder that file's own TODO comment describes).
// Mirrors create-connect-onboarding-link's lazy-create-and-persist pattern
// for profiles.stripe_connect_account_id: a Stripe Customer is created once
// per profile and reused forever after, never re-created.
//
// Returns everything PaymentSheet's customer flow needs in one round trip
// (setup intent + ephemeral key + customer id) so the mobile hook only makes
// one network call before presenting the sheet.
//
// apiVersion is pinned to the same version as every other Stripe call in this
// codebase (_shared/payments.ts) -- ephemeral keys are the one Stripe API
// that is versioned by an explicit request option rather than the client's
// default, and it must stay in lockstep with that pin for the same reason
// _shared/payments.ts documents (SDK typings vs. what Stripe actually answers
// with diverging silently otherwise).
const STRIPE_API_VERSION = "2026-05-27.dahlia";

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

  // Service client: stripe_customer_id is not client-writable, same reasoning
  // as stripe_connect_account_id in create-connect-onboarding-link.
  const service = getServiceClient();

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: "profile_not_found" }), { status: 404, headers: CORS });
  }

  try {
    const stripe = getStripe();

    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? user.email,
        name: profile.full_name ?? undefined,
        metadata: { profile_id: user.id },
      });
      customerId = customer.id;

      const { error: updateError } = await service
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);

      if (updateError) {
        // Same reasoning as create-connect-onboarding-link: the Customer
        // exists in Stripe but isn't recorded. Fail loudly rather than
        // proceed -- a retry would mint a SECOND customer, invisible from
        // the app, and this profile's future purchases would attach to
        // whichever one happened to win a race.
        console.error("[create-setup-intent] customer created but not saved", updateError);
        return new Response(JSON.stringify({ error: "customer_save_failed" }), { status: 500, headers: CORS });
      }
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION },
    );

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      // card-only: this flow is specifically "save a card for later", not a
      // general payment method picker.
      payment_method_types: ["card"],
    });

    return new Response(
      JSON.stringify({
        setupIntentClientSecret: setupIntent.client_secret,
        customerId,
        ephemeralKeySecret: ephemeralKey.secret,
      }),
      { headers: CORS },
    );
  } catch (err) {
    console.error("[create-setup-intent]", err);
    return new Response(JSON.stringify({ error: "setup_intent_failed" }), { status: 500, headers: CORS });
  }
});
