import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkDispatch } from "../_shared/dispatch-gate.ts";
import {
  chunk,
  classify,
  type ChunkResult,
  DELIVERIES_PER_INVOCATION,
  EXPO_MESSAGES_PER_REQUEST,
  EXPO_PUSH_URL,
  type ExpoResponse,
  minRoundMs,
  nextWiden,
  type Outcome,
  REQUEST_TIMEOUT_MS,
  ROUND_SIZE,
  TIME_BUDGET_MS,
} from "./logic.ts";

// Sends queued admin push campaigns — Phase 3 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
//
// Invoked every minute by pg_cron (campaign-batch-worker), gated by the Phase 0
// dispatch secret. Takes no input: it asks the database what is active, so
// there is no campaign body or recipient list for a caller to supply.
//
// This function only talks to Expo. Every state change — claiming a batch,
// recording outcomes, retry backoff, abort, finishing — is a service-role
// database function (20260921210000_campaign_worker.sql). The budget and the
// failure classification are in logic.ts, with their tests.
//
// Per run: at most DELIVERIES_PER_INVOCATION deliveries, no new batch after
// TIME_BUDGET_MS. Whatever is left is picked up next minute — all state is in
// the delivery rows, so resuming has no gaps and no repeats.
//
// Logs carry campaign ids, counts, durations and error codes. NEVER tokens.

type Delivery = { id: string; token: string };
type CampaignContent = { title: string; body: string; url: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendChunk(deliveries: Delivery[], content: CampaignContent, campaignId: string): Promise<ChunkResult> {
  const ids = deliveries.map((d) => d.id);
  const messages = deliveries.map((d) => ({
    to: d.token,
    title: content.title,
    body: content.body,
    // `url` is what installed builds already route on (externalRouting).
    data: { url: content.url, campaignId },
    sound: "default",
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: ExpoResponse;
  try {
    const r = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    res = { kind: "http", status: r.status, body };
  } catch (err) {
    res = { kind: "network", message: err instanceof Error ? err.name : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }

  return classify(ids, res);
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("[process-campaign-batch] service role env missing");
    return new Response(JSON.stringify({ error: "missing_env" }), { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const refused = await checkDispatch(req, supabase, "process-campaign-batch");
  if (refused) return refused;

  const started = Date.now();
  let processed = 0;
  let widen = 1;
  const summary: Record<string, unknown>[] = [];

  const { data: active, error: activeError } = await supabase.rpc("worker_active_campaigns");
  if (activeError) {
    console.error(`[process-campaign-batch] active campaigns lookup failed: ${activeError.message}`);
    return new Response(JSON.stringify({ error: "lookup_failed" }), { status: 500 });
  }

  outer:
  for (const c of (active ?? []) as { campaign_id: string; status: string }[]) {
    const campaignId = c.campaign_id;
    const tally = { campaignId, batches: 0, accepted: 0, retry: 0, invalid: 0, failed: 0, state: "", final: "" };

    while (true) {
      if (processed >= DELIVERIES_PER_INVOCATION || Date.now() - started > TIME_BUDGET_MS) {
        tally.state = "budget";
        break;
      }

      const limit = Math.min(ROUND_SIZE, DELIVERIES_PER_INVOCATION - processed);
      const { data: claim, error: claimError } = await supabase.rpc("worker_claim_batch", {
        p_campaign_id: campaignId,
        p_limit: limit,
      });
      if (claimError) {
        console.error(`[process-campaign-batch] claim failed for ${campaignId}: ${claimError.message}`);
        tally.state = "claim_error";
        break;
      }

      const state = (claim as { state?: string })?.state;
      if (state === "disabled") {
        // Kill switch. Stop the whole run, claim nothing more.
        console.log("[process-campaign-batch] push_broadcast_enabled is off; exiting");
        summary.push({ ...tally, state: "disabled" });
        break outer;
      }
      if (state !== "ok") {
        tally.state = state ?? "unknown";
        break;
      }

      const deliveries = ((claim as { deliveries?: Delivery[] }).deliveries ?? []);
      if (deliveries.length === 0) {
        tally.state = "nothing_due";
        break;
      }
      const content = (claim as { campaign: CampaignContent }).campaign;

      const roundStart = Date.now();
      const results = await Promise.all(
        chunk(deliveries, EXPO_MESSAGES_PER_REQUEST).map((ch) => sendChunk(ch, content, campaignId)),
      );

      const outcomes: Outcome[] = results.flatMap((r) => r.outcomes);
      const fatal = results.find((r) => r.fatal)?.fatal ?? null;
      const alerts = [...new Set(results.flatMap((r) => r.alerts))];
      widen = nextWiden(widen, results.some((r) => r.widen));

      // Record, with one retry: a lost record leaves rows `submitted`, which
      // finalize eventually fails as `interrupted` — safe, but a lost delivery.
      let recorded = await supabase.rpc("worker_record_results", { p_campaign_id: campaignId, p_results: outcomes });
      if (recorded.error) {
        await sleep(500);
        recorded = await supabase.rpc("worker_record_results", { p_campaign_id: campaignId, p_results: outcomes });
      }
      if (recorded.error) {
        console.error(`[process-campaign-batch] record failed for ${campaignId}: ${recorded.error.message}`);
      }

      processed += deliveries.length;
      tally.batches += 1;
      for (const o of outcomes) {
        if (o.outcome === "accepted") tally.accepted += 1;
        else if (o.outcome === "retry") tally.retry += 1;
        else if (o.outcome === "invalid_token") tally.invalid += 1;
        else tally.failed += 1;
      }
      if (alerts.length > 0) {
        console.error(`[process-campaign-batch] campaign ${campaignId} alerts: ${alerts.join(", ")}`);
      }

      if (fatal) {
        console.error(`[process-campaign-batch] campaign ${campaignId} halted: ${fatal}`);
        const { error } = await supabase.rpc("worker_fail_campaign", { p_campaign_id: campaignId, p_error_code: fatal });
        if (error) console.error(`[process-campaign-batch] fail_campaign failed: ${error.message}`);
        tally.state = `fatal:${fatal}`;
        break;
      }

      const wait = minRoundMs(deliveries.length, widen) - (Date.now() - roundStart);
      if (wait > 0) await sleep(wait);
    }

    const { data: final, error: finalError } = await supabase.rpc("worker_finalize_campaign", { p_campaign_id: campaignId });
    if (finalError) console.error(`[process-campaign-batch] finalize failed for ${campaignId}: ${finalError.message}`);
    tally.final = (final as string) ?? "";
    summary.push(tally);

    if (processed >= DELIVERIES_PER_INVOCATION || Date.now() - started > TIME_BUDGET_MS) break;
  }

  const result = { processed, widen, durationMs: Date.now() - started, campaigns: summary };
  if (summary.length > 0) console.log(`[process-campaign-batch] ${JSON.stringify(result)}`);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
