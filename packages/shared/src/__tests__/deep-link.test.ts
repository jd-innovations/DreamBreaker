import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROADCAST_DESTINATION_PATTERN,
  DEEP_LINK_ROOTS,
  resolveDeepLink,
  validateBroadcastDestination,
} from "../deep-link";

// ─── Oracle: the resolver as it was before the move ─────────────────────────
//
// Frozen copy of apps/mobile/src/lib/externalRouting.ts's resolveExternalUrl
// (commit 168bd4a), minus expo-router and with appRoutes reduced to type + id.
// resolveDeepLink must agree with it on every input: this refactor moved a
// live routing path and promised to change nothing.

function legacyResolve(rawUrl: string): { type: string; id: string; requiresAuth: boolean } | null {
  const APP_LINK_DOMAIN = "pickleballapp.app";
  const safeDecode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };

  let parsed: { pathname: string } | null = null;
  if (!rawUrl.trim()) return null;
  if (rawUrl.startsWith("/")) {
    parsed = { pathname: rawUrl.split("?")[0] };
  } else {
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "https:" && (url.hostname === APP_LINK_DOMAIN || url.hostname === `www.${APP_LINK_DOMAIN}`)) {
        parsed = { pathname: url.pathname };
      } else if (url.protocol === "pickleballapp:") {
        if (url.hostname === "app") parsed = { pathname: url.pathname || "/" };
        else if (url.hostname) parsed = { pathname: `/${url.hostname}${url.pathname}` };
        else parsed = { pathname: url.pathname || "/" };
      }
    } catch {
      return null;
    }
  }
  if (!parsed) return null;

  const parts = parsed.pathname.split("/").filter(Boolean).map(safeDecode);
  const root = parts[0] ?? null;
  const id = parts[1] ?? null;
  if (!root || !id) return null;

  switch (root) {
    case "conversation": return { type: "conversation", id, requiresAuth: true };
    case "groups": return { type: "group", id, requiresAuth: true };
    case "tournament": return { type: "tournament", id, requiresAuth: false };
    case "community": return { type: "community", id, requiresAuth: false };
    case "marketplace": return { type: "marketplace", id, requiresAuth: false };
    case "booking": return { type: "booking", id, requiresAuth: true };
    case "coach":
      if (id === "offers") {
        const offerId = parsed.pathname.split("/").filter(Boolean)[2];
        if (offerId) return { type: "coach_offer", id: safeDecode(offerId), requiresAuth: true };
      }
      return null;
    case "claim": return { type: "claim", id, requiresAuth: false };
    case "review": return { type: "review", id, requiresAuth: true };
    default: return null;
  }
}

const UUID = "3f2b8c1e-9d4a-4e6b-8f1a-2c3d4e5f6a7b";

const CORPUS = [
  // every root, every spelling
  ...["conversation", "groups", "tournament", "community", "marketplace", "booking", "claim", "review"].flatMap((r) => [
    `/${r}/${UUID}`,
    `/${r}/${UUID}?ref=push`,
    `https://pickleballapp.app/${r}/${UUID}`,
    `https://www.pickleballapp.app/${r}/${UUID}`,
    `pickleballapp://${r}/${UUID}`,
    `pickleballapp://app/${r}/${UUID}`,
    `pickleballapp:///${r}/${UUID}`,
    `/${r}`,
    `/${r}/`,
    `https://pickleballapp.app/${r}`,
  ]),
  // coach
  `/coach/offers/${UUID}`, "/coach/offers", `/coach/${UUID}`, `pickleballapp://coach/offers/${UUID}`,
  `https://pickleballapp.app/coach/offers/${UUID}/extra`,
  // encoding
  "/tournament/a%20b", "/tournament/%E0%A4%A", "/review/tok%2Fen", "/%74ournament/1",
  // hostile or foreign
  "", "   ", "/", "javascript:alert(1)", "data:text/html,hi", `https://evil.example/tournament/${UUID}`,
  `http://pickleballapp.app/tournament/${UUID}`, `https://pickleballapp.app.evil.example/tournament/${UUID}`,
  "/constructor/1", "/toString/1", "/__proto__/1", "/hasOwnProperty/1", "not a url", "pickleballapp:",
  `/unknown/${UUID}`,
];

describe("resolveDeepLink — behaviour preserved from externalRouting.ts", () => {
  it.each(CORPUS)("agrees with the legacy resolver on %j", (url) => {
    expect(resolveDeepLink(url)).toEqual(legacyResolve(url));
  });

  it("covers every root the legacy switch handled", () => {
    expect(Object.keys(DEEP_LINK_ROOTS).sort()).toEqual(
      ["booking", "claim", "coach", "community", "conversation", "groups", "marketplace", "review", "tournament"],
    );
  });

  it("does not resolve prototype keys (the legacy switch never did)", () => {
    expect(resolveDeepLink("/constructor/1")).toBeNull();
    expect(resolveDeepLink("/__proto__/1")).toBeNull();
  });
});

describe("validateBroadcastDestination", () => {
  it.each([
    [`pickleballapp://tournament/${UUID}`, "tournament"],
    [`pickleballapp://app/community/${UUID}`, "community"],
    [`pickleballapp:///marketplace/${UUID}`, "marketplace"],
    [`https://pickleballapp.app/groups/${UUID}`, "group"],
    [`https://pickleballapp.app/coach/offers/${UUID}`, "coach_offer"],
    [`https://pickleballapp.app/tournament/${UUID}/`, "tournament"],
  ])("accepts %s", (url, type) => {
    const r = validateBroadcastDestination(url);
    expect(r).toMatchObject({ ok: true, type, id: UUID });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["javascript:alert(1)", "not_allowed"],
    ["data:text/html,hi", "not_allowed"],
    [`https://evil.example/tournament/${UUID}`, "not_allowed"],
    [`https://pickleballapp.app.evil.example/tournament/${UUID}`, "not_allowed"],
    [`https://www.pickleballapp.app/tournament/${UUID}`, "not_allowed"],
    [`http://pickleballapp.app/tournament/${UUID}`, "not_allowed"],
    [`/tournament/${UUID}`, "not_allowed"], // relative: never stored
    ["pickleballapp://tournament", "not_allowed"], // bare root
    ["pickleballapp://tournament/", "not_allowed"],
    [`pickleballapp://conversation/${UUID}`, "not_allowed"], // personal
    [`pickleballapp://booking/${UUID}`, "not_allowed"],
    [`pickleballapp://review/${UUID}`, "not_allowed"],
    [`pickleballapp://claim/${UUID}`, "not_allowed"],
    [`pickleballapp://coach/${UUID}`, "not_allowed"],
    [`pickleballapp://tournament/${UUID}?x=1`, "not_allowed"],
    [`pickleballapp://tournament/${UUID}#x`, "not_allowed"],
    ["pickleballapp://tournament/a%20b", "not_allowed"],
    [`pickleballapp://tournament/${UUID}/extra`, "not_allowed"],
    [`pickleballapp://tournament/${"a".repeat(65)}`, "not_allowed"],
    [`pickleballapp://tournament/${UUID}\n`, "ok-after-trim"],
    [`pickleballapp://tournament/${UUID}${" ".repeat(500)}`, "ok-after-trim"],
    [`pickleballapp://tournament/${"a".repeat(600)}`, "too_long"],
  ])("handles %j", (url, expected) => {
    const r = validateBroadcastDestination(url);
    if (expected === "ok-after-trim") expect(r.ok).toBe(true);
    else expect(r).toEqual({ ok: false, reason: expected });
  });

  it("only accepts roots that are marked broadcastable", () => {
    const broadcastable = Object.entries(DEEP_LINK_ROOTS)
      .filter(([, spec]) => spec.broadcastable)
      .map(([root]) => (root === "coach" ? "coach/offers" : root))
      .sort();
    const inPattern = /\(([a-z/|]+)\)\//.exec(BROADCAST_DESTINATION_PATTERN)![1].split("|").sort();
    expect(inPattern).toEqual(broadcastable);
  });
});

describe("the SQL mirror of BROADCAST_DESTINATION_PATTERN", () => {
  // public.campaign_destination_type() validates on write and cannot import
  // TypeScript. If this fails, the composer and the database disagree about
  // what a campaign may link to: update both, in the same change.
  it("is identical in the campaign API migration", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../../../supabase/migrations/20260921200000_campaign_api.sql"),
      "utf-8",
    );
    const m = /c_pattern constant text := '([^']+)';/.exec(sql);
    expect(m, "c_pattern not found in the migration").not.toBeNull();
    // SQL standard strings do not treat backslash as an escape, so the SQL
    // literal holds one backslash where the TS literal source holds two.
    expect(m![1]).toBe(BROADCAST_DESTINATION_PATTERN);
  });
});
