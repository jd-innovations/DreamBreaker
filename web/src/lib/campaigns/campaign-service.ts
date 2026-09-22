// Data layer for the admin push-campaign screens — Phase 5 of
// PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
//
// Everything here runs under the admin's own session. The browser never sees
// a push token: campaigns and the audit log are admin-readable by RLS, and
// delivery rows come only through admin_campaign_deliveries(), which masks
// the token. Sends go through the admin-campaign-* edge functions, which take
// a campaign id and nothing else.

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@shared/database.types";
import {
  audienceParams,
  parseThreshold,
  rpcErrorMessage,
  SEND_CONFIRM_KEY,
  sendErrorMessage,
  type AudienceChoice,
} from "./campaign-logic";

type Fns = Database["public"]["Functions"];
export type CampaignRow = Database["public"]["Tables"]["notification_campaigns"]["Row"];
export type CampaignSummary = Fns["admin_campaign_summary"]["Returns"][number];
export type CampaignDelivery = Fns["admin_campaign_deliveries"]["Returns"][number];
export type AuditRow = Database["public"]["Tables"]["campaign_audit_log"]["Row"];
export type AudiencePreview = { user_count: number; device_count: number; excluded_unknown_platform: number };

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<Result<{ rows: CampaignRow[]; summaries: CampaignSummary[] }>> {
  const supabase = createClient();
  const [rows, sums] = await Promise.all([
    supabase.from("notification_campaigns").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("admin_campaign_summary", {}),
  ]);
  if (rows.error) return fail(rpcErrorMessage(rows.error));
  if (sums.error) return fail(rpcErrorMessage(sums.error));
  return { ok: true, data: { rows: rows.data ?? [], summaries: sums.data ?? [] } };
}

export async function getCampaign(id: string): Promise<Result<CampaignRow | null>> {
  const { data, error } = await createClient()
    .from("notification_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) return fail(rpcErrorMessage(error));
  return { ok: true, data };
}

export async function getSummary(id: string): Promise<Result<CampaignSummary | null>> {
  const { data, error } = await createClient().rpc("admin_campaign_summary", { p_campaign_id: id });
  if (error) return fail(rpcErrorMessage(error));
  return { ok: true, data: data?.[0] ?? null };
}

/** Up to 1,000 rows — enough to group causes; the detail page says if capped. */
export async function getDeliveries(id: string): Promise<Result<CampaignDelivery[]>> {
  const { data, error } = await createClient()
    .rpc("admin_campaign_deliveries", { p_campaign_id: id, p_limit: 1000, p_offset: 0 });
  if (error) return fail(rpcErrorMessage(error));
  return { ok: true, data: data ?? [] };
}

export async function getAudit(id: string): Promise<Result<AuditRow[]>> {
  const { data, error } = await createClient()
    .from("campaign_audit_log").select("*").eq("campaign_id", id).order("created_at", { ascending: true });
  if (error) return fail(rpcErrorMessage(error));
  return { ok: true, data: data ?? [] };
}

/** id → display name, for the actors on a campaign and its audit trail. */
export async function getActorNames(ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return {};
  const { data } = await createClient().from("profiles").select("id, full_name").in("id", unique);
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id] = p.full_name?.trim() || "Unnamed admin";
  return out;
}

export type BroadcastConfig = { enabled: boolean; threshold: number };

/** Kill switch and typed-SEND threshold, both from platform_settings. */
export async function getBroadcastConfig(): Promise<BroadcastConfig> {
  const { data } = await createClient()
    .from("platform_settings").select("key, value")
    .in("key", ["push_broadcast_enabled", SEND_CONFIRM_KEY]);
  const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    enabled: byKey.get("push_broadcast_enabled") === "true",
    threshold: parseThreshold(byKey.get(SEND_CONFIRM_KEY)),
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export type DraftInput = {
  id: string | null;
  internalName: string;
  title: string;
  body: string;
  audience: AudienceChoice;
  destinationUrl: string;
};

export async function saveDraft(d: DraftInput): Promise<Result<string>> {
  const a = audienceParams(d.audience);
  const { data, error } = await createClient().rpc("admin_upsert_campaign", {
    p_internal_name: d.internalName,
    p_title: d.title,
    p_body: d.body,
    p_audience_type: a.p_audience_type,
    p_audience_platform: a.p_audience_platform ?? undefined,
    p_destination_url: d.destinationUrl,
    p_campaign_id: d.id ?? undefined,
  });
  if (error || !data) return fail(rpcErrorMessage(error));
  return { ok: true, data };
}

export async function previewAudience(choice: AudienceChoice): Promise<Result<AudiencePreview>> {
  const a = audienceParams(choice);
  const { data, error } = await createClient().rpc("admin_preview_campaign_audience", {
    p_audience_type: a.p_audience_type,
    p_audience_platform: a.p_audience_platform ?? undefined,
  });
  if (error) return fail(rpcErrorMessage(error));
  const row = data?.[0];
  if (!row) return fail("No audience preview was returned.");
  return { ok: true, data: row };
}

export async function cancelCampaign(id: string): Promise<Result<null>> {
  const { error } = await createClient().rpc("admin_cancel_campaign", { p_campaign_id: id });
  return error ? fail(rpcErrorMessage(error)) : { ok: true, data: null };
}

export async function abortCampaign(id: string): Promise<Result<null>> {
  const { error } = await createClient().rpc("admin_abort_campaign", { p_campaign_id: id });
  return error ? fail(rpcErrorMessage(error)) : { ok: true, data: null };
}

/**
 * Freezes the draft and mints its idempotency key. `at` null = now. For a
 * later time nothing else is needed: the campaign-scheduler cron queues it.
 */
async function schedule(id: string, at: string | null): Promise<Result<string>> {
  const { data, error } = await createClient().rpc("admin_schedule_campaign", {
    p_campaign_id: id,
    p_scheduled_at: at ?? undefined,
  });
  if (error || !data) return fail(rpcErrorMessage(error));
  return { ok: true, data };
}

/** Edge-function errors arrive as a Response on error.context; read our code from it. */
async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<Result<T>> {
  const supabase = createClient();
  // Explicit bearer, as admin-facility-import-commit's caller does: the
  // functions verify the ADMIN's JWT first, so it must be the user's token.
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return fail(sendErrorMessage("not_authenticated"));
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!error) return { ok: true, data: data as T };
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    let code: string | undefined;
    try {
      code = ((await ctx.clone().json()) as { error?: string }).error;
    } catch {
      code = undefined;
    }
    return fail(sendErrorMessage(code, ctx.status));
  }
  return fail(sendErrorMessage(undefined));
}

export type SendOutcome = { mode: "queued" | "scheduled"; deviceCount: number | null };

/**
 * The whole confirm action. Schedules (freezing content and minting the key),
 * then — for "now" — asks admin-campaign-send to claim it with that key. The
 * server-side key and atomic claim are the real duplicate defence; the
 * caller's disabled button is a courtesy.
 */
export async function confirmSend(id: string, at: string | null): Promise<Result<SendOutcome>> {
  const scheduled = await schedule(id, at);
  if (!scheduled.ok) return scheduled;
  if (at) return { ok: true, data: { mode: "scheduled", deviceCount: null } };

  const sent = await invokeFunction<{ status?: string; recipientDeviceCount?: number }>(
    "admin-campaign-send",
    { campaignId: id, idempotencyKey: scheduled.data },
  );
  if (!sent.ok) return sent;
  return { ok: true, data: { mode: "queued", deviceCount: sent.data.recipientDeviceCount ?? null } };
}

export async function sendTest(id: string): Promise<Result<{ deviceCount: number; accepted: number }>> {
  return invokeFunction("admin-campaign-test-send", { campaignId: id });
}
