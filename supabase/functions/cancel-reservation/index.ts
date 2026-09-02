// Cancels a booking, or releases one player's slots, and issues whatever the
// facility's cancellation policy owes. Facility Marketplace Phase 8, reworked
// for per-slot pricing.
//
// Under per-slot pricing a booking has as many payments as it has payers, so
// there are two shapes:
//
//   organizer cancels -> the reservation is cancelled and EVERY paid player is
//                        refunded their own share
//   a joiner leaves   -> only their slots are released and only they are
//                        refunded; the booking carries on
//
// Ordering per player is the same discipline as before, and is the whole
// design:
//
//   1. authorise      -- who may cancel this
//   2. record intent  -- refunds row written BEFORE Stripe is called
//   3. cancel/release -- reservation or seat
//   4. ask Stripe     -- refunds.create, idempotent per refund row
//   5. settle         -- refunds row + payments.refunded_amount_cents
//
// The refund row is written first so a crash between "we decided you are owed
// money" and "Stripe has it" leaves evidence instead of silence. The amount is
// never taken from the request: compute_player_refund derives it from what that
// person actually paid, and returns the court share only — the convenience fee
// is kept.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient, getStripe } from "../_shared/payments.ts";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type Computed = {
  refundable: boolean;
  refundable_cents: number;
  payment_id: string | null;
  window_hours: number;
  hours_until_slot: number;
  reason: string | null;
};

type PerPlayerResult = { profileId: string; refundedCents: number; pending: boolean; reason: string | null };

/** Records intent, calls Stripe, settles. Returns what happened to this player. */
async function refundPlayer(
  // deno-lint-ignore no-explicit-any
  service: any,
  reservationId: string,
  profileId: string,
  requestedBy: string,
): Promise<PerPlayerResult> {
  const { data: raw } = await service.rpc("compute_player_refund", {
    p_reservation_id: reservationId,
    p_profile_id: profileId,
  });
  const computed = (Array.isArray(raw) ? raw[0] : raw) as Computed | undefined;

  if (!computed?.refundable || !computed.payment_id || computed.refundable_cents <= 0) {
    return { profileId, refundedCents: 0, pending: false, reason: computed?.reason ?? "not_refundable" };
  }

  const { data: refundRow, error: insertError } = await service
    .from("refunds")
    .insert({
      payment_id: computed.payment_id,
      amount_cents: computed.refundable_cents,
      kind: "policy",
      reason: `Booking cancelled ${Math.floor(computed.hours_until_slot)}h before start; facility window is ${computed.window_hours}h. Convenience fee retained.`,
      requested_by: requestedBy,
      status: "pending",
      provider: "stripe",
      policy_snapshot: {
        window_hours: computed.window_hours,
        hours_until_slot: computed.hours_until_slot,
        reservation_id: reservationId,
        profile_id: profileId,
        court_share_only: true,
      },
    })
    .select("id")
    .single();

  if (insertError || !refundRow) {
    return { profileId, refundedCents: 0, pending: true, reason: "refund_record_failed" };
  }

  try {
    const { data: payment } = await service
      .from("payments")
      .select("provider_payment_intent_id, refunded_amount_cents")
      .eq("id", computed.payment_id)
      .single();

    if (!payment?.provider_payment_intent_id) {
      await service.from("refunds")
        .update({ status: "failed", failure_reason: "payment has no provider intent id" })
        .eq("id", refundRow.id);
      return { profileId, refundedCents: 0, pending: true, reason: "no_payment_intent" };
    }

    await service.from("refunds").update({ status: "submitted" }).eq("id", refundRow.id);

    const refund = await getStripe().refunds.create(
      {
        payment_intent: payment.provider_payment_intent_id,
        amount: computed.refundable_cents,
        metadata: { refund_id: refundRow.id, reservation_id: reservationId, profile_id: profileId },
      },
      // The refund row id: a retry returns Stripe's original refund rather than
      // issuing a second one.
      { idempotencyKey: `reservation_refund:${refundRow.id}` },
    );

    await service.from("refunds")
      .update({ status: "succeeded", provider_refund_id: refund.id, completed_at: new Date().toISOString() })
      .eq("id", refundRow.id);

    await service.from("payments")
      .update({
        refunded_amount_cents: (payment.refunded_amount_cents ?? 0) + computed.refundable_cents,
        status: "refunded",
      })
      .eq("id", computed.payment_id);

    return { profileId, refundedCents: computed.refundable_cents, pending: false, reason: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cancel-reservation] refund failed", profileId, detail);
    // The cancellation stands and the row records what is owed. A failed refund
    // is retryable from the refunds table; it is not lost.
    await service.from("refunds")
      .update({ status: "failed", failure_reason: detail.slice(0, 400) })
      .eq("id", refundRow.id);
    return { profileId, refundedCents: 0, pending: true, reason: "stripe_failed" };
  }
}

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

  let reservationId = "";
  try {
    const body = await req.json();
    reservationId = typeof body.reservationId === "string" ? body.reservationId : "";
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }
  if (!reservationId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  const { data: reservation } = await service
    .from("reservations")
    .select("id, organizer_id, status")
    .eq("id", reservationId)
    .maybeSingle();

  if (!reservation) {
    return new Response(JSON.stringify({ error: "reservation_not_found" }), { status: 404, headers: CORS });
  }

  const isOrganizer = reservation.organizer_id === user.id;

  // ── A joiner giving up their slots ──────────────────────────────────────
  if (!isOrganizer) {
    const { data: seat } = await service
      .from("reservation_players")
      .select("profile_id")
      .eq("reservation_id", reservationId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!seat) {
      return new Response(JSON.stringify({ error: "not_a_player" }), { status: 403, headers: CORS });
    }

    const result = await refundPlayer(service, reservationId, user.id, user.id);

    // Released after the refund is recorded: deleting first would lose the
    // court share the refund is calculated from.
    await service.rpc("release_reservation_slots", {
      p_reservation_id: reservationId,
      p_profile_id: user.id,
    });

    return new Response(JSON.stringify({
      ok: true,
      cancelled: false,
      left: true,
      refunded: result.refundedCents > 0,
      refundedCents: result.refundedCents,
      refundPending: result.pending,
      reason: result.reason,
    }), { headers: CORS });
  }

  // ── The organizer cancelling the whole booking ──────────────────────────
  const { data: playersRaw } = await service.rpc("reservation_paid_players", {
    p_reservation_id: reservationId,
  });
  const players = (playersRaw ?? []) as { profile_id: string }[];

  // Refund intents are recorded before the cancellation, same reasoning as the
  // single-payer version: evidence before action.
  const results: PerPlayerResult[] = [];
  for (const p of players) {
    results.push(await refundPlayer(service, reservationId, p.profile_id, user.id));
  }

  const { error: cancelError } = await userClient
    .rpc("cancel_reservation", { p_reservation_id: reservationId });

  if (cancelError) {
    const msg = cancelError.message ?? "";
    const status = msg.includes("not_authorized") ? 403
      : msg.includes("already_terminal") ? 409
      : msg.includes("reservation_not_found") ? 404 : 400;
    return new Response(JSON.stringify({ error: msg || "cancel_failed", refunds: results }), {
      status, headers: CORS,
    });
  }

  const totalRefunded = results.reduce((n, r) => n + r.refundedCents, 0);

  return new Response(JSON.stringify({
    ok: true,
    cancelled: true,
    left: false,
    refunded: totalRefunded > 0,
    refundedCents: totalRefunded,
    playersRefunded: results.filter(r => r.refundedCents > 0).length,
    refundPending: results.some(r => r.pending),
    reason: results.length === 1 ? results[0].reason : null,
  }), { headers: CORS });
});
