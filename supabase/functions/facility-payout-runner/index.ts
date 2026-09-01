// Weekly transfers to facility Connect accounts. Facility Marketplace Phase 7.
//
// A near-clone of coach-payout-runner, deliberately. The ordering is the part
// that matters and it is identical:
//
//   1. claim_facility_payout_batch()  — reserves the reservations into a
//                                       pending batch, inside one transaction
//   2. stripe.transfers.create()      — moves the money
//   3. settle_facility_payout_batch() — records the transfer id, or the failure
//
// Claiming first means a crash between 1 and 2 leaves a pending batch to
// investigate rather than money moved with no record of why.
//
// What is NOT here, versus the coach runner: no withheldOnly path. Facility
// batches carry no clawback withholding, because a booking refund necessarily
// happens before the slot ends and a booking is only payable after it ends —
// so a facility batch is never zero after withholding. It can only be absent.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getServiceClient, getStripe } from "../_shared/payments.ts";

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type ClaimedBatch = { batch_id: string; amount_cents: number; stripe_account_id: string };

async function payBatch(
  batchId: string,
  amountCents: number,
  destination: string,
  facilityId: string,
): Promise<{ ok: true; transferId: string } | { ok: false; reason: string }> {
  try {
    const transfer = await getStripe().transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination,
        metadata: { batch_id: batchId, facility_id: facilityId, purpose: "facility_marketplace_payout" },
      },
      // The batch id, not a random value: a retry of the same batch must return
      // Stripe's original transfer, never make a second one.
      { idempotencyKey: `facility_payout:${batchId}` },
    );
    return { ok: true, transferId: transfer.id };
  } catch (err) {
    // Insufficient platform balance is the expected failure, not an anomaly —
    // it means the run is early relative to funds settling. Recorded as a
    // failed batch so the next run can see why, rather than thrown away.
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: reason.slice(0, 400) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });
  }

  const service = getServiceClient();
  const summary = { retried: 0, claimed: 0, paid: 0, failed: 0, totalCents: 0 };

  try {
    // 1. Retry anything an earlier run left behind.
    //
    // 'failed' as well as 'pending'. A failed batch keeps its items, and the
    // payable view excludes any reservation appearing in an item row whatever
    // the batch status — so without retrying failures, one transient error
    // (an insufficient balance on the day the run fires) would strand that
    // facility's money permanently and invisibly. Safe because the Stripe
    // idempotency key is the batch id.
    const { data: pending } = await service
      .from("facility_payout_batches")
      .select("id, facility_id, amount_cents, stripe_account_id")
      .in("status", ["pending", "failed"]);

    for (const b of pending ?? []) {
      summary.retried++;
      const res = await payBatch(b.id, b.amount_cents, b.stripe_account_id, b.facility_id);
      if (res.ok) {
        await service.rpc("settle_facility_payout_batch", { p_batch_id: b.id, p_transfer_id: res.transferId });
        summary.paid++;
        summary.totalCents += b.amount_cents;
      } else {
        await service.rpc("settle_facility_payout_batch", {
          p_batch_id: b.id, p_transfer_id: null, p_failure: res.reason,
        });
        summary.failed++;
      }
    }

    // 2. Claim and pay new work.
    const { data: payable, error: payableError } = await service
      .from("v_facility_payable_reservations")
      .select("facility_id");

    if (payableError) {
      console.error("[facility-payout-runner] could not read payable reservations", payableError);
      return new Response(JSON.stringify({ error: "payable_query_failed" }), { status: 500, headers: CORS });
    }

    const facilityIds = Array.from(new Set((payable ?? []).map(r => r.facility_id as string)));

    for (const facilityId of facilityIds) {
      const { data: claimed, error: claimError } = await service
        .rpc("claim_facility_payout_batch", { p_facility_id: facilityId });

      if (claimError) {
        console.error("[facility-payout-runner] claim failed", facilityId, claimError);
        summary.failed++;
        continue;
      }

      const batch = (Array.isArray(claimed) ? claimed[0] : claimed) as ClaimedBatch | undefined;
      // No batch means nothing was eligible after all: below the minimum payout,
      // onboarding unfinished, or another run took it between the read and the
      // claim. None of those is an error.
      if (!batch?.batch_id) continue;

      summary.claimed++;

      const res = await payBatch(batch.batch_id, batch.amount_cents, batch.stripe_account_id, facilityId);

      if (res.ok) {
        await service.rpc("settle_facility_payout_batch", {
          p_batch_id: batch.batch_id, p_transfer_id: res.transferId,
        });
        summary.paid++;
        summary.totalCents += batch.amount_cents;
      } else {
        await service.rpc("settle_facility_payout_batch", {
          p_batch_id: batch.batch_id, p_transfer_id: null, p_failure: res.reason,
        });
        summary.failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, ...summary }), { headers: CORS });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[facility-payout-runner]", detail);
    return new Response(JSON.stringify({ error: "runner_failed", detail: detail.slice(0, 200) }), {
      status: 500, headers: CORS,
    });
  }
});
