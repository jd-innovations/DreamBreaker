import { describe, expect, it } from "vitest";
import {
  audienceParams,
  buildDestination,
  canAbort,
  canCancel,
  canEdit,
  groupDeliveryErrors,
  lengthState,
  parseDestination,
  parseThreshold,
  requiresTypedSend,
  rpcErrorMessage,
  scheduleInstant,
  sendErrorMessage,
  statusTone,
  tapMetric,
  timezoneLabel,
  TITLE_MAX,
  TITLE_WARN,
} from "../campaigns/campaign-logic";

describe("lengthState", () => {
  it("is empty for whitespace", () => expect(lengthState("   ", TITLE_WARN, TITLE_MAX)).toBe("empty"));
  it("is ok up to the warning", () => expect(lengthState("a".repeat(TITLE_WARN), TITLE_WARN, TITLE_MAX)).toBe("ok"));
  it("warns past the warning", () => expect(lengthState("a".repeat(TITLE_WARN + 1), TITLE_WARN, TITLE_MAX)).toBe("warn"));
  it("is over past the max", () => expect(lengthState("a".repeat(TITLE_MAX + 1), TITLE_WARN, TITLE_MAX)).toBe("over"));
  it("counts trimmed length, as the server does", () =>
    expect(lengthState(`  ${"a".repeat(TITLE_MAX)}  `, TITLE_WARN, TITLE_MAX)).toBe("warn"));
});

describe("buildDestination", () => {
  it("builds the app-scheme form the E2E test proved", () => {
    expect(buildDestination("tournament", "7695e418-6cc7-48d1-a485-d2553b0e639a")).toEqual({
      ok: true,
      url: "pickleballapp://tournament/7695e418-6cc7-48d1-a485-d2553b0e639a",
      type: "tournament",
      id: "7695e418-6cc7-48d1-a485-d2553b0e639a",
    });
  });
  it("maps group and coach offer to their roots", () => {
    expect(buildDestination("group", "abc")).toMatchObject({ ok: true, url: "pickleballapp://groups/abc" });
    expect(buildDestination("coach_offer", "abc")).toMatchObject({ ok: true, url: "pickleballapp://coach/offers/abc" });
  });
  it("requires a type and an id", () => {
    expect(buildDestination("", "abc").ok).toBe(false);
    expect(buildDestination("tournament", "  ").ok).toBe(false);
  });
  it("rejects ids with unsafe characters", () => {
    expect(buildDestination("tournament", "abc?x=1").ok).toBe(false);
    expect(buildDestination("tournament", "a b").ok).toBe(false);
  });
  it("rejects personal routes even if the type is forced", () => {
    expect(buildDestination("conversation", "abc").ok).toBe(false);
  });
  it("accepts a pasted broadcastable link and takes its type", () => {
    expect(buildDestination("", "https://pickleballapp.app/marketplace/xyz")).toMatchObject({
      ok: true, type: "marketplace", id: "xyz",
    });
  });
  it("rejects pasted links that are not broadcastable", () => {
    expect(buildDestination("tournament", "javascript:alert(1)").ok).toBe(false);
    expect(buildDestination("tournament", "https://evil.example/tournament/x").ok).toBe(false);
    expect(buildDestination("tournament", "pickleballapp://conversation/abc").ok).toBe(false);
  });
});

describe("parseDestination", () => {
  it("round-trips what buildDestination makes", () => {
    const built = buildDestination("community", "e-1");
    expect(built.ok && parseDestination(built.url)).toEqual({ type: "community", id: "e-1" });
  });
  it("returns blanks for anything unusable", () => {
    expect(parseDestination("https://evil.example/x")).toEqual({ type: "", id: "" });
  });
});

describe("audienceParams", () => {
  it("maps choices to the RPC's shape", () => {
    expect(audienceParams("all")).toEqual({ p_audience_type: "all", p_audience_platform: null });
    expect(audienceParams("ios")).toEqual({ p_audience_type: "platform", p_audience_platform: "ios" });
  });
});

describe("typed SEND threshold", () => {
  it("reads the configured number", () => expect(parseThreshold("100")).toBe(100));
  it("fails safe to 1 on missing or bad values", () => {
    expect(parseThreshold(undefined)).toBe(1);
    expect(parseThreshold("")).toBe(1);
    expect(parseThreshold("abc")).toBe(1);
    expect(parseThreshold("0")).toBe(1);
    expect(parseThreshold("-5")).toBe(1);
  });
  it("is required at and above the threshold", () => {
    expect(requiresTypedSend(99, 100)).toBe(false);
    expect(requiresTypedSend(100, 100)).toBe(true);
    expect(requiresTypedSend(101, 100)).toBe(true);
  });
});

describe("scheduleInstant", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  it("needs a value", () => expect(scheduleInstant("", now).ok).toBe(false));
  it("refuses the past and the next minute", () => {
    expect(scheduleInstant(new Date(now.getTime() - 60_000).toISOString(), now).ok).toBe(false);
    expect(scheduleInstant(new Date(now.getTime() + 30_000).toISOString(), now).ok).toBe(false);
  });
  it("refuses more than 90 days ahead", () =>
    expect(scheduleInstant(new Date(now.getTime() + 91 * 86_400_000).toISOString(), now).ok).toBe(false));
  it("accepts a sensible time", () =>
    expect(scheduleInstant(new Date(now.getTime() + 3_600_000).toISOString(), now)).toEqual({
      ok: true, iso: "2026-09-22T13:00:00.000Z",
    }));
});

describe("timezoneLabel", () => {
  it("names the zone and its offset", () => {
    const label = timezoneLabel(new Date(), "America/Chicago");
    expect(label).toMatch(/^America\/Chicago \(UTC[+−]\d{2}:\d{2}\)$/);
  });
});

describe("status rules", () => {
  it("allows edit only for drafts", () => {
    expect(canEdit("draft")).toBe(true);
    expect(canEdit("scheduled")).toBe(false);
  });
  it("allows cancel before queuing and abort while sending", () => {
    expect(canCancel("scheduled")).toBe(true);
    expect(canCancel("sending")).toBe(false);
    expect(canAbort("sending")).toBe(true);
    expect(canAbort("queuing")).toBe(true);
    expect(canAbort("sent")).toBe(false);
  });
  it("gives trouble the destructive tone", () => {
    expect(statusTone("partially_failed")).toBe("bad");
    expect(statusTone("sent")).toBe("good");
    expect(statusTone("draft")).toBe("neutral");
  });
});

describe("error messages", () => {
  it("prefers the server's hint", () =>
    expect(rpcErrorMessage({ message: "invalid_title", hint: "Title must be 1 to 100 characters." }))
      .toBe("Title must be 1 to 100 characters."));
  it("never shows raw authorization text", () =>
    expect(rpcErrorMessage({ message: "not authorized" })).toBe("Admins only."));
  it("explains the kill switch", () =>
    expect(sendErrorMessage("broadcast_disabled")).toMatch(/switched off/));
  it("falls back to the HTTP status", () => expect(sendErrorMessage("weird", 500)).toBe("Request failed (500)."));
});

describe("tapMetric", () => {
  it("excludes deliveries to builds that cannot report taps from both sides", () => {
    expect(tapMetric(3, 10, 25)).toEqual({ kind: "rate", taps: 3, denominator: 10, pct: 30, excluded: 15 });
  });
  it("reports no rate when no delivery could report a tap", () => {
    expect(tapMetric(0, 0, 2)).toEqual({ kind: "none", excluded: 2 });
  });
});

describe("groupDeliveryErrors", () => {
  it("groups by cause and source, largest first, ignoring successes", () => {
    const groups = groupDeliveryErrors([
      { status: "accepted", error_code: null, reconciled_at: null },
      { status: "failed", error_code: "MessageTooBig", reconciled_at: "t" },
      { status: "failed", error_code: "interrupted", reconciled_at: null },
      { status: "failed", error_code: "interrupted", reconciled_at: null },
      { status: "invalid_token", error_code: null, reconciled_at: null },
    ]);
    expect(groups).toEqual([
      { code: "interrupted", count: 2, source: "send" },
      { code: "DeviceNotRegistered", count: 1, source: "send" },
      { code: "MessageTooBig", count: 1, source: "receipt" },
    ]);
  });
});
