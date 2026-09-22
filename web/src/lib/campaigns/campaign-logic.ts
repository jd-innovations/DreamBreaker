// Pure rules for the admin push-campaign screens — Phase 5 of
// PUSH_BROADCAST_IMPLEMENTATION_PLAN.md. No I/O here, so every rule the UI
// enforces is unit-tested (src/lib/__tests__/campaign-logic.test.ts).
//
// The database re-checks everything on write (admin_upsert_campaign and
// campaign_destination_type). These checks exist so the admin sees a problem
// before saving, not instead of the server.

import {
  BROADCAST_DESTINATION_TYPES,
  validateBroadcastDestination,
  type DeepLinkType,
} from "@shared/deep-link";

// ─── Content limits (mirror admin_upsert_campaign) ──────────────────────────

export const NAME_MAX = 120;
export const TITLE_MAX = 100;
/** Past this, iOS and Android start truncating the title on the lock screen. */
export const TITLE_WARN = 50;
export const BODY_MAX = 240;
/** Past this, the collapsed notification shows only part of the message. */
export const BODY_WARN = 150;

export type LengthState = "empty" | "ok" | "warn" | "over";

export function lengthState(text: string, warn: number | null, max: number): LengthState {
  const n = text.trim().length;
  if (n === 0) return "empty";
  if (n > max) return "over";
  if (warn !== null && n > warn) return "warn";
  return "ok";
}

// ─── Destinations ───────────────────────────────────────────────────────────
//
// Built as pickleballapp://<root>/<id> — the form the 2026-09-22 end-to-end
// test proved routes on installed builds.

const ROOT_FOR_TYPE: Readonly<Partial<Record<DeepLinkType, string>>> = {
  tournament: "tournament",
  community: "community",
  marketplace: "marketplace",
  group: "groups",
  coach_offer: "coach/offers",
};

export const DESTINATION_LABEL: Readonly<Partial<Record<DeepLinkType, string>>> = {
  tournament: "Tournament",
  community: "Community event",
  marketplace: "Marketplace listing",
  group: "Group",
  coach_offer: "Coach offer",
};

export const DESTINATION_OPTIONS: readonly DeepLinkType[] = BROADCAST_DESTINATION_TYPES;

export type DestinationCheck =
  | { ok: true; url: string; type: DeepLinkType; id: string }
  | { ok: false; message: string };

/**
 * Turns the composer's (type, id) into a stored URL. The id field also accepts
 * a pasted link — if it is a valid broadcast destination, its own type wins.
 */
export function buildDestination(type: DeepLinkType | "", rawId: string): DestinationCheck {
  const id = rawId.trim();
  if (id.includes("/") || id.includes(":")) {
    const pasted = validateBroadcastDestination(id);
    if (pasted.ok) return { ok: true, url: pasted.url, type: pasted.type, id: pasted.id };
    return { ok: false, message: "That link can't be used. Paste a tournament, community event, listing, group or coach offer link, or just its id." };
  }
  if (!type) return { ok: false, message: "Choose where the notification opens." };
  if (!id) return { ok: false, message: "Enter the id of the item to open." };
  const root = ROOT_FOR_TYPE[type];
  if (!root) return { ok: false, message: "That destination can't be broadcast." };
  const url = `pickleballapp://${root}/${id}`;
  const checked = validateBroadcastDestination(url);
  if (!checked.ok) {
    return { ok: false, message: "Ids contain only letters, numbers and dashes (up to 64)." };
  }
  return { ok: true, url, type: checked.type, id: checked.id };
}

/** Splits a stored destination back into (type, id) for editing a draft. */
export function parseDestination(url: string): { type: DeepLinkType | ""; id: string } {
  const r = validateBroadcastDestination(url);
  return r.ok ? { type: r.type, id: r.id } : { type: "", id: "" };
}

// ─── Audience ───────────────────────────────────────────────────────────────

export type AudienceChoice = "all" | "ios" | "android";

export function audienceParams(choice: AudienceChoice): {
  p_audience_type: "all" | "platform";
  p_audience_platform: "ios" | "android" | null;
} {
  return choice === "all"
    ? { p_audience_type: "all", p_audience_platform: null }
    : { p_audience_type: "platform", p_audience_platform: choice };
}

export function audienceLabel(type: string, platform: string | null): string {
  if (type === "all") return "All eligible users";
  if (platform === "ios") return "iOS devices";
  if (platform === "android") return "Android devices";
  return "Unknown audience";
}

// ─── Status ─────────────────────────────────────────────────────────────────

export const CAMPAIGN_STATUSES = [
  "draft", "scheduled", "queuing", "sending", "aborting", "aborted",
  "sent", "partially_failed", "failed", "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  queuing: "Queuing",
  sending: "Sending",
  aborting: "Aborting",
  aborted: "Aborted",
  sent: "Sent",
  partially_failed: "Partly failed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * Visual weight, expressed only through design-token roles (there is no
 * success/warning token): active work is primary, trouble is destructive,
 * finished-well is accent, everything inert is muted.
 */
export type StatusTone = "active" | "good" | "bad" | "neutral";

export function statusTone(status: string): StatusTone {
  switch (status) {
    case "queuing":
    case "sending":
    case "aborting":
    case "scheduled":
      return "active";
    case "sent":
      return "good";
    case "failed":
    case "partially_failed":
    case "aborted":
      return "bad";
    default:
      return "neutral";
  }
}

/** Statuses the detail page polls in. */
export function isLive(status: string): boolean {
  return status === "queuing" || status === "sending" || status === "aborting";
}

export const canEdit = (s: string) => s === "draft";
export const canCancel = (s: string) => s === "draft" || s === "scheduled";
export const canAbort = (s: string) => s === "queuing" || s === "sending";

// ─── Typed SEND (decision 14) ───────────────────────────────────────────────

export const SEND_CONFIRM_KEY = "push_broadcast_send_confirm_threshold";
export const SEND_WORD = "SEND";

/**
 * platform_settings stores text. Anything missing, non-numeric or below 1
 * becomes 1 — every send then asks for SEND. Failing safe beats a typo that
 * silently removes the guard.
 */
export function parseThreshold(value: string | null | undefined): number {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function requiresTypedSend(deviceCount: number, threshold: number): boolean {
  return deviceCount >= threshold;
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

/** "America/Chicago (UTC−05:00)" — named, never implied. */
export function timezoneLabel(date = new Date(), tz = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "−";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${tz} (UTC${sign}${hh}:${mm})`;
}

/**
 * A <input type="datetime-local"> value is wall-clock time in the browser's
 * zone; new Date() reads it the same way. Returns an ISO instant, or an error.
 */
export function scheduleInstant(local: string, now = new Date()): { ok: true; iso: string } | { ok: false; message: string } {
  if (!local) return { ok: false, message: "Choose a date and time." };
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return { ok: false, message: "That date isn't valid." };
  if (d.getTime() < now.getTime() + 60_000) return { ok: false, message: "Choose a time at least a minute from now." };
  if (d.getTime() > now.getTime() + 90 * 24 * 3600_000) return { ok: false, message: "Schedule no more than 90 days ahead." };
  return { ok: true, iso: d.toISOString() };
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/**
 * The campaign RPCs raise a machine code as the message and a readable hint
 * (20260921200000_campaign_api.sql). Prefer the hint; map the codes that have
 * none; never show raw SQL text for an authorization failure.
 */
export function rpcErrorMessage(err: { message?: string; hint?: string | null } | null | undefined): string {
  if (!err) return "Something went wrong.";
  if (err.hint) return err.hint;
  const m = err.message ?? "";
  if (m.includes("not authorized")) return "Admins only.";
  if (m.includes("rate_limited")) return "Too many requests — wait a minute and try again.";
  return m || "Something went wrong.";
}

/** admin-campaign-send / admin-campaign-test-send error codes → operator text. */
export function sendErrorMessage(code: string | undefined, status?: number): string {
  switch (code) {
    case "broadcast_disabled":
      return "Push broadcasts are switched off (Settings → Push broadcasts). The campaign is scheduled and will go out as soon as they are switched on — cancel it if that's not what you want.";
    case "not_due":
      return "This campaign is scheduled for later. It will send on its own at that time.";
    case "key_mismatch":
      return "This send request is out of date. Reload the page and try again.";
    case "not_sendable":
      return "This campaign can no longer be sent.";
    case "campaign_not_found":
      return "Campaign not found.";
    case "admin_only":
      return "Admins only.";
    case "not_authenticated":
      return "Your session expired. Sign in again.";
    case "rate_limited":
      return "Too many test sends — wait a minute and try again.";
    case "no_devices":
      return "You have no registered devices. Sign in to the app on a phone with notifications allowed, then try again.";
    case "expo_unavailable":
      return "Expo's push service didn't answer. Try again shortly.";
    default:
      return status ? `Request failed (${status}).` : "Request failed.";
  }
}

// ─── Reporting ──────────────────────────────────────────────────────────────

export type TapMetric =
  | { kind: "rate"; taps: number; denominator: number; pct: number; excluded: number }
  | { kind: "none"; excluded: number };

/**
 * Decision 8: only deliveries to builds that can report a tap are in the
 * denominator. Accepted deliveries to older builds are excluded from BOTH
 * sides and reported separately, so the rate never counts a tap that could
 * not have been recorded as a miss.
 */
export function tapMetric(taps: number, tapCapableAccepted: number, accepted: number): TapMetric {
  const excluded = Math.max(accepted - tapCapableAccepted, 0);
  if (tapCapableAccepted <= 0) return { kind: "none", excluded };
  return {
    kind: "rate",
    taps,
    denominator: tapCapableAccepted,
    pct: Math.round((taps / tapCapableAccepted) * 1000) / 10,
    excluded,
  };
}

export type ErrorGroup = { code: string; count: number; source: "receipt" | "send" };

/**
 * Failed and dead-token deliveries grouped by cause, largest first. A row with
 * a receipt was failed by Expo's receipt; otherwise by the send itself.
 */
export function groupDeliveryErrors(
  rows: { status: string; error_code: string | null; reconciled_at: string | null }[],
): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>();
  for (const r of rows) {
    if (r.status !== "failed" && r.status !== "invalid_token") continue;
    const source = r.reconciled_at ? "receipt" : "send";
    const code = r.error_code ?? (r.status === "invalid_token" ? "DeviceNotRegistered" : "unknown");
    const key = `${source}:${code}`;
    const g = map.get(key) ?? { code, count: 0, source };
    g.count += 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Plain-language names for the codes an operator will actually see. */
export const ERROR_CODE_LABEL: Readonly<Record<string, string>> = {
  DeviceNotRegistered: "App uninstalled or notifications revoked",
  MessageTooBig: "Payload too large",
  MessageRateExceeded: "Rate limited by Expo",
  InvalidCredentials: "Push credentials invalid",
  MismatchSenderId: "Push credentials mismatched",
  interrupted: "Worker stopped mid-send (not retried)",
  max_attempts: "Gave up after retries",
  no_ticket: "Expo returned no ticket",
  network: "Network error reaching Expo",
  http_429: "Expo rate limit (HTTP 429)",
  expo_unauthorized: "Expo rejected our credentials",
  bad_response: "Unreadable response from Expo",
};

export const AUDIT_ACTION_LABEL: Readonly<Record<string, string>> = {
  created: "Draft created",
  updated: "Draft edited",
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  send_claimed: "Queued for sending",
  abort_requested: "Abort requested",
  aborted: "Aborted",
  failed: "Failed",
  completed: "Finished",
  test_sent: "Test sent",
  deliveries_pruned: "Delivery detail pruned",
};
