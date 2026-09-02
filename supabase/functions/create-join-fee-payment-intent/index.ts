// Charges a joiner their own convenience fee.
//
// The organizer pays theirs as part of the booking; everyone who joins pays
// their own. join_reservation() has already reserved the seat as 'held' with a
// 10-minute expiry, so this only has to charge for a seat that is already
// theirs — no capacity logic here, and none possible: two people cannot both
// hold the last seat.
//
// Same discipline as create-booking-payment-intent: the amount comes from the
// held row, which the database wrote from platform_settings. A client-supplied
// figure would be a client deciding what to pay.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient, createPayment } from "../_shared/payments.ts";

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

  let reservationId = "";
  let attemptId = "";
  try {
    const body = await req.json();
    reservationId = typeof body.reservationId === "string" ? body.reservationId : "";
    attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  if (!reservationId || !attemptId) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400, headers: CORS });
  }

  const service = getServiceClient();

  const { data: seat, error: seatError } = await service
    .from("reservation_players")
    .select("id, status, hold_expires_at, service_fee_cents, is_organizer")
    .eq("reservation_id", reservationId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (seatError || !seat) {
    return new Response(JSON.stringify({ error: "not_joined" }), { status: 404, headers: CORS });
  }

  if (seat.is_organizer) {
    // The organizer's fee is part of the booking charge. Charging again here
    // would take it twice.
    return new Response(JSON.stringify({ error: "organizer_already_paid" }), { status: 409, headers: CORS });
  }

  if (seat.status === "confirmed") {
    return new Response(JSON.stringify({ error: "already_paid" }), { status: 409, headers: CORS });
  }

  // The seat is only theirs while the hold stands. Charging past it would take
  // money for a seat the sweeper is entitled to release.
  if (seat.hold_expires_at && new Date(seat.hold_expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: "hold_expired" }), { status: 409, headers: CORS });
  }

  const amountCents = seat.service_fee_cents ?? 0;
  if (amountCents <= 0) {
    // No fee configured — nothing to charge, and join_reservation already
    // seated them as confirmed.
    return new Response(JSON.stringify({ error: "no_payment_required" }), { status: 400, headers: CORS });
  }

  try {
    const { clientSecret } = await createPayment({
      purposeType: "reservation_join_fee",
      purposeId: reservationId,
      payerUserId: user.id,
      amountCents,
      idempotencyKey: `reservation_join_fee:${reservationId}:${user.id}:${attemptId}`,
      metadata: {
        reservationId,
        joinerId: user.id,
        convenienceFeeCents: String(amountCents),
      },
    });

    return new Response(JSON.stringify({ clientSecret, amountCents }), { headers: CORS });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[create-join-fee-payment-intent]", detail);
    return new Response(JSON.stringify({ error: "payment_intent_failed", detail: detail.slice(0, 200) }), {
      status: 500, headers: CORS,
    });
  }
});
