import { describe, expect, it, vi } from "vitest";

// directory.ts imports next/cache and the anon client at module load; neither
// is exercised by the pure helpers under test.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/og/client", () => ({ ogClient: () => ({}) }));

const { citySlug, courtSummary, facilityHref, isIndexable, searchWords, stateFromParam } = await import(
  "@/lib/courts/directory"
);

describe("citySlug", () => {
  it("lowercases before stripping (the database bug this mirrors the fix for)", () => {
    expect(citySlug("Inlet Beach")).toBe("inlet-beach");
  });
  it("merges punctuation variants", () => {
    expect(citySlug("St. Petersburg")).toBe(citySlug("St Petersburg"));
  });
  it("removes accents", () => {
    expect(citySlug("Mayagüez")).toBe("mayaguez");
  });
});

describe("stateFromParam", () => {
  it("accepts known codes in any case", () => {
    expect(stateFromParam("fl")).toBe("FL");
    expect(stateFromParam("PR")).toBe("PR");
  });
  it("rejects unknown codes and junk", () => {
    expect(stateFromParam("zz")).toBeNull();
    expect(stateFromParam("florida")).toBeNull();
  });
});

describe("facilityHref", () => {
  it("builds the canonical path", () => {
    expect(facilityHref({ state: "FL", city: "Sarasota", slug: "payne-park-sarasota-fl" })).toBe(
      "/courts/fl/sarasota/payne-park-sarasota-fl",
    );
  });
});

describe("searchWords", () => {
  it("cannot smuggle PostgREST filter syntax", () => {
    const words = searchWords("x),id.eq.1,(name.ilike.*");
    for (const w of words) expect(w).not.toMatch(/[(),*]/);
  });
  it("splits a city, state search", () => {
    expect(searchWords("Sarasota, FL")).toEqual(["Sarasota", "FL"]);
  });
  it("keeps apostrophes and hyphens inside words", () => {
    expect(searchWords("O'Leary Winston-Salem")).toEqual(["O'Leary", "Winston-Salem"]);
  });
  it("caps at four words", () => {
    expect(searchWords("a b c d e f")).toHaveLength(4);
  });
  it("is empty for blank input", () => {
    expect(searchWords("  ,,, ")).toEqual([]);
    expect(searchWords(undefined)).toEqual([]);
  });
});

describe("courtSummary", () => {
  it("total with split", () => {
    expect(courtSummary({ court_count: 6, indoor_courts: 2, outdoor_courts: 4 })).toBe("6 courts (4 outdoor, 2 indoor)");
  });
  it("singular", () => {
    expect(courtSummary({ court_count: 1, indoor_courts: 0, outdoor_courts: 0 })).toBe("1 court");
  });
  it("null when unknown", () => {
    expect(courtSummary({ court_count: 0, indoor_courts: null, outdoor_courts: null })).toBeNull();
  });
});

describe("isIndexable", () => {
  it("needs an address plus courts or a photo", () => {
    expect(isIndexable({ address: "1 Main St", court_count: 4, photos: [] })).toBe(true);
    expect(isIndexable({ address: "1 Main St", court_count: 0, photos: ["p"] })).toBe(true);
    expect(isIndexable({ address: "1 Main St", court_count: 0, photos: [] })).toBe(false);
    expect(isIndexable({ address: null, court_count: 8, photos: ["p"] })).toBe(false);
  });
});

describe("submissionErrorMessage", async () => {
  const { submissionErrorMessage } = await import("@/lib/courts/submissions");
  it("names the field", () => {
    expect(submissionErrorMessage('too_long:name')).toBe("Name is too long.");
    expect(submissionErrorMessage('ERROR: invalid_value:website')).toMatch(/http/);
  });
  it("explains limits", () => {
    expect(submissionErrorMessage("too_many_pending")).toMatch(/10 submissions/);
    expect(submissionErrorMessage("invalid_value:court_count")).toMatch(/total/);
  });
  it("falls back for anything unknown", () => {
    expect(submissionErrorMessage("boom")).toMatch(/try again/);
  });
});
