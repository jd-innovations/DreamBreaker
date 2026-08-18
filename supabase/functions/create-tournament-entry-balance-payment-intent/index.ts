import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPayment, getServiceClient } from "../_shared/payments.ts";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type RequestBody = {
  registrationId?: unknown;
  partnerId?: unknown;
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

  const registrationId = typeof body.registrationId === "string" ? body.registrationId : "";
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : null;
  const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : "default";

  if (!registrationId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();
  const { data: registration, error: registrationError } = await service
    .from("registrations")
    .select(`
      id, tournament_id, division_id, player_id, partner_id, status, hold_fee_paid_cents, needs_partner,
      tournaments(id, entry_fee_cents, status, registration_closes_at),
      divisions(id, entry_fee_cents)
    `)
    .eq("id", registrationId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (registrationError || !registration) {
    return new Response(JSON.stringify({ error: "hold_not_found" }), { status: 404, headers: CORS });
  }
  if (registration.status !== "held") {
    return new Response(JSON.stringify({ error: "hold_not_active" }), { status: 409, headers: CORS });
  }

  const tournament = Array.isArray(registration.tournaments) ? registration.tournaments[0] : registration.tournaments;
  const division = Array.isArray(registration.divisions) ? registration.divisions[0] : registration.divisions;
  if (!tournament || !division) {
    return new Response(JSON.stringify({ error: "registration_incomplete" }), { status: 409, headers: CORS });
  }

  if (tournament.status === "cancelled" || tournament.status === "completed") {
    return new Response(JSON.stringify({ error: "registration_unavailable" }), { status: 409, headers: CORS });
  }
  if (tournament.registration_closes_at && Date.now() > new Date(tournament.registration_closes_at).getTime()) {
    return new Response(JSON.stringify({ error: "registration_closed" }), { status: 409, headers: CORS });
  }

  const entryCents = division.entry_fee_cents ?? tournament.entry_fee_cents ?? 0;
  const amountCents = Math.max(0, entryCents - (registration.hold_fee_paid_cents ?? 0));
  if (amountCents <= 0) {
    return new Response(JSON.stringify({ error: "no_payment_required" }), { status: 400, headers: CORS });
  }

  try {
    const { clientSecret } = await createPayment({
      purposeType: "tournament_registration_balance",
      purposeId: registration.tournament_id,
      payerUserId: user.id,
      amountCents,
      idempotencyKey: `balance:${registrationId}:${user.id}:${attemptId}`,
      metadata: {
        registrationId,
        tournamentId: registration.tournament_id,
        divisionId: registration.division_id ?? "",
        playerId: user.id,
        partnerId: partnerId ?? registration.partner_id ?? "",
        needsPartner: String(registration.needs_partner),
        entryFeeCents: String(entryCents),
      },
    });

    return new Response(JSON.stringify({ clientSecret, amountCents }), { headers: CORS });
  } catch (err) {
    console.error("[create-tournament-entry-balance-payment-intent]", err);
    return new Response(JSON.stringify({ error: "payment_intent_failed" }), { status: 500, headers: CORS });
  }
});
