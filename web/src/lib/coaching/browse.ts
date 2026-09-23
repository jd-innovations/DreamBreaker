// Public coach-offer discovery — /lessons and /lessons/[id].
//
// Reads browse_coach_offers / coach_offer_map_pins / coach_offer_detail
// (20260923300000), all callable signed out. Those functions decide what a
// visitor may see; this module only shapes it for the page, exactly as
// lib/marketplace/browse.ts does for listings.
//
// The route is /lessons to match the app, so a link shared from either side
// lands in the same place.

import { createClient } from "@/lib/supabase/client";

export const OFFER_PAGE_SIZE = 24;

/** Mirrors the coach_offer_type enum, in the order a browser thinks about it. */
export const OFFER_TYPES = [
  { value: "", label: "All types" },
  { value: "private", label: "Private lesson" },
  { value: "semi_private", label: "Semi-private" },
  { value: "group_clinic", label: "Group clinic" },
  { value: "camp", label: "Camp" },
  { value: "package", label: "Package" },
] as const;

export const OFFER_SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
] as const;

export const OFFER_TYPE_LABEL: Record<string, string> =
  Object.fromEntries(OFFER_TYPES.filter((t) => t.value).map((t) => [t.value, t.label]));

export interface OfferCard {
  id: string;
  title: string;
  offer_type: string;
  description: string | null;
  skill_level_label: string | null;
  duration_minutes: number | null;
  max_participants: number | null;
  lessons_included: number | null;
  regular_price_cents: number;
  discounted_price_cents: number | null;
  premium_only: boolean;
  premium_price_cents: number | null;
  quantity_remaining: number | null;
  coach_id: string;
  coach_name: string | null;
  coach_handle: string | null;
  coach_avatar_url: string | null;
  facility_id: string | null;
  facility_name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_url: string | null;
  created_at: string;
  total_count: number;
}

export interface OfferDetail extends Omit<OfferCard, "total_count" | "created_at"> {
  terms: string | null;
  purchase_limit_per_customer: number | null;
  status: string;
  coach_bio: string | null;
  facility_address: string | null;
}

export interface MapPin {
  facility_id: string;
  facility_name: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  offer_count: number;
  min_price_cents: number | null;
}

export interface OfferFilters {
  search: string;
  type: string;
  city: string;
  sort: string;
  page: number;
}

export const EMPTY_FILTERS: OfferFilters = { search: "", type: "", city: "", sort: "newest", page: 1 };

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export async function fetchOffers(f: OfferFilters): Promise<Result<OfferCard[]>> {
  const { data, error } = await createClient().rpc("browse_coach_offers", {
    p_search: f.search.trim() || undefined,
    p_offer_type: f.type || undefined,
    p_city: f.city.trim() || undefined,
    p_sort: f.sort || "newest",
    p_limit: OFFER_PAGE_SIZE,
    p_offset: (Math.max(f.page, 1) - 1) * OFFER_PAGE_SIZE,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []) as OfferCard[] };
}

export async function fetchOfferDetail(id: string): Promise<Result<OfferDetail | null>> {
  const { data, error } = await createClient().rpc("coach_offer_detail", { p_id: id });
  if (error) return { ok: false, message: error.message };
  const row = (data ?? [])[0];
  return { ok: true, data: (row as OfferDetail) ?? null };
}

export async function fetchOfferMapPins(
  lat: number, lng: number, radiusMeters: number,
): Promise<Result<MapPin[]>> {
  const { data, error } = await createClient().rpc("coach_offer_map_pins", {
    p_lat: lat, p_lng: lng, p_radius_meters: radiusMeters,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: (data ?? []) as MapPin[] };
}

// ─── Presentation helpers (pure — these are what the tests cover) ───────────

/**
 * What a visitor pays today, and what it was before.
 *
 * Deliberately NOT the member price: most visitors are not members, and a
 * headline nobody can pay is a bait price. The member price travels separately
 * so the page can show it as a benefit — the same order the app uses while
 * browsing.
 */
export function publicPrice(o: Pick<OfferCard, "regular_price_cents" | "discounted_price_cents">): {
  cents: number;
  wasCents: number | null;
} {
  const discounted = o.discounted_price_cents;
  if (discounted != null && discounted < o.regular_price_cents) {
    return { cents: discounted, wasCents: o.regular_price_cents };
  }
  return { cents: o.regular_price_cents, wasCents: null };
}

/** 4500 -> "$45", 4550 -> "$45.50". Whole dollars read better on a card. */
export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return "";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

/** The saving, when there is one worth mentioning. */
export function discountPercent(
  o: Pick<OfferCard, "regular_price_cents" | "discounted_price_cents">,
): number | null {
  const d = o.discounted_price_cents;
  if (d == null || d >= o.regular_price_cents || o.regular_price_cents <= 0) return null;
  const pct = Math.round(((o.regular_price_cents - d) / o.regular_price_cents) * 100);
  return pct > 0 ? pct : null;
}

/** "60 min · up to 4 players · 3 lessons" — only the parts that exist. */
export function offerMeta(o: Pick<OfferCard,
  "duration_minutes" | "max_participants" | "lessons_included">): string {
  const parts: string[] = [];
  if (o.duration_minutes) parts.push(`${o.duration_minutes} min`);
  if (o.max_participants && o.max_participants > 1) parts.push(`up to ${o.max_participants} players`);
  if (o.lessons_included && o.lessons_included > 1) parts.push(`${o.lessons_included} lessons`);
  return parts.join(" · ");
}

/** "Suncoast Courts · Sarasota, FL", skipping whatever is missing. */
export function placeLabel(o: Pick<OfferCard, "facility_name" | "city" | "state">): string {
  const where = [o.city, o.state].filter(Boolean).join(", ");
  return [o.facility_name, where].filter(Boolean).join(" · ");
}

/** Cards have no photo for most offers; this is the typographic stand-in. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Builds a /lessons URL that survives a refresh and a share. */
export function browseHref(f: OfferFilters, overrides: Partial<OfferFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const qs = new URLSearchParams();
  if (merged.search.trim()) qs.set("q", merged.search.trim());
  if (merged.type) qs.set("type", merged.type);
  if (merged.city.trim()) qs.set("city", merged.city.trim());
  if (merged.sort && merged.sort !== "newest") qs.set("sort", merged.sort);
  if (merged.page > 1) qs.set("page", String(merged.page));
  const s = qs.toString();
  return s ? `/lessons?${s}` : "/lessons";
}

/** The inverse, for reading filters back off the URL. */
export function filtersFromParams(params: URLSearchParams | Record<string, string | undefined>): OfferFilters {
  const get = (k: string) =>
    params instanceof URLSearchParams ? (params.get(k) ?? "") : (params[k] ?? "");
  const page = Number(get("page"));
  return {
    search: get("q"),
    type: get("type"),
    city: get("city"),
    sort: get("sort") || "newest",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}
