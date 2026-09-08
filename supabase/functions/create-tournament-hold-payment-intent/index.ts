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
  tournamentId?: unknown;
  divisionId?: unknown;
  needsPartner?: unknown;
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
  const needsPartner = body.needsPartner === true;
  const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : "default";

  if (!tournamentId || !divisionId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  const { data: division, error: divisionError } = await service
    .from("divisions")
    .select("id, tournament_id")
    .eq("id", divisionId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (divisionError || !division) {
    return new Response(JSON.stringify({ error: "division_not_found" }), { status: 404, headers: CORS });
  }

  const { data: tournament, error: tournamentError } = await service
    .from("tournaments")
    .select("id, hold_fee_cents, status, registration_closes_at")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) {
    return new Response(JSON.stringify({ error: "tournament_not_found" }), { status: 404, headers: CORS });
  }

  if (tournament.status === "cancelled" || tournament.status === "completed") {
    return new Response(JSON.stringify({ error: "registration_unavailable" }), { status: 409, headers: CORS });
  }
  if (tournament.registration_closes_at && Date.now() > new Date(tournament.registration_closes_at).getTime()) {
    return new Response(JSON.stringify({ error: "registration_closed" }), { status: 409, headers: CORS });
  }

  const amountCents = tournament.hold_fee_cents ?? 0;
  if (amountCents <= 0) {
    return new Response(JSON.stringify({ error: "no_payment_required" }), { status: 400, headers: CORS });
  }

  const { count: activeRegistration } = await service
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("player_id", user.id)
    .in("status", ["held", "registered", "checked_in", "waitlisted", "waitlist_offered"]);

  if ((activeRegistration ?? 0) > 0) {
    return new Response(JSON.stringify({ error: "already_registered" }), { status: 409, headers: CORS });
  }

  try {
    const { clientSecret } = await createPayment({
      purposeType: "tournament_registration_hold",
      purposeId: tournamentId,
      payerUserId: user.id,
      amountCents,
      idempotencyKey: `hold:${tournamentId}:${divisionId}:${user.id}:${attemptId}`,
      metadata: {
        tournamentId,
        divisionId,
        playerId: user.id,
        needsPartner: String(needsPartner),
      },
    });

    return new Response(JSON.stringify({ clientSecret, amountCents }), { headers: CORS });
  } catch (err) {
    console.error("[create-tournament-hold-payment-intent]", err);
    return new Response(JSON.stringify({ error: "payment_intent_failed" }), { status: 500, headers: CORS });
  }
});
