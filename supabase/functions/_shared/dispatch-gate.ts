// Dispatch gate for the internal push functions — Phase 0a of
// PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
//
// send-message-push and push-receipt-sweeper are called only from inside the
// database (two triggers and a cron job). verify_jwt does not protect them: the
// JWT those callers present is the public anon key, which ships in the mobile
// app. The real boundary is this header.
//
// ── Where the secret lives ──────────────────────────────────────────────────
//
// Vault, and ONLY Vault. The callers read it there to set the header; this
// module asks the database whether a header is right via
// is_valid_push_dispatch(), which returns a boolean and never the secret. No
// edge-function secret holds a copy — two copies drifted twice while being set
// up, and a drift here is silent (net.http_post is fire-and-forget, so a
// mismatch just stops delivery). See 20260921180000_push_dispatch_secret.sql.
//
// ── Modes ───────────────────────────────────────────────────────────────────
//
//   "log"      every verdict is logged, nothing is refused. Shipped first, so
//              the migration and the deploys can land in any order without
//              silencing DMs — DM push is the one working push path.
//   "enforce"  missing, wrong, or unverifiable → 401 with no detail.
//
// Flip to "enforce" only after the logs show every real call as `ok`
// (plan, Phase 0 deployment step 5). Rolling back is flipping it back and
// redeploying; no migration involved.
//
// An RPC failure counts as INVALID, never valid. If the database is down the
// push cannot be delivered anyway — recipients live there — so failing closed
// costs nothing that was not already lost.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const DISPATCH_GATE_MODE: "log" | "enforce" = "log";

const HEADER = "x-dispatch-secret";

type Verdict = "ok" | "missing" | "invalid" | "unverifiable";

async function verdictFor(req: Request, supabase: SupabaseClient | null): Promise<Verdict> {
  const candidate = req.headers.get(HEADER);
  if (!candidate) return "missing";
  if (!supabase) return "unverifiable";

  const { data, error } = await supabase.rpc("is_valid_push_dispatch", { p_candidate: candidate });
  if (error) {
    // The message only — never the candidate. A wrong guess is still a guess
    // at the secret and has no business in a log line.
    console.error(`[dispatch-gate] validation rpc failed: ${error.message}`);
    return "unverifiable";
  }
  return data === true ? "ok" : "invalid";
}

/**
 * Returns a 401 Response when the request must be refused, or null to proceed.
 * `supabase` must be a SERVICE-ROLE client: is_valid_push_dispatch is granted
 * to service_role only.
 */
export async function checkDispatch(
  req: Request,
  supabase: SupabaseClient | null,
  fn: string,
): Promise<Response | null> {
  const verdict = await verdictFor(req, supabase);

  if (verdict === "ok") {
    // Logged in log mode only: it is the evidence the enforce flip waits on.
    if (DISPATCH_GATE_MODE === "log") console.log(`[dispatch-gate] ${fn}: ok`);
    return null;
  }

  if (DISPATCH_GATE_MODE === "log") {
    console.warn(`[dispatch-gate] ${fn}: would reject (${verdict})`);
    return null;
  }

  console.warn(`[dispatch-gate] ${fn}: rejected (${verdict})`);
  return new Response("Unauthorized", { status: 401 });
}
