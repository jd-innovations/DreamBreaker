import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@shared/database.types";

// Section 4.1 of MEMBERSHIP_PHASE5_STOREKIT.md.
//
// This route deliberately contains no membership logic. It authenticates the
// request, hands the raw payload to handle_membership_store_event(), and
// reports what that returned. Every decision about terms, vouchers and
// entitlement lives in SQL alongside start_membership_term(), so the webhook
// path and the admin path cannot drift on what a renewal means.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Authenticates on a shared Authorization header.
 *
 * Correction to what this comment said originally: RevenueCat DOES offer
 * HMAC-SHA256 signing, with a signing secret it generates and shows once. That
 * is strictly stronger than what is here, because it authenticates the BODY
 * rather than proving the caller knows a password. Worth adopting; deliberately
 * not yet, because turning it on is a dashboard change that would silently
 * break delivery if the code were not ready for it first.
 *
 * Until then the header is a bearer password: anyone holding it can grant
 * themselves a paid membership and a $25 voucher.
 *
 * Consequences, all of them load-bearing:
 *
 *   - The comparison is constant-time. A plain === leaks the secret one byte
 *     at a time to anyone who can measure response latency, and this endpoint
 *     is worth attacking.
 *   - Both sides are hashed to a fixed 32 bytes first. timingSafeEqual throws
 *     on a length mismatch, and that throw is itself an oracle for the
 *     secret's length.
 *   - A missing or empty REVENUECAT_WEBHOOK_SECRET rejects everything rather
 *     than defaulting open. An unconfigured deploy that accepted every request
 *     would be indistinguishable from a working one until it was abused.
 */
function authorized(header: string | null): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret || secret.trim() === "" || !header) return false;

  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    // No detail in the body: "wrong secret" and "not configured" are the same
    // answer to anyone outside.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    // 400, not 500 -- RevenueCat retries on 5xx, and a body that will never
    // parse would retry forever.
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("handle_membership_store_event", {
    p_payload: payload as Json,
  });

  if (error) {
    // 500 on purpose: an RPC that failed outright is a fault on our side, and
    // RevenueCat's retry is the thing that stops a paid term being lost. The
    // handler swallows its own logical refusals and returns them as data, so
    // reaching here means something genuinely broke.
    console.error("[revenuecat] handler failed", error.message);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  // The blind spot this closes, found 2026-09-16 while trying to tell "nothing
  // was delivered" apart from "something was delivered and rejected":
  //
  // handle_membership_store_event() validates the payload shape BEFORE it
  // records anything, so `no_event` and `malformed_event` write no row. A
  // delivery in an unexpected shape therefore left no trace at all -- 200 to
  // RevenueCat, a green tick in their dashboard, an empty table, and no way to
  // tell the two cases apart.
  //
  // So those two outcomes, and only those two, are logged with a truncated
  // body. Vercel's runtime log becomes the witness for events the database
  // never sees. Truncated because the payload is third-party data of unknown
  // size, and capped rather than omitted because the SHAPE is the whole point
  // of logging it.
  const result = data as { ok?: boolean; reason?: string } | null;
  if (result?.ok === false &&
      (result.reason === "no_event" || result.reason === "malformed_event")) {
    console.error(
      `[revenuecat] unrecorded delivery (${result.reason}):`,
      JSON.stringify(payload).slice(0, 1000),
    );
  }

  // 200 even when the handler reports ok:false. Those are final answers -- an
  // unknown app_user_id, a renewal that does not move the expiry forward --
  // and retrying them produces the same answer forever. The event and its
  // outcome are both recorded in membership_store_events, so nothing is lost;
  // it becomes an admin question rather than a retry storm.
  return NextResponse.json({ received: true, result: data });
}
