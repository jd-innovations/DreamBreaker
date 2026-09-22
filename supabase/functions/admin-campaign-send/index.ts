import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Queues an admin push campaign — Phase 2 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
//
// Accepts { campaignId, idempotencyKey } and NOTHING else (decision 3). It
// never accepts tokens: who receives a campaign is decided by the database
// (claim_campaign_send → snapshot_campaign_recipients), from the audience
// frozen when the campaign was scheduled. A body carrying `tokens` is refused
// with its own error code, because a client trying to supply recipients is a
// signal worth noticing, not just a malformed request.
//
// Two-step trust, same as admin-facility-import-commit: verify the caller's
// OWN JWT is an admin first, so is_admin() sees the real actor; only then use
// service_role, passing the verified admin id explicitly (service_role has no
// auth.uid()). claim_campaign_send re-checks that id is an admin anyway.
//
// This function only CLAIMS and SNAPSHOTS. Sending is the Phase 3 worker's
// job, so it returns 202 as soon as the recipients are frozen.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** admin_schedule_campaign mints 16 random bytes as hex. */
const KEY_RE = /^[0-9a-f]{32}$/;
const ALLOWED_KEYS = new Set(["campaignId", "idempotencyKey"]);

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    console.error("[admin-campaign-send] env missing");
    return json(500, { error: "server_misconfigured" });
  }

  // ── Step 1: who is calling, under their own session ──
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json(401, { error: "not_authenticated" });

  const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
  if (adminError || isAdmin !== true) return json(403, { error: "admin_only" });

  // ── The body: two fields, nothing else ──
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "bad_request" });
  }

  if ("tokens" in body) {
    // Deliberately loud. The UI never sends this; something that does is
    // either broken or probing.
    console.warn(`[admin-campaign-send] tokens_rejected: admin ${user.id} sent a tokens field`);
    return json(400, { error: "tokens_rejected" });
  }

  const extra = Object.keys(body).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length > 0) return json(400, { error: "unexpected_fields", fields: extra });

  const campaignId = body.campaignId;
  const idempotencyKey = body.idempotencyKey;
  if (typeof campaignId !== "string" || !UUID_RE.test(campaignId)) {
    return json(400, { error: "bad_request", detail: "campaignId must be a uuid" });
  }
  if (typeof idempotencyKey !== "string" || !KEY_RE.test(idempotencyKey)) {
    return json(400, { error: "bad_request", detail: "idempotencyKey is missing or malformed" });
  }

  // ── Step 2: the privileged part, as service_role ──
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await service.rpc("claim_campaign_send", {
    p_campaign_id: campaignId,
    p_idempotency_key: idempotencyKey,
    p_admin_id: user.id,
  });

  if (error) {
    console.error(`[admin-campaign-send] claim failed: ${error.message}`);
    return json(500, { error: "claim_failed" });
  }

  const result = (data ?? {}) as Record<string, unknown>;
  switch (result.result) {
    case "claimed":
      return json(202, {
        status: "queued",
        recipientUserCount: result.recipient_user_count,
        recipientDeviceCount: result.recipient_device_count,
        excludedUnknownPlatformCount: result.excluded_unknown_platform_count,
      });
    case "already_claimed":
      // A retry of a send that already went through. Same key, so this is the
      // idempotent success case, not an error.
      return json(202, { status: "already_queued", campaignStatus: result.status });
    case "disabled":
      // platform_settings.push_broadcast_enabled is off. Nothing was changed.
      return json(503, { error: "broadcast_disabled" });
    case "not_due":
      return json(409, { error: "not_due", scheduledAt: result.scheduled_at });
    case "key_mismatch":
      return json(409, { error: "key_mismatch" });
    case "not_sendable":
      return json(409, { error: "not_sendable", campaignStatus: result.status });
    case "not_found":
      return json(404, { error: "campaign_not_found" });
    default:
      console.error(`[admin-campaign-send] unexpected claim result: ${JSON.stringify(result)}`);
      return json(500, { error: "claim_failed" });
  }
});
