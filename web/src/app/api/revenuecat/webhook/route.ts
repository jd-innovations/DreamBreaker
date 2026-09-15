import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

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
 * RevenueCat does not sign its webhooks the way Stripe does.
 *
 * Stripe sends an HMAC over the body, so a forged request fails verification
 * even if the endpoint URL leaks. RevenueCat instead sends whatever fixed
 * string you configure in its dashboard, in the Authorization header. That
 * makes the header a bearer password: anyone holding it can grant themselves a
 * paid membership and a $25 voucher.
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

  // The cast is temporary and load-bearing only until the migration is applied.
  // `Database` is generated from the live schema, so it will not know
  // handle_membership_store_event until 20260915120000 has run and the types
  // have been regenerated -- and without the cast this route does not compile,
  // which would break the whole web build rather than just this endpoint.
  //
  // REMOVE IT once types are regenerated (and mind the UTF-16 trap when doing
  // so -- see project_gen_types_utf16).
  const rpc = service.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc("handle_membership_store_event", {
    p_payload: payload,
  });

  if (error) {
    // 500 on purpose: an RPC that failed outright is a fault on our side, and
    // RevenueCat's retry is the thing that stops a paid term being lost. The
    // handler swallows its own logical refusals and returns them as data, so
    // reaching here means something genuinely broke.
    console.error("[revenuecat] handler failed", error.message);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  // 200 even when the handler reports ok:false. Those are final answers -- an
  // unknown app_user_id, a renewal that does not move the expiry forward --
  // and retrying them produces the same answer forever. The event and its
  // outcome are both recorded in membership_store_events, so nothing is lost;
  // it becomes an admin question rather than a retry storm.
  return NextResponse.json({ received: true, result: data });
}
