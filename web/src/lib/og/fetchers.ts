import { ogClient } from "./client";
import type { OgPayload } from "./types";

// Every fetcher returns `null` for anything that should not get a real
// preview: not found, wrong id shape, or a row RLS hides from an anonymous
// reader (draft/pending/cancelled tournament, cancelled community event,
// inactive marketplace listing, private group, non-coach profile). Callers
// render the safe generic fallback in that case — see buildEntityMetadata and
// the /api/og route. This is deliberate: a `null` here must never be
// distinguishable, in what a crawler ultimately sees, from "this entity
// exists but I chose not to describe it."

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// `start_time` is `time without time zone` -- "18:00:00". Parsed by hand for
// the same reason fmtDate splits the date string: handing either to `new
// Date(str)` invites a timezone shift, and this renders on a server whose zone
// has nothing to do with the venue's.
function fmtTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const [h, min] = timeStr.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return "";
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return min === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(min).padStart(2, "0")} ${suffix}`;
}

// A skill range shown the way players say it. One-sided ranges are common --
// "3.0+" for a floor with no ceiling -- so this is not just min + "-" + max.
function fmtSkill(min: number | null | undefined, max: number | null | undefined): string {
  const lo = typeof min === "number" ? min.toFixed(1) : null;
  const hi = typeof max === "number" ? max.toFixed(1) : null;
  if (lo && hi) return lo === hi ? lo : `${lo}–${hi}`;
  if (lo) return `${lo}+`;
  if (hi) return `Up to ${hi}`;
  return "";
}

function joinParts(parts: Array<string | null | undefined>, sep = " · "): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join(sep);
}

export async function fetchTournamentOg(id: string): Promise<OgPayload | null> {
  if (!isUuid(id)) return null;
  const { data } = await ogClient()
    .from("tournaments")
    .select("id, name, event_date, venue_name, city, state, cover_img_url, description")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const location = joinParts([data.venue_name, data.city && data.state ? `${data.city}, ${data.state}` : data.city ?? data.state]);
  return {
    entityType: "tournament",
    id,
    title: data.name,
    description: data.description?.trim() || `Pickleball tournament${location ? ` in ${location}` : ""}. Compete, hold your spot, and earn your rank.`,
    imageUrl: data.cover_img_url,
    detailLine: joinParts([fmtDate(data.event_date), location]),
    ogType: "website",
  };
}

const COMMUNITY_TYPE_LABEL: Record<string, string> = {
  open_play: "Quick Game",
  round_robin: "Round Robin",
  mini_tournament: "Mini Tournament",
  clinic: "Clinic",
};

export async function fetchCommunityEventOg(id: string): Promise<OgPayload | null> {
  if (!isUuid(id)) return null;
  const { data } = await ogClient()
    .from("play_events")
    .select("id, name, event_date, start_time, skill_min, skill_max, max_players, venue_name, location, city, state, cover_url, event_type, notes")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const label = COMMUNITY_TYPE_LABEL[data.event_type] ?? "Game";
  const venue = data.venue_name ?? data.location;
  const location = joinParts([venue, data.city && data.state ? `${data.city}, ${data.state}` : data.city ?? data.state]);

  // When and where it is, then who it is for. start_time, skill_min/max and
  // max_players all existed on play_events from the start and none of them
  // were ever selected, so a shared open-play session announced a date and a
  // venue but not the hour -- the one fact that decides whether someone can
  // come. Every part is optional and joinParts drops the blanks, so an event
  // with no time or no skill range still reads as a clean line.
  const when = joinParts([fmtDate(data.event_date), fmtTime(data.start_time)]);
  const skill = fmtSkill(data.skill_min, data.skill_max);
  const players = typeof data.max_players === "number" && data.max_players > 0
    ? `Up to ${data.max_players} players`
    : "";
  return {
    entityType: "community",
    id,
    title: data.name || label,
    description: data.notes?.trim() || `Join this ${label.toLowerCase()} on Pickleball App${location ? ` at ${location}` : ""}.`,
    imageUrl: data.cover_url,
    detailLine: joinParts([label, when, skill, players, location]),
    ogType: "website",
  };
}

export async function fetchMarketplaceListingOg(id: string): Promise<OgPayload | null> {
  if (!isUuid(id)) return null;
  const client = ogClient();
  const { data } = await client
    .from("marketplace_listings")
    .select("id, title, description, asking_price_cents, location_city, location_state, status")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;

  const { data: photo } = await client
    .from("marketplace_listing_photos")
    .select("url")
    .eq("listing_id", id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const price = `$${(data.asking_price_cents / 100).toFixed(0)}`;
  const location = joinParts([data.location_city, data.location_state]);
  return {
    entityType: "marketplace",
    id,
    title: data.title,
    description: data.description?.trim() || `${price} on Pickleball App Marketplace${location ? ` · ${location}` : ""}.`,
    imageUrl: photo?.url ?? null,
    detailLine: joinParts([price, location]),
    ogType: "website",
  };
}

export async function fetchGroupOg(id: string): Promise<OgPayload | null> {
  if (!isUuid(id)) return null;
  const { data } = await ogClient()
    .from("groups")
    .select("id, name, description, image_url, location, privacy")
    .eq("id", id)
    .eq("privacy", "public")
    .maybeSingle();
  if (!data) return null;

  return {
    entityType: "group",
    id,
    title: data.name,
    description: data.description?.trim() || `Join "${data.name}" on Pickleball App.`,
    imageUrl: data.image_url,
    detailLine: data.location ?? null,
    ogType: "website",
  };
}

// Only the anon-granted column subset (see
// 20260825120000_restrict_anon_profile_columns.sql) — never select('*'), and
// is_coach is enforced both here and by that migration's own filter intent.
// A non-coach profile id (or any id that isn't a real coach) returns null,
// same as "not found" — a coach share link must never confirm or deny that an
// arbitrary user id exists.
export async function fetchCoachOg(id: string): Promise<OgPayload | null> {
  if (!isUuid(id)) return null;
  const { data } = await ogClient()
    .from("profiles")
    .select("id, full_name, avatar_url, cover_url, bio, location_city, location_state, is_coach")
    .eq("id", id)
    .eq("is_coach", true)
    .maybeSingle();
  if (!data) return null;

  const location = joinParts([data.location_city, data.location_state]);
  return {
    entityType: "coach",
    id,
    title: data.full_name ?? "Coach",
    description: data.bio?.trim() || `${data.full_name ?? "This coach"} coaches on Pickleball App${location ? ` · ${location}` : ""}.`,
    imageUrl: data.cover_url ?? data.avatar_url,
    detailLine: location || null,
    ogType: "profile",
  };
}

export async function fetchFacilityOg(id: string): Promise<OgPayload | null> {
  if (!isUuid(id)) return null;
  const client = ogClient();
  const { data } = await client
    .from("facilities")
    .select("id, name, city, state, description")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const { data: photo } = await client
    .from("facility_photos")
    .select("url")
    .eq("facility_id", id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const location = joinParts([data.city, data.state]);
  return {
    entityType: "facility",
    id,
    title: data.name,
    description: data.description?.trim() || `Pickleball courts on Pickleball App${location ? ` · ${location}` : ""}.`,
    imageUrl: photo?.url ?? null,
    detailLine: location || null,
    ogType: "website",
  };
}

export async function fetchOgPayload(entityType: OgPayload["entityType"], id: string): Promise<OgPayload | null> {
  switch (entityType) {
    case "tournament": return fetchTournamentOg(id);
    case "community": return fetchCommunityEventOg(id);
    case "marketplace": return fetchMarketplaceListingOg(id);
    case "group": return fetchGroupOg(id);
    case "coach": return fetchCoachOg(id);
    case "facility": return fetchFacilityOg(id);
  }
}
