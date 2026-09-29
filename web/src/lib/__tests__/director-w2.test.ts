import { describe, expect, it } from "vitest";
import { parsePrevScore } from "@/lib/tournament/score-corrections";
import { formatFee, onsiteLabel } from "@/lib/tournament/director-registrations";
import { withSeeds, type LiveBracketMatch } from "@/lib/tournament/live-brackets";

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

const opening = (k: number, t1: string | null, t2: string | null): LiveBracketMatch => ({
  id: `m${k}`, divisionId: "d", round: "qf", poolLabel: null, matchNumber: k,
  team1: t1 ? [t1] : [], team2: t2 ? [t2] : [], team1Name: t1, team2Name: t2,
  score1: null, score2: null, winner: null, completed: false, completedAt: null, court: null,
  editedAt: null, prevScore: null, seed1: null, seed2: null, games1: [], games2: [],
});

describe("bracket seeds", () => {
  it("reads seeds from standard placement, byes on the top seeds", () => {
    // 6 teams in 8 slots: positions 1,8,4,5,2,7,3,6 -> seeds 7 and 8 are byes.
    const out = withSeeds([opening(0, "a", null), opening(1, "d", "e"), opening(2, "b", null), opening(3, "c", "f")]);
    expect(out.map((m) => [m.seed1, m.seed2])).toEqual([[1, null], [4, 5], [2, null], [3, 6]]);
  });
  it("shows no seeds for a bracket not built with standard placement", () => {
    const out = withSeeds([opening(0, "a", "b"), opening(1, "c", null), opening(2, "d", "e"), opening(3, "f", null)]);
    expect(out.every((m) => m.seed1 === null && m.seed2 === null)).toBe(true);
  });
});
