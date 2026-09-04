import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Fetches Expo push receipts and deletes the tokens that are dead (TODO1.1 5.1).
//
// send-message-push records a ticket id for every accepted message. A ticket
// only means Expo took the message — it says nothing about whether APNs or FCM
// accepted it. The receipt, available a few seconds to a few minutes later, is
// the authoritative answer, and it is where DeviceNotRegistered almost always
// appears. Polling it is the only way to learn that an app was uninstalled.
//
// Scheduled every 15 minutes (see the accompanying migration). Expo keeps
// receipts for 24 hours, so a ticket older than that will never resolve and is
// pruned rather than retried forever.
//
// ── What gets deleted, and what deliberately does not ───────────────────────
//
// Only DeviceNotRegistered removes a token. The other receipt errors are the
// sender's problem, not the device's:
//
//   MessageTooBig          our payload — fix the caller, keep the token
//   MessageRateExceeded    back off — keep the token
//   InvalidCredentials     our Expo project — keep every token
//
// Deleting on any of those would silently unsubscribe real, reachable users at
// exactly the moment something else is already going wrong.

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** Expo's documented cap for a single getReceipts call. */
const RECEIPT_BATCH = 1000;

/**
 * How long to let a ticket settle before asking about it. Expo returns null for
 * a receipt that does not exist yet, which is indistinguishable from "unknown
 * ticket" — so asking too early burns the row's one look and learns nothing.
 */
const SETTLE_MINUTES = 5;

interface ExpoReceipt {
  status?: string;
  message?: string;
  details?: { error?: string };
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("[push-receipt-sweeper] service role env missing");
    return new Response(JSON.stringify({ error: "missing_env" }), { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const settledBefore = new Date(Date.now() - SETTLE_MINUTES * 60_000).toISOString();

  const { data: tickets, error: selectError } = await supabase
    .from("push_tickets")
    .select("ticket_id, expo_push_token")
    .is("checked_at", null)
    .lt("created_at", settledBefore)
    .order("created_at", { ascending: true })
    .limit(RECEIPT_BATCH);

  if (selectError) {
    console.error("[push-receipt-sweeper] select failed", selectError.message);
    return new Response(JSON.stringify({ error: selectError.message }), { status: 500 });
  }

  let checked = 0;
  let removed = 0;

  if (tickets && tickets.length > 0) {
    const byTicket = new Map(tickets.map((t) => [t.ticket_id as string, t.expo_push_token as string]));

    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({ ids: [...byTicket.keys()] }),
    });

    if (!res.ok) {
      // Leave checked_at null so the batch is retried on the next run rather
      // than being marked as resolved by a request that never answered.
      const body = await res.text();
      console.error(`[push-receipt-sweeper] getReceipts ${res.status} ${body}`);
      return new Response(JSON.stringify({ error: "expo_unavailable" }), { status: 502 });
    }

    const parsed = (await res.json()) as { data?: Record<string, ExpoReceipt> };
    const receipts = parsed.data ?? {};
    const now = new Date().toISOString();

    const deadTokens = new Set<string>();
    const updates: { ticket_id: string; expo_push_token: string; checked_at: string; status: string; error_code: string | null }[] = [];

    for (const [ticketId, receipt] of Object.entries(receipts)) {
      const token = byTicket.get(ticketId);
      if (!token) continue;

      const code = receipt.details?.error ?? null;
      if (receipt.status === "error" && code === "DeviceNotRegistered") {
        deadTokens.add(token);
      } else if (receipt.status === "error") {
        // Kept visible rather than swallowed — see the header for why none of
        // these justify deleting a token.
        console.error(`[push-receipt-sweeper] receipt error ${code}: ${receipt.message ?? ""}`);
      }

      updates.push({
        ticket_id: ticketId,
        expo_push_token: token,
        checked_at: now,
        status: receipt.status ?? "unknown",
        error_code: code,
      });
    }

    if (updates.length > 0) {
      const { error } = await supabase
        .from("push_tickets")
        .upsert(updates, { onConflict: "ticket_id" });
      if (error) console.error("[push-receipt-sweeper] mark checked failed", error.message);
      else checked = updates.length;
    }

    if (deadTokens.size > 0) {
      const { error } = await supabase
        .from("push_tokens")
        .delete()
        .in("expo_push_token", [...deadTokens]);
      if (error) console.error("[push-receipt-sweeper] token delete failed", error.message);
      else removed = deadTokens.size;
    }
  }

  // Tickets past Expo's retention will never resolve; drop them so the table
  // does not accumulate one row per push per device forever.
  const { data: pruned, error: pruneError } = await supabase.rpc("prune_push_tickets");
  if (pruneError) console.error("[push-receipt-sweeper] prune failed", pruneError.message);

  const summary = { checked, removed, pruned: pruned ?? 0 };
  console.log(`[push-receipt-sweeper] ${JSON.stringify(summary)}`);

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
