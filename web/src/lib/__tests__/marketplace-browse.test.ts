import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  browseArgs,
  browseHref,
  hasActiveFilters,
  pageCount,
  parseBrowseParams,
  PAGE_SIZE,
  PRICE_BANDS,
  priceBandFor,
  radiusForBounds,
} from "../marketplace/browse";

describe("parseBrowseParams", () => {
  it("defaults to newest, page 1, nothing filtered", () => {
    const f = parseBrowseParams({});
    expect(f).toMatchObject({ q: "", brand: "", condition: "", fulfillment: "", state: "", minDollars: null, maxDollars: null, sort: "newest", page: 1 });
    expect(hasActiveFilters(f)).toBe(false);
  });
  it("keeps valid values", () => {
    const f = parseBrowseParams({ q: " crbn ", brand: "CRBN", condition: "like_new", fulfillment: "shipping", state: "fl", min: "50", max: "200", sort: "price_asc", page: "3" });
    expect(f).toMatchObject({ q: "crbn", brand: "CRBN", condition: "like_new", fulfillment: "shipping", state: "FL", minDollars: 50, maxDollars: 200, sort: "price_asc", page: 3 });
    expect(hasActiveFilters(f)).toBe(true);
  });
  it("drops anything malformed instead of failing", () => {
    const f = parseBrowseParams({ condition: "mint", fulfillment: "drone", state: "Florida", min: "-5", max: "abc", sort: "random", page: "0" });
    expect(f).toMatchObject({ condition: "", fulfillment: "", state: "", minDollars: null, maxDollars: null, sort: "newest", page: 1 });
  });
  it("swaps a reversed price range", () => {
    expect(parseBrowseParams({ min: "300", max: "100" })).toMatchObject({ minDollars: 100, maxDollars: 300 });
  });
  it("reads the first of a repeated parameter", () => {
    expect(parseBrowseParams({ brand: ["CRBN", "Joola"] }).brand).toBe("CRBN");
  });
});

describe("browseArgs", () => {
  it("converts dollars to cents and pages to offsets", () => {
    const a = browseArgs(parseBrowseParams({ min: "50", max: "200", page: "2" }));
    expect(a).toMatchObject({ p_min_cents: 5000, p_max_cents: 20000, p_limit: PAGE_SIZE, p_offset: PAGE_SIZE });
  });
  it("sends nothing for empty filters", () => {
    const a = browseArgs(parseBrowseParams({}));
    expect(a.p_search).toBeUndefined();
    expect(a.p_brand).toBeUndefined();
    expect(a.p_min_cents).toBeUndefined();
  });
});

describe("browseHref", () => {
  const f = parseBrowseParams({ brand: "CRBN", sort: "price_desc", page: "2" });
  it("keeps the filters when paging", () => {
    expect(browseHref(f, { page: 3 })).toBe("/marketplace?brand=CRBN&sort=price_desc&page=3");
  });
  it("omits defaults", () => {
    expect(browseHref(parseBrowseParams({}))).toBe("/marketplace");
  });
  it("adds the map view only when asked", () => {
    expect(browseHref(f, { page: 1, view: "map" })).toBe("/marketplace?brand=CRBN&sort=price_desc&view=map");
    expect(browseHref(f, { page: 1, view: "list" })).toBe("/marketplace?brand=CRBN&sort=price_desc");
  });
});

describe("pageCount", () => {
  it("is at least one page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });
});

describe("price bands", () => {
  it("places prices in the right band", () => {
    expect(priceBandFor(9999).key).toBe("under_100");
    expect(priceBandFor(10000).key).toBe("mid");
    expect(priceBandFor(29999).key).toBe("upper");
    expect(priceBandFor(30000).key).toBe("premium");
  });

  // The app's bands are the source of truth; web must not drift from them.
  it("matches the mobile app's thresholds and colours", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../../apps/mobile/src/lib/marketplace/priceBands.ts"),
      "utf8",
    );
    const mins = [...src.matchAll(/minCents:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(mins).toEqual(PRICE_BANDS.map((b) => b.minCents));
    const hexes = [...src.matchAll(/color:\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toUpperCase());
    for (const hex of hexes) expect(PRICE_BANDS.map((b) => b.color.toUpperCase())).toContain(hex);
  });
});

describe("radiusForBounds", () => {
  it("is about half the visible diagonal", () => {
    const r = radiusForBounds({ lat: 27.3, lng: -82.6 }, { lat: 27.5, lng: -82.3 });
    expect(r).toBeGreaterThan(10_000);
    expect(r).toBeLessThan(25_000);
  });
  it("is capped like the RPC", () => {
    expect(radiusForBounds({ lat: -60, lng: -170 }, { lat: 70, lng: 170 })).toBe(500_000);
  });
});
