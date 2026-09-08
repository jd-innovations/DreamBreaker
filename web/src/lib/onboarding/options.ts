// Onboarding option lists for web.
//
// Mirror of `apps/mobile/src/lib/onboarding/mockData.ts` (plus the gender and
// handedness lists, which live locally in
// `apps/mobile/src/app/onboarding/gender.tsx` — the GENDER_OPTIONS export in
// mockData.ts is a stale 4-key list nothing uses).
//
// Ported rather than imported: there is no shared workspace yet (task B1 in
// WEB_MOBILE_ALIGNMENT_PLAN.md), web's tsconfig excludes everything outside
// `src`, and the mobile file's `icon` values are Ionicons glyph names, which
// mean nothing to Phosphor. Icons are remapped below.
//
// ⚠️ **The `key` values are database values.** They are translated by
// transform.ts into `profiles` columns that carry CHECK constraints, and
// AVAILABILITY_OPTIONS' *labels* are written verbatim into `profiles.availability`.
// If you change a key or an availability label here, change it in the mobile
// file in the same commit, or the two platforms will write different rows for
// the same answer.

import {
  Lightning, Smiley, Users, Trophy, TrendUp, ArrowsClockwise,
  UsersThree, Person, PersonSimple, Briefcase, Sun, CloudSun,
  Moon, CloudMoon, MapPin, UserPlus, HandPointing, ArrowsLeftRight,
  type Icon,
} from "@phosphor-icons/react";

export type Option<K extends string = string> = {
  key: K;
  label: string;
  icon?: Icon;
};

// ─── Skill band ──────────────────────────────────────────────────────────────
// Not all of these are valid `profiles.skill_level` values — transform.ts maps
// the ones that differ.

export const SELF_RATING_OPTIONS: Option[] = [
  { key: "beginner", label: "Beginner" },
  { key: "2.5-below", label: "2.5 & Below" },
  { key: "3.0-3.5", label: "3.0-3.5" },
  { key: "3.5-4.0", label: "3.5-4.0" },
  { key: "4.0-4.5", label: "4.0-4.5" },
  { key: "4.5-plus", label: "4.5+" },
];

// ─── Gender ──────────────────────────────────────────────────────────────────

export const GENDER_OPTIONS: Option[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "prefer_not_to_say", label: "Prefer not to say" },
];

// ─── Handedness ──────────────────────────────────────────────────────────────
// Keys differ from `profiles.hand`'s CHECK values — transform.ts translates.

export const HANDEDNESS_OPTIONS: Option[] = [
  { key: "right_handed", label: "Right handed", icon: HandPointing },
  { key: "left_handed", label: "Left handed", icon: HandPointing },
  { key: "ambidextrous", label: "Ambidextrous", icon: ArrowsLeftRight },
];

// ─── Playing style ───────────────────────────────────────────────────────────

export const PLAYING_STYLE_MAX = 3;

export const PLAYING_STYLE_OPTIONS: Option[] = [
  { key: "competitive", label: "Competitive", icon: Lightning },
  { key: "recreational", label: "Recreational", icon: Smiley },
  { key: "social", label: "Social", icon: Users },
  { key: "tournament_play", label: "Tournament Play", icon: Trophy },
  { key: "ladder", label: "Ladder", icon: TrendUp },
  { key: "round_robin", label: "Round Robin", icon: ArrowsClockwise },
  { key: "mixed_doubles", label: "Mixed Doubles", icon: UsersThree },
  { key: "mens_doubles", label: "Men's Doubles", icon: Person },
  { key: "womens_doubles", label: "Women's Doubles", icon: PersonSimple },
  { key: "singles", label: "Singles", icon: Person },
];

// ─── Availability ────────────────────────────────────────────────────────────
// ⚠️ These LABELS are joined and written into `profiles.availability`. Rewording
// one changes stored data.

export const AVAILABILITY_OPTIONS: Option[] = [
  { key: "weekdays", label: "Weekdays", icon: Briefcase },
  { key: "weekends", label: "Weekends", icon: Sun },
  { key: "mornings", label: "Mornings", icon: CloudSun },
  { key: "afternoons", label: "Afternoons", icon: Sun },
  { key: "evenings", label: "Evenings", icon: Moon },
  { key: "nights", label: "Nights", icon: CloudMoon },
];

// ─── Intent ──────────────────────────────────────────────────────────────────
// Written as a text[] into `profiles.onboarding_intent`.

export const INTENT_OPTIONS: Option[] = [
  { key: "find_partners", label: "Find Playing Partners", icon: Users },
  { key: "find_community", label: "Find Community Play", icon: UsersThree },
  { key: "play_tournaments", label: "Play Tournaments", icon: Trophy },
  { key: "discover_courts", label: "Discover Courts", icon: MapPin },
  { key: "join_groups", label: "Join Groups", icon: UserPlus },
  { key: "meet_players", label: "Meet Local Players", icon: Smiley },
];

// ─── Search radius ───────────────────────────────────────────────────────────
// `profiles.story_radius_miles` is `integer NOT NULL DEFAULT 25`. Note the
// column default is 25 while mobile's draft default is 15 — see draft.ts on why
// an untouched value must never be written.

export const RADIUS_OPTIONS = [5, 15, 30, 50] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];
