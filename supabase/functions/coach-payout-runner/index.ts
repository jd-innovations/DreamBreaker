import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getStripe, getServiceClient } from "../_shared/payments.ts";

// Coach Marketplace Phase 6 — the weekly payout run.
//
// Charges are plain platform charges, so money sits in the platform's Stripe
// balance and reaches a coach as a separate Transfer to their connected
// account. Eligibility is redemption-based and past the settlement hold: a
// coach is paid for a lesson that has actually been delivered.
//
// Ordering is the whole design. For each coach:
//
//   1. claim_coach_payout_batch()  — reserves the redemptions into a pending
//                                    batch, in the database, atomically
//   2. stripe.transfers.create()   — moves the money
//   3. settle_coach_payout_batch() — records the transfer id, or the failure
//
// Claiming first is what makes a crash survivable. If this dies between 1 and
// 2, the redemptions are already spoken for, so the next run cannot pay them
// again; it finds the pending batch and retries the transfer instead. The
// reverse order — transfer then record — would double-pay on any crash, and
// the money would already be gone.
//
// Every transfer uses the batch id as its Stripe idempotency key, so even a
// retry that Stripe already accepted returns the original transfer rather than
// creating a second one.

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
  coachId: string,
): Promise<{ ok: true; transferId: string } | { ok: false; reason: string }> {
  try {
    const transfer = await getStripe().transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination,
        metadata: { batch_id: batchId, coach_id: coachId, purpose: "coach_marketplace_payout" },
      },
      // The batch id, not a random value: a retry of the same batch must return
      // Stripe's original transfer, never make a second one.
      { idempotencyKey: `coach_payout:${batchId}` },
    );
    return { ok: true, transferId: transfer.id };
  } catch (err) {
    // Insufficient platform balance is the expected failure, not an anomaly —
    // it simply means the run is early relative to funds settling. Recorded as
    // a failed batch so the next run can see why, rather than thrown away.
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
    // ── 1. Retry anything left pending by an earlier run ───────────────────
    //
    // A pending batch means the redemptions were claimed but the transfer did
    // not complete — a crash, a timeout, or an insufficient balance. These are
    // paid before new work, so a coach whose payout failed last week is not
    // behind a queue of this week's.
    const { data: pending } = await service
      .from("coach_payout_batches")
      .select("id, coach_id, amount_cents, stripe_account_id")
      // 'failed' as well as 'pending'. A failed batch keeps its items, and the
      // payable view excludes any redemption that appears in an item row
      // whatever the batch status — so without retrying failures, one
      // transient error (an insufficient balance on the day the run fires)
      // would strand that coach's money permanently, invisible to everyone.
      // Safe to retry because the Stripe idempotency key is the batch id: a
      // transfer Stripe already accepted comes back rather than repeating.
      .in("status", ["pending", "failed"]);

    for (const b of pending ?? []) {
      summary.retried++;
      const res = await payBatch(b.id, b.amount_cents, b.stripe_account_id, b.coach_id);
      if (res.ok) {
        await service.rpc("settle_coach_payout_batch", { p_batch_id: b.id, p_transfer_id: res.transferId });
        summary.paid++;
        summary.totalCents += b.amount_cents;
      } else {
        await service.rpc("settle_coach_payout_batch", {
          p_batch_id: b.id, p_transfer_id: null, p_failure: res.reason,
        });
        summary.failed++;
      }
    }

    // ── 2. Claim and pay new work ──────────────────────────────────────────
    const { data: payable, error: payableError } = await service
      .from("v_coach_payable_redemptions")
      .select("coach_id");

    if (payableError) {
      console.error("[coach-payout-runner] could not read payable redemptions", payableError);
      return new Response(JSON.stringify({ error: "payable_query_failed" }), { status: 500, headers: CORS });
    }

    const coachIds = Array.from(new Set((payable ?? []).map(r => r.coach_id as string)));

    for (const coachId of coachIds) {
      const { data: claimed, error: claimError } = await service
        .rpc("claim_coach_payout_batch", { p_coach_id: coachId });

      if (claimError) {
        console.error("[coach-payout-runner] claim failed", coachId, claimError);
        summary.failed++;
        continue;
      }

      const batch = (Array.isArray(claimed) ? claimed[0] : claimed) as ClaimedBatch | undefined;
      // No batch means nothing was eligible after all — another run may have
      // taken it between the read and the claim. Not an error.
      if (!batch?.batch_id) continue;

      summary.claimed++;
      const res = await payBatch(batch.batch_id, batch.amount_cents, batch.stripe_account_id, coachId);

      if (res.ok) {
        await service.rpc("settle_coach_payout_batch", {
          p_batch_id: batch.batch_id, p_transfer_id: res.transferId,
        });
        summary.paid++;
        summary.totalCents += batch.amount_cents;
      } else {
        await service.rpc("settle_coach_payout_batch", {
          p_batch_id: batch.batch_id, p_transfer_id: null, p_failure: res.reason,
        });
        summary.failed++;
      }
    }

    console.log("[coach-payout-runner]", JSON.stringify(summary));
    return new Response(JSON.stringify({ ok: true, ...summary }), { headers: CORS });
  } catch (err) {
    console.error("[coach-payout-runner] unhandled", err);
    return new Response(JSON.stringify({ error: "runner_failed" }), { status: 500, headers: CORS });
  }
});
