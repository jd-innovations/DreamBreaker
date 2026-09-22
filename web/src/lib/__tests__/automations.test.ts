// Pure logic of the Automations tab. The rules that decide WHETHER a push
// goes out live in the database (private.automation_push_blocked_reason) and
// are covered by dry runs there; these are the editor's own parsing and
// formatting, where a silent mistake would write bad timing into the catalog.

import { describe, expect, it } from "vitest";
import {
  describeTiming, formatHour, parseOffsets, renderPreview, variablesFor, type Automation,
} from "../notifications/automations";

function make(overrides: Partial<Automation> = {}): Automation {
  return {
    key: "hold_expiring",
    name: "Hold ending soon",
    description: null,
    category: "critical",
    pref_column: null,
    channels: ["push", "in_app"],
    title_template: "Your spot is on hold",
    body_template: "Finish registering for {{tournament_name}} within {{hours_left}} hours.",
    link_template: "/tournament/{{tournament_id}}",
    timing: { offsets_hours: [24, 2] },
    throttle_hours: null,
    enabled: false,
    wired: true,
    sort_order: 10,
    updated_at: "2026-09-22T00:00:00Z",
    updated_by_name: null,
    last_sent_at: null,
    sent_7d: 0,
    sent_total: 0,
    ...overrides,
  };
}

describe("parseOffsets", () => {
  it("parses a comma list, largest first", () => {
    expect(parseOffsets("2, 24")).toEqual([24, 2]);
  });

  it("drops duplicates", () => {
    expect(parseOffsets("24, 24, 2")).toEqual([24, 2]);
  });

  it("treats an empty box as no offsets rather than an error", () => {
    expect(parseOffsets("   ")).toEqual([]);
  });

  // Each of these would otherwise reach the catalog and make the sender
  // either fire constantly (0 / negative) or never (nonsense).
  it.each(["0", "-3", "abc", "2.5.1", "99999"])("rejects %s", (bad) => {
    expect(parseOffsets(bad)).toBeNull();
  });

  it("accepts a fractional hour as given", () => {
    expect(parseOffsets("1.5")).toEqual([1.5]);
  });
});

describe("describeTiming", () => {
  it("reads hours as hours and whole days as days", () => {
    expect(describeTiming(make())).toBe("24h and 2h before");
    expect(describeTiming(make({ timing: { offsets_hours: [48] } }))).toBe("2d before");
  });

  it("says nothing when an automation has no schedule", () => {
    expect(describeTiming(make({ timing: {} }))).toBe("");
    expect(describeTiming(make({ timing: { offsets_hours: [] } }))).toBe("");
  });
});

describe("variablesFor", () => {
  it("collects every variable across title, body and link", () => {
    expect(variablesFor(make()).sort()).toEqual(["hours_left", "tournament_id", "tournament_name"]);
  });

  it("reports none when the copy is all literal", () => {
    expect(variablesFor(make({
      title_template: "Check-in is open",
      body_template: "Tap to check in.",
      link_template: null,
    }))).toEqual([]);
  });
});

describe("renderPreview", () => {
  it("fills in sample values", () => {
    expect(renderPreview("Tomorrow: {{tournament_name}}")).toBe("Tomorrow: Fall Doubles Open");
  });

  // A variable the event cannot supply must stay visible in the preview: that
  // is the admin's only warning before saving copy that would ship a literal
  // {{token}} to a player, which is the 2026-08-21 email failure in push form.
  it("leaves an unknown variable in place", () => {
    expect(renderPreview("Hi {{nickname}}")).toBe("Hi {{nickname}}");
  });
});

// The second timing shape: fire at a local hour rather than an offset. Events
// carry no timezone, so the day-before reminder has to work this way.
describe("describeTiming, local-hour rules", () => {
  it("reads a day-before rule in the player's own time", () => {
    expect(describeTiming(make({ timing: { days_before: 1, send_local_hour: 17 } })))
      .toBe("the day before, 5 PM their time");
  });

  it("handles same-day and multi-day rules", () => {
    expect(describeTiming(make({ timing: { days_before: 0, send_local_hour: 8 } })))
      .toBe("on the day, 8 AM their time");
    expect(describeTiming(make({ timing: { days_before: 3, send_local_hour: 12 } })))
      .toBe("3 days before, 12 PM their time");
  });

  // A send_local_hour of 0 is midnight, not "unset" — a falsy check here would
  // silently fall through to the offsets branch and describe the wrong rule.
  it("treats hour 0 as midnight rather than missing", () => {
    expect(describeTiming(make({ timing: { days_before: 1, send_local_hour: 0 } })))
      .toBe("the day before, 12 AM their time");
  });
});

describe("formatHour", () => {
  it.each([[0, "12 AM"], [8, "8 AM"], [12, "12 PM"], [17, "5 PM"], [23, "11 PM"]])(
    "%i reads as %s", (h, expected) => { expect(formatHour(h as number)).toBe(expected); },
  );
});
