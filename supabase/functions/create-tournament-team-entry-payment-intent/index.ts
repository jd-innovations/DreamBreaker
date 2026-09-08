import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPayment, getServiceClient } from "../_shared/payments.ts";

// Doubles/mixed registration where each player owes their OWN entry fee.
//
// The caller here is the INITIATING player. This function creates (or reuses)
// the registration_groups team plus one registration_group_members obligation
// per player, then creates a PaymentIntent for the caller's own obligation
// ONLY. The partner is left in 'invited' and pays through
// create-tournament-team-member-payment-intent with their own PaymentIntent.
// One payment never settles two players.
//
// As with every other payment entry point: the amount is resolved from
// server-side data, no registrations row is created here, and nothing marks
// anyone paid — that happens only in finalizePayment.ts, from a verified
// Stripe webhook.

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
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : "default";

  if (!tournamentId || !divisionId || !partnerId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }
  if (partnerId === user.id) {
    return new Response(JSON.stringify({ error: "invalid_partner" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  const { data: division, error: divisionError } = await service
    .from("divisions")
    .select("id, tournament_id, name, entry_fee_cents")
    .eq("id", divisionId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (divisionError || !division) {
    return new Response(JSON.stringify({ error: "division_not_found" }), { status: 404, headers: CORS });
  }

  const { data: tournament, error: tournamentError } = await service
    .from("tournaments")
    .select("id, entry_fee_cents, status, registration_closes_at")
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

  // A team obligation only exists for a division that actually needs a
  // partner — singles must keep using the plain entry endpoint.
  if (!/doubles|mixed/i.test(String(division.name ?? ""))) {
    return new Response(JSON.stringify({ error: "not_a_team_division" }), { status: 400, headers: CORS });
  }

  // Per-player amount, resolved server-side. Never read from the request body.
  const amountCents = division.entry_fee_cents ?? tournament.entry_fee_cents ?? 0;
  if (amountCents <= 0) {
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

  const { count: partnerRegistered } = await service
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("player_id", partnerId)
    .in("status", ["registered", "checked_in", "waitlisted", "waitlist_offered"]);

  if ((partnerRegistered ?? 0) > 0) {
    return new Response(JSON.stringify({ error: "partner_already_registered" }), { status: 409, headers: CORS });
  }

  // The obligation can never outlive the ability to register at all.
  const expiresAt = tournament.registration_closes_at ?? null;

  const { data: groupRows, error: groupError } = await service.rpc("ensure_registration_group", {
    p_tournament_id: tournamentId,
    p_division_id: divisionId,
    p_initiator_id: user.id,
    p_partner_id: partnerId,
    p_amount_due_cents: amountCents,
    p_expires_at: expiresAt,
  });

  const group = Array.isArray(groupRows) ? groupRows[0] : groupRows;
  if (groupError || !group?.group_id || !group?.initiator_member_id) {
    console.error("[create-tournament-team-entry-payment-intent] ensure_registration_group failed", groupError);
    return new Response(JSON.stringify({ error: "group_create_failed" }), { status: 500, headers: CORS });
  }

  try {
    const { clientSecret } = await createPayment({
      purposeType: "tournament_team_entry",
      purposeId: group.group_id,
      payerUserId: user.id,
      amountCents,
      idempotencyKey: `team_entry:${group.initiator_member_id}:${attemptId}`,
      metadata: {
        groupId: group.group_id,
        memberId: group.initiator_member_id,
        tournamentId,
        divisionId,
        playerId: user.id,
        partnerId,
      },
    });

    return new Response(
      JSON.stringify({
        clientSecret,
        amountCents,
        groupId: group.group_id,
        memberId: group.initiator_member_id,
        partnerMemberId: group.partner_member_id ?? null,
      }),
      { headers: CORS },
    );
  } catch (err) {
    console.error("[create-tournament-team-entry-payment-intent]", err);
    return new Response(JSON.stringify({ error: "payment_intent_failed" }), { status: 500, headers: CORS });
  }
});
