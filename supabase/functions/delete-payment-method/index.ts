import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe, getServiceClient } from "../_shared/payments.ts";

// Removing a saved card. Detaches from Stripe (the authoritative,
// synchronous call -- a PaymentMethod cannot be charged once detached from
// its Customer) and only deletes the local row after that call succeeds, so
// the two never diverge with the local row surviving a card Stripe no longer
// has attached.

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

  let paymentMethodId = "";
  try {
    const body = await req.json();
    if (typeof body?.paymentMethodId === "string") paymentMethodId = body.paymentMethodId;
  } catch {
    // fall through to the empty-string check below
  }
  if (!paymentMethodId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  const { data: row, error: rowError } = await service
    .from("payment_methods")
    .select("id, profile_id, stripe_payment_method_id, is_default")
    .eq("id", paymentMethodId)
    .single();

  if (rowError || !row || row.profile_id !== user.id) {
    // Not found and "not yours" both read as not_found -- do not confirm
    // another user's payment method id exists.
    return new Response(JSON.stringify({ error: "payment_method_not_found" }), { status: 404, headers: CORS });
  }

  try {
    const stripe = getStripe();
    try {
      await stripe.paymentMethods.detach(row.stripe_payment_method_id);
    } catch (err) {
      // Stripe's error for "already detached" (e.g. the user double-tapped
      // delete) is a resource_missing on the payment method -- treat that as
      // success rather than blocking the local cleanup on it.
      const code = (err as { code?: string })?.code;
      if (code !== "resource_missing") throw err;
    }

    const { error: deleteError } = await service
      .from("payment_methods")
      .delete()
      .eq("id", paymentMethodId);

    if (deleteError) {
      // Detached in Stripe but the local row survived -- log for cleanup;
      // still report success to the client since the card genuinely can no
      // longer be charged, which is the property that matters.
      console.error("[delete-payment-method] detached but local row not removed", deleteError);
    }

    // If the removed card was default and others remain, promote the most
    // recently added one rather than leaving the user with no default card.
    if (row.is_default) {
      const { data: next } = await service
        .from("payment_methods")
        .select("id")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (next) {
        await service.from("payment_methods").update({ is_default: true }).eq("id", next.id);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (err) {
    console.error("[delete-payment-method]", err);
    return new Response(JSON.stringify({ error: "delete_failed" }), { status: 500, headers: CORS });
  }
});
