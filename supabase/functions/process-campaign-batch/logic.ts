// Pure logic for process-campaign-batch: batching, pacing, and turning Expo's
// answer into per-delivery outcomes. No I/O, so every Expo failure mode can be
// exercised in logic.test.ts without sending anything.

// ─── Budget ─────────────────────────────────────────────────────────────────
//
// Checked against https://docs.expo.dev/push-notifications/sending-notifications/
// on 2026-09-22:
//   - "up to 100 message objects" per request
//   - "600 notifications per second per project"
//   - limit concurrent connections (Expo's own Node SDK opens at most six)
//   - 4096-byte payload (title ≤ 100 + body ≤ 240 chars keeps us far below it)
// and https://supabase.com/docs/guides/functions/limits: 150s wall clock on the
// free plan (400s paid), 2s CPU.
//
// Our numbers sit well inside all of them. Change them here and nowhere else.

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo's documented cap. */
export const EXPO_MESSAGES_PER_REQUEST = 100;
/** Simultaneous requests per round. Expo's SDK uses up to six; we use half. */
export const REQUEST_CONCURRENCY = 3;
/** Self-imposed; half of Expo's published 600/s. */
export const NOTIFICATIONS_PER_SECOND = 300;
/** Per request. A hung connection must not eat the whole run. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** Most deliveries one invocation will claim. */
export const DELIVERIES_PER_INVOCATION = 2_000;
/**
 * Stop claiming new batches after this long. A round in flight still finishes
 * (≤ REQUEST_TIMEOUT_MS), so a run ends well inside the 150s wall clock.
 */
export const TIME_BUDGET_MS = 50_000;
/** Largest batch claimed at once: one request's worth per concurrent slot. */
export const ROUND_SIZE = EXPO_MESSAGES_PER_REQUEST * REQUEST_CONCURRENCY;
/** Cap on how far a rate-limit signal can slow the run. */
export const MAX_WIDEN = 8;

// ─── Types ──────────────────────────────────────────────────────────────────

export type Outcome = {
  id: string;
  outcome: "accepted" | "retry" | "invalid_token" | "failed";
  ticket_id?: string;
  error_code?: string;
  error_message?: string;
};

export type ChunkResult = {
  outcomes: Outcome[];
  /** A rate-limit signal: slow down for the rest of the run. */
  widen: boolean;
  /** A campaign-fatal code (our credentials are broken): stop the campaign. */
  fatal: string | null;
  /** Worth a human's attention, but not fatal. Codes only — never tokens. */
  alerts: string[];
};

export type ExpoResponse =
  | { kind: "network"; message: string }
  | { kind: "http"; status: number; body: unknown };

type Ticket = { status?: string; id?: string; message?: string; details?: { error?: string } };

// ─── Classification ─────────────────────────────────────────────────────────
//
// Failure classes (the plan's table, made concrete):
//
//   network / timeout / 5xx / 429     transient → retry (429 also widens)
//   MessageRateExceeded (ticket)      transient → retry, and widen
//   DeviceNotRegistered (ticket)      permanent → invalid_token (token deleted)
//   MessageTooBig (ticket)            permanent → failed, alert (validation
//                                     should have made it impossible)
//   InvalidCredentials,               permanent AND campaign-fatal: the fault
//   MismatchSenderId (ticket)         is ours; every further request fails too
//   401 / 403 from Expo               campaign-fatal, same reasoning
//   anything else                     permanent → failed, alert. Unknown is
//                                     never assumed transient: retrying a
//                                     mystery burns budget and risks repeats.

const TRANSIENT_TICKET = new Set(["MessageRateExceeded"]);
const FATAL_TICKET = new Set(["InvalidCredentials", "MismatchSenderId"]);

/** Expo error text only, capped. Never headers, never the request. */
function sanitize(text: unknown): string | undefined {
  if (typeof text !== "string" || !text) return undefined;
  return text.slice(0, 500);
}

export function classify(ids: string[], res: ExpoResponse): ChunkResult {
  const all = (o: Omit<Outcome, "id">): Outcome[] => ids.map((id) => ({ id, ...o }));

  if (res.kind === "network") {
    return {
      outcomes: all({ outcome: "retry", error_code: "network", error_message: sanitize(res.message) }),
      widen: false, fatal: null, alerts: [],
    };
  }

  const { status, body } = res;

  if (status === 429) {
    return { outcomes: all({ outcome: "retry", error_code: "http_429" }), widen: true, fatal: null, alerts: [] };
  }
  if (status >= 500) {
    return { outcomes: all({ outcome: "retry", error_code: `http_${status}` }), widen: false, fatal: null, alerts: [] };
  }
  if (status === 401 || status === 403) {
    return {
      outcomes: all({ outcome: "failed", error_code: "expo_unauthorized" }),
      widen: false, fatal: "expo_unauthorized", alerts: [`expo_unauthorized (HTTP ${status})`],
    };
  }
  if (status !== 200) {
    // A request-level rejection, e.g. { errors: [{ code: "PUSH_TOO_MANY_NOTIFICATIONS" }] }.
    const errors = (body as { errors?: { code?: string; message?: string }[] } | null)?.errors;
    const code = errors?.[0]?.code ?? `http_${status}`;
    return {
      outcomes: all({ outcome: "failed", error_code: code, error_message: sanitize(errors?.[0]?.message) }),
      widen: false, fatal: null, alerts: [`request rejected: ${code}`],
    };
  }

  const tickets = (body as { data?: Ticket[] } | null)?.data;
  if (!Array.isArray(tickets)) {
    return {
      outcomes: all({ outcome: "failed", error_code: "bad_response" }),
      widen: false, fatal: null, alerts: ["200 without a data array"],
    };
  }

  let widen = false;
  let fatal: string | null = null;
  const alerts: string[] = [];

  // Expo guarantees ticket order matches message order; that correspondence is
  // the only thing tying a ticket to a delivery.
  const outcomes = ids.map((id, i): Outcome => {
    const t = tickets[i];
    if (!t) {
      // Not retried: Expo may have taken it. A missing push beats a duplicate.
      alerts.push("fewer tickets than messages");
      return { id, outcome: "failed", error_code: "no_ticket" };
    }
    if (t.status === "ok" && typeof t.id === "string") {
      return { id, outcome: "accepted", ticket_id: t.id };
    }

    const code = t.details?.error ?? "unknown";
    const error_message = sanitize(t.message);

    if (code === "DeviceNotRegistered") return { id, outcome: "invalid_token", error_code: code, error_message };
    if (TRANSIENT_TICKET.has(code)) {
      widen = true;
      return { id, outcome: "retry", error_code: code, error_message };
    }
    if (FATAL_TICKET.has(code)) {
      fatal = code;
      alerts.push(code);
      return { id, outcome: "failed", error_code: code, error_message };
    }
    alerts.push(code);
    return { id, outcome: "failed", error_code: code, error_message };
  });

  return { outcomes, widen, fatal, alerts: [...new Set(alerts)] };
}

// ─── Batching and pacing ────────────────────────────────────────────────────

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * The shortest a round may take so that `sent` notifications stay within
 * NOTIFICATIONS_PER_SECOND, stretched by the current widen factor. The caller
 * sleeps for whatever is left after the round's own duration.
 */
export function minRoundMs(sent: number, widen: number): number {
  return Math.ceil((sent / NOTIFICATIONS_PER_SECOND) * 1000 * widen);
}

export function nextWiden(current: number, signalled: boolean): number {
  return signalled ? Math.min(current * 2, MAX_WIDEN) : current;
}
