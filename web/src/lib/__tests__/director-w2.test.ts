import { describe, expect, it } from "vitest";
import { parsePrevScore } from "@/lib/tournament/score-corrections";
import { formatFee, onsiteLabel } from "@/lib/tournament/director-registrations";

describe("parsePrevScore", () => {
  it("reads the jsonb the correction writes", () => {
    expect(parsePrevScore({ s1: 11, s2: 9, winner: 1 })).toEqual({ s1: 11, s2: 9 });
  });
  it("treats anything else as unknown", () => {
    expect(parsePrevScore(null)).toBeNull();
    expect(parsePrevScore({ s1: 11 })).toBeNull();
    expect(parsePrevScore({ s1: "11", s2: 9 })).toBeNull();
  });
});

describe("on-site payment labels", () => {
  it("formats whole and part dollars", () => {
    expect(formatFee(4000)).toBe("$40");
    expect(formatFee(4050)).toBe("$40.50");
  });
  it("labels rows as mobile does", () => {
    expect(onsiteLabel(null, null)).toBeNull();
    expect(onsiteLabel("comp", 0)).toBe("Comped");
    expect(onsiteLabel("cash", 4000)).toBe("Cash $40 on site");
    expect(onsiteLabel("other", 2500)).toBe("Other $25 on site");
  });
});
