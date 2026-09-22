import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Sends a campaign to the CALLING ADMIN'S OWN devices, so they can see it on a
// phone before anyone else does — Phase 2 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
//
// What it deliberately does not do:
//   - accept a recipient. The recipients are the caller's own push_tokens rows,
//     looked up here from the verified user id. There is no parameter to point
//     it at anyone else.
//   - touch campaign_deliveries or the campaign's status. A test must not
//     appear in delivery metrics, and must not count as the real send.
//
// Every test is audited (action `test_sent`), and the audit log is also what
// the rate limit counts: at most TEST_SENDS_PER_MINUTE per admin.
//
// Two-step trust, as in admin-campaign-send.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_SENDS_PER_MINUTE = 5;

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
    console.error("[admin-campaign-test-send] env missing");
    return json(500, { error: "server_misconfigured" });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json(401, { error: "not_authenticated" });

  const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
  if (adminError || isAdmin !== true) return json(403, { error: "admin_only" });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "bad_request" });
  }

  if ("tokens" in body) {
    console.warn(`[admin-campaign-test-send] tokens_rejected: admin ${user.id} sent a tokens field`);
    return json(400, { error: "tokens_rejected" });
  }
  const extra = Object.keys(body).filter((k) => k !== "campaignId");
  if (extra.length > 0) return json(400, { error: "unexpected_fields", fields: extra });

  const campaignId = body.campaignId;
  if (typeof campaignId !== "string" || !UUID_RE.test(campaignId)) {
    return json(400, { error: "bad_request", detail: "campaignId must be a uuid" });
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Rate limit, counted from the audit log.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent, error: countError } = await service
    .from("campaign_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", user.id)
    .eq("action", "test_sent")
    .gt("created_at", since);
  if (countError) {
    console.error(`[admin-campaign-test-send] rate-limit count failed: ${countError.message}`);
    return json(500, { error: "server_error" });
  }
  if ((recent ?? 0) >= TEST_SENDS_PER_MINUTE) return json(429, { error: "rate_limited" });

  const { data: campaign, error: campaignError } = await service
    .from("notification_campaigns")
    .select("id, title, body, destination_url")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) {
    console.error(`[admin-campaign-test-send] campaign lookup failed: ${campaignError.message}`);
    return json(500, { error: "server_error" });
  }
  if (!campaign) return json(404, { error: "campaign_not_found" });

  // The caller's own devices, and only theirs.
  const { data: rows, error: tokenError } = await service
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", user.id);
  if (tokenError) {
    console.error(`[admin-campaign-test-send] token lookup failed: ${tokenError.message}`);
    return json(500, { error: "server_error" });
  }

  const tokens = [...new Set((rows ?? [])
    .map((r) => r.expo_push_token as string)
    .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken")))];
  if (tokens.length === 0) {
    return json(422, { error: "no_devices", detail: "Sign in to the app on a phone with notifications allowed, then try again." });
  }

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
    body: JSON.stringify(tokens.map((to) => ({
      to,
      title: campaign.title,
      body: campaign.body,
      // `url` is what installed builds already route on. `test` lets the
      // Phase 6 tap recorder ignore it.
      data: { url: campaign.destination_url, campaignId: campaign.id, test: true },
      sound: "default",
    }))),
  });

  let accepted = 0;
  if (res.ok) {
    try {
      const parsed = (await res.json()) as { data?: { status?: string }[] };
      accepted = (parsed.data ?? []).filter((t) => t.status === "ok").length;
    } catch {
      // Sent but unreadable; accepted stays 0 and the audit says so.
    }
  } else {
    console.error(`[admin-campaign-test-send] expo ${res.status}`);
  }

  const { error: auditError } = await service.from("campaign_audit_log").insert({
    campaign_id: campaign.id,
    actor_id: user.id,
    action: "test_sent",
    metadata: { device_count: tokens.length, accepted, expo_status: res.status },
  });
  if (auditError) console.error(`[admin-campaign-test-send] audit insert failed: ${auditError.message}`);

  if (!res.ok) return json(502, { error: "expo_unavailable" });
  // Counts only — never a token.
  return json(200, { deviceCount: tokens.length, accepted });
});
