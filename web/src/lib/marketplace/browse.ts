// Pure rules for the public marketplace browse page (/marketplace) and its
// signed-in map. No I/O — see src/lib/__tests__/marketplace-browse.test.ts.
//
// Filters live in the URL, so any filtered view can be shared or indexed and
// works without JavaScript (the filter form is a plain GET form). Every value
// read from the URL is validated here before it reaches the database; the
// browse_listings RPC re-checks nothing about intent, it just filters.

import type { MarketplaceCondition, MarketplaceFulfillment } from "@shared/marketplace";

export const PAGE_SIZE = 24;

export const CONDITIONS: readonly MarketplaceCondition[] = ["new", "like_new", "excellent", "good", "fair"];
export const FULFILLMENTS: readonly Exclude<MarketplaceFulfillment, "both">[] = ["local_pickup", "shipping"];
export const SORTS = ["newest", "price_asc", "price_desc"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABEL: Record<Sort, string> = {
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

export type BrowseFilters = {
  q: string;
  brand: string;
  condition: MarketplaceCondition | "";
  fulfillment: Exclude<MarketplaceFulfillment, "both"> | "";
  state: string;
  minDollars: number | null;
  maxDollars: number | null;
  sort: Sort;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function dollars(v: string): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? n : null;
}

/** Reads the URL into filters, dropping anything malformed rather than failing the page. */
export function parseBrowseParams(raw: RawParams): BrowseFilters {
  const condition = one(raw.condition);
  const fulfillment = one(raw.fulfillment);
  const sort = one(raw.sort);
  const page = Number.parseInt(one(raw.page), 10);
  let minDollars = dollars(one(raw.min));
  let maxDollars = dollars(one(raw.max));
  if (minDollars !== null && maxDollars !== null && minDollars > maxDollars) {
    [minDollars, maxDollars] = [maxDollars, minDollars];
  }
  return {
    q: one(raw.q).slice(0, 80),
    brand: one(raw.brand).slice(0, 60),
    condition: (CONDITIONS as readonly string[]).includes(condition) ? (condition as MarketplaceCondition) : "",
    fulfillment: (FULFILLMENTS as readonly string[]).includes(fulfillment)
      ? (fulfillment as BrowseFilters["fulfillment"])
      : "",
    state: /^[A-Za-z]{2}$/.test(one(raw.state)) ? one(raw.state).toUpperCase() : "",
    minDollars,
    maxDollars,
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : "newest",
    page: Number.isFinite(page) && page >= 1 && page <= 500 ? page : 1,
  };
}

/** The browse_listings arguments for these filters. */
export function browseArgs(f: BrowseFilters) {
  return {
    p_search: f.q || undefined,
    p_brand: f.brand || undefined,
    p_condition: f.condition || undefined,
    p_fulfillment: f.fulfillment || undefined,
    p_state: f.state || undefined,
    p_min_cents: f.minDollars !== null ? f.minDollars * 100 : undefined,
    p_max_cents: f.maxDollars !== null ? f.maxDollars * 100 : undefined,
    p_sort: f.sort,
    p_limit: PAGE_SIZE,
    p_offset: (f.page - 1) * PAGE_SIZE,
  };
}

/** A /marketplace URL for these filters with some changed — for paging and the view toggle. */
export function browseHref(f: BrowseFilters, change: Partial<BrowseFilters> & { view?: "map" | "list" } = {}): string {
  const next = { ...f, ...change };
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.brand) qs.set("brand", next.brand);
  if (next.condition) qs.set("condition", next.condition);
  if (next.fulfillment) qs.set("fulfillment", next.fulfillment);
  if (next.state) qs.set("state", next.state);
  if (next.minDollars !== null) qs.set("min", String(next.minDollars));
  if (next.maxDollars !== null) qs.set("max", String(next.maxDollars));
  if (next.sort !== "newest") qs.set("sort", next.sort);
  if (next.page > 1) qs.set("page", String(next.page));
  if (change.view === "map") qs.set("view", "map");
  const s = qs.toString();
  return s ? `/marketplace?${s}` : "/marketplace";
}

export function hasActiveFilters(f: BrowseFilters): boolean {
  return !!(f.q || f.brand || f.condition || f.fulfillment || f.state || f.minDollars !== null || f.maxDollars !== null);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

// ─── Price bands (map pins) ─────────────────────────────────────────────────
//
// The same four bands as the app (apps/mobile/src/lib/marketplace/priceBands.ts;
// a test compares the thresholds so the two cannot drift). Pins show the band,
// the tap card shows the exact price — the same split mobile uses.
//
// The colours are the app's own hex values, not web tokens, on purpose: a map
// marker is painted by Google Maps, not by CSS, and pin colours should read the
// same on web and in the app.

export type PriceBand = { key: string; label: string; minCents: number; maxCents: number; color: string };

export const PRICE_BANDS: readonly PriceBand[] = [
  { key: "under_100", label: "Under $100", minCents: 0,     maxCents: 10000,    color: "#2E7D5B" },
  { key: "mid",       label: "$100–199",   minCents: 10000, maxCents: 20000,    color: "#C9A84C" },
  { key: "upper",     label: "$200–299",   minCents: 20000, maxCents: 30000,    color: "#C2410C" },
  { key: "premium",   label: "$300+",      minCents: 30000, maxCents: Infinity, color: "#8A2540" },
];

export function priceBandFor(cents: number): PriceBand {
  return PRICE_BANDS.find((b) => cents >= b.minCents && cents < b.maxCents) ?? PRICE_BANDS[PRICE_BANDS.length - 1];
}

/** Radius that covers the visible map, from its south-west/north-east corners (metres, capped like the RPC). */
export function radiusForBounds(sw: { lat: number; lng: number }, ne: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(ne.lat - sw.lat);
  const dLng = toRad(ne.lng - sw.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(sw.lat)) * Math.cos(toRad(ne.lat)) * Math.sin(dLng / 2) ** 2;
  const diagonal = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.min(Math.max(diagonal / 2, 1_000), 500_000);
}
