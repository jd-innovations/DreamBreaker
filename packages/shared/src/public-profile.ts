import {
  normalizeSchedule, isScheduleEmpty, scheduleOverlap, describeOverlap, summarizeSchedule,
  type AvailabilitySchedule,
} from "./availability";
import { distanceMilesOrNull, type LatLng } from "./geo";
import { computeMatch } from "./match";
import {
  playStyleSummary, preferredFormatLabel, playIntensityLabel,
  lookingStatusLabel, genderLabel, handLabel,
} from "./play-profile";

/**
 * What a public player profile IS — one definition, both platforms.
 *
 * Three screens used to answer this question separately: mobile's
 * match/profile/[id], mobile's players/[id] and web's profile/[id]. Each picked
 * its own columns, so a player's profile changed depending on which link was
 * tapped: one showed availability and no action bar, another the reverse, the
 * third neither. Every fix had to be made two or three times, and twice it was
 * made once.
 *
 * ── What is shared, and what is not ─────────────────────────────────────────
 *
 * Shared: the column list, the row shapes, and `buildPublicProfile()` — the
 * derivation from raw rows to the thing a screen renders.
 *
 * NOT shared: the queries. Mobile and web construct Supabase clients
 * differently, and typing one generically here would mean either `any` or a
 * dependency this package should not have. Each platform runs its own fetch
 * using PUBLIC_PROFILE_COLUMNS and hands the rows to buildPublicProfile().
 * The definition is what has to agree; the plumbing does not.
 *
 * This file imports no client, no React and no platform API. It is pure, which
 * is why it can be tested.
 */

// ─── The canonical column list ───────────────────────────────────────────────
//
// `email` and `date_of_birth` are deliberately absent: profiles RLS permits
// reading every row, so they are not in the client grant at all (20260921150000).
// Age comes from the profile_age() RPC instead.
export const PUBLIC_PROFILE_COLUMNS = [
  "id", "full_name", "handle", "avatar_url", "bio",
  "dupr", "dupr_verified", "self_rating", "skill_level",
  "play_style", "preferred_formats", "play_intensity",
  "availability", "availability_schedule",
  "location_city", "location_state", "location_lat", "location_lng",
  "looking_status", "gender", "hand", "home_court_id",
].join(", ");

/** Same list plus the home-court join. Postgrest embed syntax, so it is separate. */
export const PUBLIC_PROFILE_SELECT =
  `${PUBLIC_PROFILE_COLUMNS}, facilities:home_court_id(name, city, state)`;

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type PublicProfileRow = {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  dupr: number | null;
  dupr_verified: boolean | null;
  self_rating: string | null;
  skill_level: string | null;
  play_style: string[] | null;
  preferred_formats: string[] | null;
  play_intensity: string | null;
  availability: string | null;
  availability_schedule: unknown;
  location_city: string | null;
  location_state: string | null;
  location_lat: number | null;
  location_lng: number | null;
  looking_status: string | null;
  gender: string | null;
  hand: string | null;
  home_court_id: string | null;
  facilities?: { name: string; city: string | null; state: string | null } | null;
};

/** The person looking. Null when signed out — everything relational then hides. */
export type ProfileViewer = {
  id: string;
  dupr: number | null;
  availability_schedule: unknown;
  location_lat: number | null;
  location_lng: number | null;
} | null;

export type ProfileRelationship = "self" | "connected" | "pending" | "none";

export type ProfileActivityItem = { name: string; date: string; kind: "tournament" | "community" };
export type ProfileGroup = { name: string; role: string };
export type ProfileListing = { id: string; title: string; priceCents: number; photo: string | null };

/**
 * Reviews are gated platform-wide, and the gate is a product decision rather
 * than a missing feature: `reviews_display_enabled` is false and
 * `reviews_display_min_count` is 3, because "one opinion is not an average"
 * (20260901070000). Pass what the settings say; buildPublicProfile applies it.
 */
export type ReviewSummary = {
  displayEnabled: boolean;
  minCount: number;
  averageRating: number | null;
  reviewCount: number;
};

export type BuildPublicProfileInput = {
  row: PublicProfileRow;
  viewer: ProfileViewer;
  relationship: ProfileRelationship;
  age: number | null;
  connectionCount: number;
  eventsPlayed: number;
  partnersPlayed: number;
  activity: ProfileActivityItem[];
  groups: ProfileGroup[];
  listings: ProfileListing[];
  reviews?: ReviewSummary;
};

// ─── Output ──────────────────────────────────────────────────────────────────

export type ProfileStat = { key: string; label: string; value: string };

export type PublicProfile = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string | null;

  ratingValue: number;
  ratingSource: "dupr" | "self" | "none";
  duprVerified: boolean;
  skillBand: string | null;

  location: string | null;
  /** Miles from the viewer, or null when either side has no coordinates. */
  distanceMi: number | null;

  /** All pre-labelled — a screen should never see a raw enum. */
  lookingFor: string | null;
  gender: string | null;
  hand: string | null;
  playStyle: string | null;
  intensity: string | null;
  formats: string[];
  homeCourt: string | null;

  /** Shared slots when the viewer has a schedule, else this player's own. */
  availabilityLabel: string | null;
  availabilityIsShared: boolean;

  matchPct: number | null;
  relationship: ProfileRelationship;

  stats: ProfileStat[];
  activity: ProfileActivityItem[];
  groups: ProfileGroup[];
  listings: ProfileListing[];
};

// ─── Derivation ──────────────────────────────────────────────────────────────

function resolveRating(dupr: number | null, selfRating: string | null) {
  if (dupr != null) return { value: dupr, source: "dupr" as const };
  const n = selfRating ? Number.parseFloat(selfRating) : Number.NaN;
  if (Number.isFinite(n)) return { value: n, source: "self" as const };
  return { value: 0, source: "none" as const };
}

export function buildPublicProfile(input: BuildPublicProfileInput): PublicProfile {
  const { row, viewer, relationship } = input;

  const rating = resolveRating(row.dupr, row.self_rating);

  const distanceMi = distanceMilesOrNull(
    viewer && viewer.location_lat != null && viewer.location_lng != null
      ? ({ lat: viewer.location_lat, lng: viewer.location_lng } as LatLng)
      : null,
    { lat: row.location_lat, lng: row.location_lng },
  );

  // Prefer what the two of you SHARE. "Both free Wednesday evenings" is a
  // reason to message someone; "Wed, Sat" is a fact about a stranger.
  const theirs = normalizeSchedule(row.availability_schedule);
  const mine = normalizeSchedule(viewer?.availability_schedule);
  const overlap = isScheduleEmpty(mine) ? [] : scheduleOverlap(mine, theirs);
  const sharedLabel = overlap.length > 0 ? describeOverlap(overlap) : null;
  const ownLabel = isScheduleEmpty(theirs) ? null : summarizeSchedule(theirs);

  // No match percentage against yourself, or with nobody to compare to.
  const matchPct = viewer && relationship !== "self"
    ? computeMatch(
      { dupr: rating.source === "none" ? null : rating.value, schedule: theirs, distanceMi },
      { dupr: viewer.dupr, schedule: mine },
    ).pct
    : null;

  // Stats. Each cell is included only when it has something to say — a grid of
  // dashes invites the question "why is this empty", which was the reason
  // "Medals Won" came out.
  const stats: ProfileStat[] = [
    { key: "events", label: "Events Played", value: String(input.eventsPlayed) },
    { key: "partners", label: "Partners Played", value: String(input.partnersPlayed) },
  ];
  if (matchPct != null) stats.push({ key: "match", label: "Match", value: `${matchPct}%` });
  else stats.push({ key: "connections", label: "Connections", value: String(input.connectionCount) });

  const r = input.reviews;
  if (r && r.displayEnabled && r.reviewCount >= r.minCount && r.averageRating != null) {
    stats.push({
      key: "reviews",
      label: `Reviews (${r.reviewCount})`,
      value: r.averageRating.toFixed(1),
    });
  }

  return {
    id: row.id,
    name: row.full_name?.trim() || "Unnamed player",
    handle: row.handle,
    avatarUrl: row.avatar_url,
    bio: row.bio?.trim() || null,

    ratingValue: rating.value,
    ratingSource: rating.source,
    duprVerified: row.dupr_verified === true,
    skillBand: row.skill_level?.trim() || null,

    location: [row.location_city, row.location_state].filter(Boolean).join(", ") || null,
    distanceMi,

    lookingFor: lookingStatusLabel(row.looking_status),
    gender: genderLabel(row.gender),
    hand: handLabel(row.hand),
    playStyle: playStyleSummary(row.play_style),
    intensity: row.play_intensity ? playIntensityLabel(row.play_intensity) : null,
    formats: (row.preferred_formats ?? []).map(preferredFormatLabel),
    homeCourt: row.facilities?.name ?? null,

    availabilityLabel: sharedLabel ?? ownLabel,
    availabilityIsShared: !!sharedLabel,

    matchPct,
    relationship,

    stats,
    // Newest first, capped: a profile, not a history screen.
    activity: [...input.activity].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    groups: input.groups,
    listings: input.listings,
  };
}

/** The schedule a viewer carries, normalized once for callers that need it. */
export function viewerSchedule(viewer: ProfileViewer): AvailabilitySchedule {
  return normalizeSchedule(viewer?.availability_schedule);
}
