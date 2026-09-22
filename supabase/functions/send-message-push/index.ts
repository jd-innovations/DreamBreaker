import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkDispatch } from "../_shared/dispatch-gate.ts";

// Relay to Expo's push API, plus the bookkeeping that makes dead tokens
// findable (TODO1.1 5.1).
//
// ── What a caller may send (Phase 0b, PUSH_BROADCAST_IMPLEMENTATION_PLAN.md) ──
//
//   { kind: "message",    messageId }   a DM — notify_new_message
//   { kind: "price_drop", listingId }   a marketplace price drop — fn_notify_price_drop
//   { kind: "automation",  notificationId } any catalogued automatic notification —
//                                       fn_dispatch_automation_push (20260922191000)
//
// The function looks the recipients up itself (resolve_*_push_recipients,
// 20260921200000), so a caller names WHICH notification, never WHO gets it or
// WHAT it says. Even with the dispatch secret, the most anyone can do is
// re-send a real notification from the last ten minutes to its real
// recipients.
//
// The old { tokens, title, body } shape is accepted only while
// ACCEPT_LEGACY_TOKENS is true — the window between this deploy and both
// triggers switching over. After that it is refused outright.
//
// ── Why the response matters ────────────────────────────────────────────────
//
// Expo returns one ticket per message, in the same order as the messages sent.
// A ticket is either { status: "ok", id } or { status: "error", details }. That
// is the only channel through which a sender learns a token is dead, and dead
// tokens are not free: Expo rate-limits and eventually penalises senders whose
// traffic is mostly DeviceNotRegistered, so leaving them in place degrades
// delivery for the users who are still reachable.
//
// Two separate signals, handled differently and deliberately not conflated:
//
//   DeviceNotRegistered in the TICKET   the token is already known bad — delete
//                                       it now, no receipt will ever come.
//   status "ok"                         provisional. Expo has accepted the
//                                       message but has not heard from APNs or
//                                       FCM yet. Record the ticket id so
//                                       push-receipt-sweeper can ask later.
//
// Handling only the first is the common mistake and cleans almost nothing:
// DeviceNotRegistered usually surfaces in the receipt, not the ticket.
//
// ── Failure posture ─────────────────────────────────────────────────────────
//
// The bookkeeping never fails the send. A push that was delivered but not
// recorded costs one uncleaned token; a send rejected because the database was
// briefly unavailable costs a user their notification. The push is the product.
//
// ── Who may call ────────────────────────────────────────────────────────────
//
// Only the database: notify_new_message and fn_notify_price_drop. Both send an
// x-dispatch-secret header read from Vault; checkDispatch() verifies it. Until
// that shipped, anyone holding the public anon key could push any text to any
// token through this function. See _shared/dispatch-gate.ts.

/**
 * Transition switch, now OFF (2026-09-22). Both triggers send `kind` payloads
 * since 20260921200100; real DMs were delivered through the new path, and no
 * legacy payload was logged after the switch. A token list is refused with
 * `tokens_not_accepted`. Do not turn this back on except as a rollback
 * alongside restoring the 20260921180000 trigger bodies.
 */
const ACCEPT_LEGACY_TOKENS = false;

type PushRequest =
  | { kind: "message"; messageId: string }
  | { kind: "price_drop"; listingId: string }
  | { kind: "automation"; notificationId: string; test?: boolean }
  | { kind?: undefined; tokens: string[]; title: string; body: string; data?: Record<string, unknown> };

type Resolved = { tokens: string[]; title: string | null; body: string | null; data: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Errors meaning "this token will never work again". Anything else is transient. */
const DEAD_TOKEN_ERRORS = new Set(["DeviceNotRegistered"]);

/**
 * Turns a request into recipients + content. A Response means stop: bad
 * request, refused shape, or lookup failure. Nothing found (message too old,
 * listing no longer active, nobody opted in) resolves to zero tokens, which the
 * caller reports as `skipped` — the same answer the old path gave.
 */
async function resolvePayload(payload: PushRequest): Promise<Resolved | Response> {
  if (payload && (payload.kind === "message" || payload.kind === "price_drop" || payload.kind === "automation")) {
    const id = payload.kind === "message"
      ? payload.messageId
      : payload.kind === "price_drop"
      ? payload.listingId
      : payload.notificationId;
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      return new Response("Invalid id", { status: 400 });
    }

    const supabase = serviceClient();
    if (!supabase) {
      console.error("[send-message-push] service role env missing; cannot resolve recipients");
      return new Response("Server misconfigured", { status: 500 });
    }

    // Each kind names its own resolver. The resolver — not this function —
    // decides who gets it and what it says, and re-checks every catalog rule
    // (enabled, user preference, throttle, quiet hours, caps) for automations.
    const { data, error } = payload.kind === "message"
      ? await supabase.rpc("resolve_message_push_recipients", { p_message_id: id })
      : payload.kind === "price_drop"
      ? await supabase.rpc("resolve_price_drop_push_recipients", { p_listing_id: id })
      : await supabase.rpc("resolve_automation_push_recipients", {
        p_notification_id: id,
        // Only admin_test_automation sets this, and only for its own caller's
        // devices: it skips the enabled/preference/cap gate so a push can be
        // previewed on a real phone before the automation is switched on.
        p_test: payload.kind === "automation" && payload.test === true,
      });

    if (error) {
      console.error(`[send-message-push] resolve ${payload.kind} failed: ${error.message}`);
      return new Response("Lookup failed", { status: 502 });
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { tokens: [], title: null, body: null, data: {} };
    return {
      tokens: Array.isArray(row.tokens) ? row.tokens : [],
      title: row.title ?? null,
      body: row.body ?? null,
      data: (row.data && typeof row.data === "object") ? row.data : {},
    };
  }

  if (payload && Array.isArray((payload as { tokens?: unknown }).tokens)) {
    if (!ACCEPT_LEGACY_TOKENS) {
      console.warn("[send-message-push] refused a token-list payload");
      return new Response(JSON.stringify({ error: "tokens_not_accepted" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Logged so the switch-off can be timed from evidence, not hope.
    console.log("[send-message-push] legacy token payload");
    const legacy = payload as { tokens: string[]; title: string; body: string; data?: Record<string, unknown> };
    return { tokens: legacy.tokens, title: legacy.title ?? null, body: legacy.body ?? null, data: legacy.data ?? {} };
  }

  return new Response("Unrecognised payload", { status: 400 });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Before the body is even parsed: an unauthorised caller learns nothing
  // about what shape of request would have been accepted.
  const refused = await checkDispatch(req, serviceClient(), "send-message-push");
  if (refused) return refused;

  let payload: PushRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const resolved = await resolvePayload(payload);
  if (resolved instanceof Response) return resolved;

  const tokens = resolved.tokens.filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken"));

  if (tokens.length === 0 || !resolved.title || !resolved.body) {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = tokens.map((to) => ({
    to,
    title: resolved.title,
    body: resolved.body,
    data: resolved.data,
    sound: "default",
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });

  const result = await res.text();
  if (!res.ok) {
    console.error(`[expo push failed] ${res.status} ${result}`);
    return new Response(result, { status: 502 });
  }

  // Everything below is bookkeeping. It is wrapped whole: the send already
  // succeeded, and nothing here is worth turning that into a 502.
  try {
    const parsed = JSON.parse(result) as { data?: ExpoTicket[] };
    const tickets = Array.isArray(parsed.data) ? parsed.data : [];

    // Expo guarantees ticket order matches message order. That correspondence
    // is the only thing tying a ticket back to its token — the ticket itself
    // does not name one.
    const dead: string[] = [];
    const pending: { ticket_id: string; expo_push_token: string }[] = [];

    tickets.forEach((ticket, i) => {
      const token = tokens[i];
      if (!token) return;

      if (ticket.status === "error") {
        const code = ticket.details?.error ?? "unknown";
        if (DEAD_TOKEN_ERRORS.has(code)) {
          dead.push(token);
        } else {
          // Rate limiting and credential problems are the sender's fault, not
          // the device's. Logged rather than acted on — deleting a token over a
          // transient error would silently unsubscribe a real user.
          console.error(`[expo push ticket error] ${code}: ${ticket.message ?? ""}`);
        }
        return;
      }

      if (ticket.status === "ok" && ticket.id) {
        pending.push({ ticket_id: ticket.id, expo_push_token: token });
      }
    });

    if (dead.length > 0 || pending.length > 0) {
      const supabase = serviceClient();
      if (!supabase) {
        console.error("[push bookkeeping] service role env missing; skipped");
      } else {
        if (dead.length > 0) {
          const { error } = await supabase
            .from("push_tokens")
            .delete()
            .in("expo_push_token", dead);
          if (error) console.error("[push bookkeeping] token delete failed", error.message);
          else console.log(`[push bookkeeping] removed ${dead.length} dead token(s)`);
        }

        if (pending.length > 0) {
          // upsert, not insert: a retried delivery can produce the same ticket
          // id twice, and a duplicate-key error here would lose the whole batch.
          const { error } = await supabase
            .from("push_tickets")
            .upsert(pending, { onConflict: "ticket_id" });
          if (error) console.error("[push bookkeeping] ticket insert failed", error.message);
        }
      }
    }
  } catch (err) {
    console.error("[push bookkeeping] unexpected failure", err);
  }

  return new Response(result, { headers: { "Content-Type": "application/json" } });
});
