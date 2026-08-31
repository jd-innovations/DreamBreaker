import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Relay to Expo's push API, plus the bookkeeping that makes dead tokens
// findable (TODO1.1 5.1).
//
// Recipient and mute resolution still happen in Postgres (notify_new_message,
// 20260708010000) — this function only forwards an already-resolved token list.
// What changed is that it no longer throws Expo's answer away.
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

interface PushRequest {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Errors meaning "this token will never work again". Anything else is transient. */
const DEAD_TOKEN_ERRORS = new Set(["DeviceNotRegistered"]);

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

  let payload: PushRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const tokens = Array.isArray(payload.tokens)
    ? payload.tokens.filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken"))
    : [];

  if (tokens.length === 0 || !payload.title || !payload.body) {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
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
