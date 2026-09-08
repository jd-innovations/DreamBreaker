import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPayment, getServiceClient } from "../_shared/payments.ts";

// The invited partner paying THEIR OWN share of a doubles/mixed team created
// by create-tournament-team-entry-payment-intent.
//
// The amount comes from the obligation row that was snapshotted when the
// invite was issued (registration_group_members.amount_due_cents), not from
// the request and not from a re-read of the current division fee — what the
// player was told they owe is what they pay.
//
// Nothing here registers anyone or marks anyone paid; that happens only in
// finalizePayment.ts, from a verified Stripe webhook.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type RequestBody = {
  groupId?: unknown;
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

  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : "default";

  if (!groupId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  // Scoped to the caller's own obligation — a member id from the request is
  // never trusted, only (group, auth user).
  const { data: member, error: memberError } = await service
    .from("registration_group_members")
    .select("id, group_id, user_id, payment_state, amount_due_cents, expires_at")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return new Response(JSON.stringify({ error: "invite_not_found" }), { status: 404, headers: CORS });
  }
  if (member.payment_state === "paid") {
    return new Response(JSON.stringify({ error: "already_paid" }), { status: 409, headers: CORS });
  }
  if (member.payment_state === "declined" || member.payment_state === "expired") {
    return new Response(JSON.stringify({ error: "invite_not_active" }), { status: 409, headers: CORS });
  }
  if (member.expires_at && Date.now() > new Date(member.expires_at).getTime()) {
    return new Response(JSON.stringify({ error: "invite_expired" }), { status: 409, headers: CORS });
  }

  const { data: group, error: groupError } = await service
    .from("registration_groups")
    .select("id, tournament_id, division_id, status, tournaments(id, status, registration_closes_at)")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) {
    return new Response(JSON.stringify({ error: "invite_not_found" }), { status: 404, headers: CORS });
  }
  if (group.status === "cancelled") {
    return new Response(JSON.stringify({ error: "invite_not_active" }), { status: 409, headers: CORS });
  }

  const tournament = Array.isArray(group.tournaments) ? group.tournaments[0] : group.tournaments;
  if (tournament?.status === "cancelled" || tournament?.status === "completed") {
    return new Response(JSON.stringify({ error: "registration_unavailable" }), { status: 409, headers: CORS });
  }
  if (tournament?.registration_closes_at && Date.now() > new Date(tournament.registration_closes_at).getTime()) {
    return new Response(JSON.stringify({ error: "registration_closed" }), { status: 409, headers: CORS });
  }

  const { count: alreadyRegistered } = await service
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", group.tournament_id)
    .eq("player_id", user.id)
    .in("status", ["registered", "checked_in", "waitlisted", "waitlist_offered"]);

  if ((alreadyRegistered ?? 0) > 0) {
    return new Response(JSON.stringify({ error: "already_registered" }), { status: 409, headers: CORS });
  }

  const amountCents = member.amount_due_cents ?? 0;
  if (amountCents <= 0) {
    return new Response(JSON.stringify({ error: "no_payment_required" }), { status: 400, headers: CORS });
  }

  try {
    const { clientSecret } = await createPayment({
      purposeType: "tournament_team_entry",
      purposeId: groupId,
      payerUserId: user.id,
      amountCents,
      idempotencyKey: `team_entry:${member.id}:${attemptId}`,
      metadata: {
        groupId,
        memberId: member.id,
        tournamentId: group.tournament_id,
        divisionId: group.division_id,
        playerId: user.id,
      },
    });

    return new Response(JSON.stringify({ clientSecret, amountCents, groupId, memberId: member.id }), { headers: CORS });
  } catch (err) {
    console.error("[create-tournament-team-member-payment-intent]", err);
    return new Response(JSON.stringify({ error: "payment_intent_failed" }), { status: 500, headers: CORS });
  }
});
