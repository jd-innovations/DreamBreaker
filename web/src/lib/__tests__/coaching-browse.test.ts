// Pure logic behind /lessons. The database decides what a visitor may SEE
// (browse_coach_offers, tested by its own dry runs); these are the rules that
// decide what a visitor is TOLD about price — where a mistake is a quiet lie
// on a card rather than a crash.

import { describe, expect, it } from "vitest";
import {
  browseHref, discountPercent, EMPTY_FILTERS, filtersFromParams, formatPrice, initialsOf,
  offerMeta, placeLabel, publicPrice,
} from "../coaching/browse";

describe("publicPrice", () => {
  it("uses the discounted price when there is a real discount", () => {
    expect(publicPrice({ regular_price_cents: 9000, discounted_price_cents: 7000 }))
      .toEqual({ cents: 7000, wasCents: 9000 });
  });

  it("ignores a discount that is not one", () => {
    expect(publicPrice({ regular_price_cents: 9000, discounted_price_cents: 9000 }))
      .toEqual({ cents: 9000, wasCents: null });
    expect(publicPrice({ regular_price_cents: 9000, discounted_price_cents: 9500 }))
      .toEqual({ cents: 9000, wasCents: null });
  });

  it("falls back to the regular price when none is set", () => {
    expect(publicPrice({ regular_price_cents: 9000, discounted_price_cents: null }))
      .toEqual({ cents: 9000, wasCents: null });
  });
});

describe("formatPrice", () => {
  it("drops the cents when they are zero — a card reads better as $45", () => {
    expect(formatPrice(4500)).toBe("$45");
  });

  it("keeps them when they matter", () => {
    expect(formatPrice(4550)).toBe("$45.50");
  });

  it("says nothing for a missing price rather than $0", () => {
    expect(formatPrice(null)).toBe("");
    expect(formatPrice(undefined)).toBe("");
  });
});

describe("discountPercent", () => {
  it("rounds to a whole percent", () => {
    expect(discountPercent({ regular_price_cents: 9000, discounted_price_cents: 7000 })).toBe(22);
  });

  it("is null when there is nothing to boast about", () => {
    expect(discountPercent({ regular_price_cents: 9000, discounted_price_cents: null })).toBeNull();
    expect(discountPercent({ regular_price_cents: 9000, discounted_price_cents: 9000 })).toBeNull();
  });

  // A zero regular price would divide by zero; a card claiming "NaN% off"
  // is worse than no badge.
  it("survives a zero regular price", () => {
    expect(discountPercent({ regular_price_cents: 0, discounted_price_cents: 0 })).toBeNull();
  });
});

describe("offerMeta", () => {
  it("lists only the parts that exist", () => {
    expect(offerMeta({ duration_minutes: 60, max_participants: 4, lessons_included: 3 }))
      .toBe("60 min · up to 4 players · 3 lessons");
    expect(offerMeta({ duration_minutes: 60, max_participants: null, lessons_included: null }))
      .toBe("60 min");
    expect(offerMeta({ duration_minutes: null, max_participants: null, lessons_included: null }))
      .toBe("");
  });

  // "up to 1 players" and "1 lessons" are how a card looks unfinished.
  it("omits singular counts that say nothing", () => {
    expect(offerMeta({ duration_minutes: 45, max_participants: 1, lessons_included: 1 }))
      .toBe("45 min");
  });
});

describe("placeLabel", () => {
  it("joins venue and place, skipping whatever is missing", () => {
    expect(placeLabel({ facility_name: "Suncoast", city: "Sarasota", state: "FL" }))
      .toBe("Suncoast · Sarasota, FL");
    expect(placeLabel({ facility_name: null, city: "Sarasota", state: "FL" }))
      .toBe("Sarasota, FL");
    expect(placeLabel({ facility_name: "Suncoast", city: null, state: null }))
      .toBe("Suncoast");
    expect(placeLabel({ facility_name: null, city: null, state: null })).toBe("");
  });
});

describe("initialsOf", () => {
  it("takes first and last initials", () => {
    expect(initialsOf("Jesus Dominguez")).toBe("JD");
    expect(initialsOf("Cher")).toBe("CH");
  });

  it("falls back rather than rendering an empty panel", () => {
    expect(initialsOf(null)).toBe("PB");
    expect(initialsOf("   ")).toBe("PB");
  });
});

describe("browseHref and filtersFromParams", () => {
  it("writes only the filters that are set", () => {
    expect(browseHref(EMPTY_FILTERS)).toBe("/lessons");
    expect(browseHref(EMPTY_FILTERS, { search: "clinic" })).toBe("/lessons?q=clinic");
    expect(browseHref(EMPTY_FILTERS, { type: "private", sort: "price_low" }))
      .toBe("/lessons?type=private&sort=price_low");
  });

  it("leaves the default sort and first page out of the URL", () => {
    expect(browseHref(EMPTY_FILTERS, { sort: "newest", page: 1 })).toBe("/lessons");
  });

  it("round-trips", () => {
    const f = { search: "clinic", type: "camp", city: "Sarasota", sort: "price_high", page: 3 };
    const url = browseHref(EMPTY_FILTERS, f);
    expect(filtersFromParams(new URLSearchParams(url.split("?")[1]))).toEqual(f);
  });

  it("treats junk in the page parameter as page 1", () => {
    expect(filtersFromParams(new URLSearchParams("page=abc")).page).toBe(1);
    expect(filtersFromParams(new URLSearchParams("page=-4")).page).toBe(1);
  });

  it("reads plain objects too, for server components", () => {
    expect(filtersFromParams({ q: "camp", sort: undefined })).toEqual({
      search: "camp", type: "", city: "", sort: "newest", page: 1,
    });
  });
});
