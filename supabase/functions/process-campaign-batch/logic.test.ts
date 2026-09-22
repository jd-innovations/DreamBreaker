// Run: npx -y deno@2.9.6 test supabase/functions/process-campaign-batch/logic.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  chunk,
  classify,
  DELIVERIES_PER_INVOCATION,
  EXPO_MESSAGES_PER_REQUEST,
  MAX_WIDEN,
  minRoundMs,
  nextWiden,
  NOTIFICATIONS_PER_SECOND,
  REQUEST_CONCURRENCY,
  ROUND_SIZE,
} from "./logic.ts";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`);

// ─── Budget sanity: our numbers sit inside Expo's published limits ──────────

Deno.test("budget stays inside Expo's published limits", () => {
  assert(EXPO_MESSAGES_PER_REQUEST <= 100, "Expo caps a request at 100 messages");
  assert(NOTIFICATIONS_PER_SECOND <= 600, "Expo's published limit is 600/s per project");
  assert(REQUEST_CONCURRENCY <= 6, "Expo's own SDK opens at most six connections");
  assertEquals(ROUND_SIZE, EXPO_MESSAGES_PER_REQUEST * REQUEST_CONCURRENCY);
});

// ─── Batching ───────────────────────────────────────────────────────────────

Deno.test("250 deliveries make 3 requests, none over the cap", () => {
  const requests = chunk(ids(250), EXPO_MESSAGES_PER_REQUEST);
  assertEquals(requests.length, 3);
  assertEquals(requests.map((r) => r.length), [100, 100, 50]);
  assertEquals(requests.flat(), ids(250), "no delivery lost or repeated");
});

Deno.test("a round never needs more requests than the concurrency allows", () => {
  assertEquals(chunk(ids(ROUND_SIZE), EXPO_MESSAGES_PER_REQUEST).length, REQUEST_CONCURRENCY);
});

// ─── Rate budget ────────────────────────────────────────────────────────────

Deno.test("a 5,000-delivery run stays under NOTIFICATIONS_PER_SECOND", () => {
  // Worst case for the budget: Expo answers instantly, so pacing is the only
  // brake. Rounds of ROUND_SIZE, each held to minRoundMs.
  let remaining = 5_000;
  let elapsedMs = 0;
  while (remaining > 0) {
    const sent = Math.min(ROUND_SIZE, remaining);
    elapsedMs += minRoundMs(sent, 1);
    remaining -= sent;
  }
  const rate = 5_000 / (elapsedMs / 1000);
  assert(rate <= NOTIFICATIONS_PER_SECOND, `rate ${rate.toFixed(1)}/s exceeds budget`);
});

Deno.test("one run's claim cap still finishes inside the time budget at full pace", () => {
  // DELIVERIES_PER_INVOCATION at NOTIFICATIONS_PER_SECOND must fit well inside
  // TIME_BUDGET_MS (50s) — otherwise the budget, not the cap, would bind.
  const seconds = DELIVERIES_PER_INVOCATION / NOTIFICATIONS_PER_SECOND;
  assert(seconds < 50, `${seconds}s of pacing alone`);
});

Deno.test("a rate-limit signal widens the pace, doubling, capped", () => {
  let w = 1;
  const seen: number[] = [];
  for (let i = 0; i < 6; i++) {
    w = nextWiden(w, true);
    seen.push(w);
  }
  assertEquals(seen, [2, 4, 8, MAX_WIDEN, MAX_WIDEN, MAX_WIDEN]);
  assertEquals(nextWiden(4, false), 4, "no signal, no change");
  assert(minRoundMs(300, 2) === 2 * minRoundMs(300, 1));
});

// ─── Classification ─────────────────────────────────────────────────────────

Deno.test("network failure → every message retried", () => {
  const r = classify(ids(3), { kind: "network", message: "TimeoutError" });
  assertEquals(r.outcomes.map((o) => o.outcome), ["retry", "retry", "retry"]);
  assertEquals(r.outcomes[0].error_code, "network");
  assertEquals(r.fatal, null);
});

Deno.test("HTTP 429 → retry and widen", () => {
  const r = classify(ids(2), { kind: "http", status: 429, body: null });
  assertEquals(r.outcomes.map((o) => o.outcome), ["retry", "retry"]);
  assert(r.widen);
});

Deno.test("HTTP 5xx → retry, no widen", () => {
  const r = classify(ids(2), { kind: "http", status: 503, body: null });
  assertEquals(r.outcomes.map((o) => o.error_code), ["http_503", "http_503"]);
  assert(!r.widen);
});

Deno.test("HTTP 401/403 → campaign-fatal", () => {
  for (const status of [401, 403]) {
    const r = classify(ids(2), { kind: "http", status, body: null });
    assertEquals(r.fatal, "expo_unauthorized");
    assertEquals(r.outcomes.map((o) => o.outcome), ["failed", "failed"]);
  }
});

Deno.test("request-level 400 → failed with Expo's code, not retried", () => {
  const r = classify(ids(2), {
    kind: "http", status: 400,
    body: { errors: [{ code: "PUSH_TOO_MANY_NOTIFICATIONS", message: "too many" }] },
  });
  assertEquals(r.outcomes.map((o) => o.outcome), ["failed", "failed"]);
  assertEquals(r.outcomes[0].error_code, "PUSH_TOO_MANY_NOTIFICATIONS");
  assertEquals(r.fatal, null);
});

Deno.test("mixed tickets map one-to-one, in order", () => {
  const r = classify(ids(6), {
    kind: "http", status: 200,
    body: {
      data: [
        { status: "ok", id: "t0" },
        { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "slow down", details: { error: "MessageRateExceeded" } },
        { status: "error", message: "big", details: { error: "MessageTooBig" } },
        { status: "error", message: "???", details: { error: "SomethingNew" } },
        { status: "error", message: "no code" },
      ],
    },
  });
  assertEquals(r.outcomes, [
    { id: "d0", outcome: "accepted", ticket_id: "t0" },
    { id: "d1", outcome: "invalid_token", error_code: "DeviceNotRegistered", error_message: "gone" },
    { id: "d2", outcome: "retry", error_code: "MessageRateExceeded", error_message: "slow down" },
    { id: "d3", outcome: "failed", error_code: "MessageTooBig", error_message: "big" },
    { id: "d4", outcome: "failed", error_code: "SomethingNew", error_message: "???" },
    { id: "d5", outcome: "failed", error_code: "unknown", error_message: "no code" },
  ]);
  assert(r.widen, "MessageRateExceeded widens");
  assertEquals(r.fatal, null);
  assertEquals(r.alerts.sort(), ["MessageTooBig", "SomethingNew", "unknown"]);
});

Deno.test("InvalidCredentials and MismatchSenderId are campaign-fatal and not retried", () => {
  for (const code of ["InvalidCredentials", "MismatchSenderId"]) {
    const r = classify(ids(2), {
      kind: "http", status: 200,
      body: { data: [{ status: "ok", id: "t0" }, { status: "error", details: { error: code } }] },
    });
    assertEquals(r.fatal, code);
    assertEquals(r.outcomes[1].outcome, "failed");
    assertEquals(r.outcomes[0].outcome, "accepted", "the accepted one still counts");
  }
});

Deno.test("fewer tickets than messages → the missing ones fail, never retry (no duplicate sends)", () => {
  const r = classify(ids(3), { kind: "http", status: 200, body: { data: [{ status: "ok", id: "t0" }] } });
  assertEquals(r.outcomes.map((o) => o.outcome), ["accepted", "failed", "failed"]);
  assertEquals(r.outcomes[1].error_code, "no_ticket");
});

Deno.test("200 without a data array → failed, alerted", () => {
  const r = classify(ids(1), { kind: "http", status: 200, body: { nope: true } });
  assertEquals(r.outcomes[0].error_code, "bad_response");
  assertEquals(r.alerts.length, 1);
});

Deno.test("error text is capped and outcomes never carry a token", () => {
  const r = classify(["d0"], {
    kind: "http", status: 200,
    body: { data: [{ status: "error", message: "x".repeat(2000), details: { error: "MessageTooBig" } }] },
  });
  assertEquals(r.outcomes[0].error_message!.length, 500);
  assert(!JSON.stringify(r).includes("ExponentPushToken"));
});
