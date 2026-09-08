import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPayment, getServiceClient } from "../_shared/payments.ts";

// Domain-specific entry point validating the FIRST real consumer of the
// shared payment foundation (supabase/functions/_shared/payments.ts):
// tournament entry-fee payment, replacing the direct client write to
// registrations.entry_fee_paid_cents that TODO1.1.md flags as Task C7.
//
// This function's only job is to establish the AUTHORITATIVE amount from
// server-side data before handing off to the generic primitive — it must
// never trust an amount from the client. The actual registrations row is
// created later, by the webhook handler, once Stripe confirms payment (see
// web/src/app/api/stripe/webhooks/route.ts). No registration exists yet at
// the time this function runs.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type RequestBody = {
  tournamentId?: unknown;
  divisionId?: unknown;
  partnerId?: unknown;
  needsPartner?: unknown;
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

  const tournamentId = typeof body.tournamentId === "string" ? body.tournamentId : "";
  const divisionId = typeof body.divisionId === "string" ? body.divisionId : "";
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : null;
  const needsPartner = body.needsPartner === true;
  const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : "default";

  if (!tournamentId || !divisionId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  // Authoritative fee lookup — division override falls back to the
  // tournament's base entry fee. Never read this from the request body.
  const { data: division, error: divisionError } = await service
    .from("divisions")
    .select("id, tournament_id, entry_fee_cents")
    .eq("id", divisionId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (divisionError || !division) {
    return new Response(JSON.stringify({ error: "division_not_found" }), { status: 404, headers: CORS });
  }

  const { data: tournament, error: tournamentError } = await service
    .from("tournaments")
    .select("id, entry_fee_cents")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) {
    return new Response(JSON.stringify({ error: "tournament_not_found" }), { status: 404, headers: CORS });
  }

  const amountCents = division.entry_fee_cents ?? tournament.entry_fee_cents ?? 0;

  if (amountCents <= 0) {
    // Free entry — nothing to pay. The caller should be using the existing
    // direct-registration path (createRegistration with entryFeePaidCents=0),
    // not this endpoint.
    return new Response(JSON.stringify({ error: "no_payment_required" }), { status: 400, headers: CORS });
  }

  const { count: alreadyRegistered } = await service
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("player_id", user.id)
    .in("status", ["registered", "checked_in", "waitlisted", "waitlist_offered"]);

  if ((alreadyRegistered ?? 0) > 0) {
    return new Response(JSON.stringify({ error: "already_registered" }), { status: 409, headers: CORS });
  }

  try {
    const { clientSecret } = await createPayment({
      purposeType: "tournament_registration_entry",
      purposeId: tournamentId,
      payerUserId: user.id,
      amountCents,
      idempotencyKey: `entry:${tournamentId}:${divisionId}:${user.id}:${attemptId}`,
      metadata: {
        tournamentId,
        divisionId,
        playerId: user.id,
        partnerId: partnerId ?? "",
        needsPartner: String(needsPartner),
      },
    });

    return new Response(JSON.stringify({ clientSecret, amountCents }), { headers: CORS });
  } catch (err) {
    console.error("[create-tournament-entry-payment-intent]", err);
    return new Response(JSON.stringify({ error: "payment_intent_failed" }), { status: 500, headers: CORS });
  }
});
