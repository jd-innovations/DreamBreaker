import { describe, expect, it } from "vitest";
import { formatPlayerRating, mutualLabel, resolvePlayerRating, toPlayer } from "../players/directory";

describe("player rating", () => {
  it("prefers DUPR", () => {
    expect(formatPlayerRating(resolvePlayerRating(4.12, "3.5"))).toBe("4.1 DUPR");
  });
  it("falls back to the self-rating", () => {
    expect(formatPlayerRating(resolvePlayerRating(null, "3.5"))).toBe("3.5 Self");
  });
  it("is Unrated with neither", () => {
    expect(formatPlayerRating(resolvePlayerRating(null, null))).toBe("Unrated");
    expect(formatPlayerRating(resolvePlayerRating(undefined, "n/a"))).toBe("Unrated");
  });
});

describe("mutualLabel", () => {
  it("pluralises and hides zero", () => {
    expect(mutualLabel(0)).toBeNull();
    expect(mutualLabel(1)).toBe("1 mutual connection");
    expect(mutualLabel(3)).toBe("3 mutual connections");
  });
});

describe("toPlayer", () => {
  const base = {
    id: "p1", full_name: "  Jamie Fox ", handle: "jamie", avatar_url: null, dupr: null,
    self_rating: "3.0", location_city: "Sarasota", location_state: "FL",
  };
  it("shapes a row for display, city and state only", () => {
    expect(toPlayer({ ...base, is_connected: true, mutual_count: 2 })).toMatchObject({
      id: "p1", name: "Jamie Fox", handle: "jamie", location: "Sarasota, FL", isConnected: true, mutualCount: 2,
    });
  });
  it("labels a nameless account instead of leaving it blank", () => {
    expect(toPlayer({ ...base, full_name: " " }).name).toBe("Unnamed player");
  });
  it("has no location when neither city nor state is set", () => {
    expect(toPlayer({ ...base, location_city: null, location_state: null }).location).toBeNull();
  });
});
