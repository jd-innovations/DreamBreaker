import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPayment, getServiceClient } from "../_shared/payments.ts";

// Booking Engine Phase 3A — the second real consumer of the shared payment
// foundation (supabase/functions/_shared/payments.ts), after tournament
// entry fees. Same shape as create-tournament-entry-payment-intent: verify
// the caller's own JWT, resolve the AUTHORITATIVE amount from server-side
// data (never the client), then hand off to the generic primitive.
//
// The reservation this pays for MUST already exist — create_reservation()
// (the Choose Time & Court RPC) is the only thing that creates a
// reservations row. This function never creates one; it only attaches a
// payment to the existing held reservation, per the reservation_id already
// in bookingStore. No registration/reservation exists to duplicate here,
// unlike tournament entry which creates its row later — booking's row
// already exists in 'held' status; a webhook (or, until 3B's webhook
// endpoint is reachable, the dev simulate-payment route) flips it to
// 'confirmed' via finalizeReservationPayment() in web/src/lib/payments/finalizePayment.ts.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type RequestBody = {
  reservationId?: unknown;
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

  const reservationId = typeof body.reservationId === "string" ? body.reservationId : "";
  const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : "default";

  if (!reservationId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  // Authoritative reservation lookup — the server-snapshotted price
  // (final_price_cents, already incl. any Flash Deal discount, set once by
  // create_reservation() and never recomputed) is the only amount this
  // function will ever charge. Never read an amount from the request body.
  const { data: reservation, error: reservationError } = await service
    .from("reservations")
    .select("id, facility_id, asset_type, asset_id, organizer_id, status, hold_expires_at, final_price_cents")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError || !reservation) {
    return new Response(JSON.stringify({ error: "reservation_not_found" }), { status: 404, headers: CORS });
  }

  if (reservation.organizer_id !== user.id) {
    return new Response(JSON.stringify({ error: "not_organizer" }), { status: 403, headers: CORS });
  }

  if (reservation.status === "confirmed") {
    return new Response(JSON.stringify({ error: "already_confirmed" }), { status: 409, headers: CORS });
  }

  if (reservation.status === "cancelled" || reservation.status === "expired") {
    return new Response(JSON.stringify({ error: "reservation_unavailable" }), { status: 409, headers: CORS });
  }

  // No server-side hold-expiry sweep exists yet (see the Phase 2 reservation
  // migration) — a 'held' row does not auto-transition to 'expired'. This is
  // the client-independent guard: even if nothing else has touched the row,
  // refuse to start a real charge against a hold whose countdown has lapsed.
  if (reservation.status === "held" && reservation.hold_expires_at && new Date(reservation.hold_expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: "hold_expired" }), { status: 409, headers: CORS });
  }

  const amountCents = reservation.final_price_cents ?? 0;

  if (amountCents <= 0) {
    // Free reservation (e.g. a facility with no rate set) — nothing to pay.
    // The caller should fall back to confirmReservation() directly, the same
    // as before Stripe was wired in.
    return new Response(JSON.stringify({ error: "no_payment_required" }), { status: 400, headers: CORS });
  }

  try {
    const { clientSecret } = await createPayment({
      purposeType: "reservation_payment",
      purposeId: reservationId,
      payerUserId: user.id,
      amountCents,
      idempotencyKey: `reservation_payment:${reservationId}:${user.id}:${attemptId}`,
      metadata: {
        reservationId,
        facilityId: reservation.facility_id,
        assetType: reservation.asset_type,
        assetId: reservation.asset_id,
        organizerId: user.id,
      },
    });

    return new Response(JSON.stringify({ clientSecret, amountCents }), { headers: CORS });
  } catch (err) {
    console.error("[create-booking-payment-intent]", err);
    return new Response(JSON.stringify({ error: "payment_intent_failed" }), { status: 500, headers: CORS });
  }
});
