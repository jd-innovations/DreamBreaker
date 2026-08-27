// Draft -> `profiles` columns.
//
// Mirror of `draftToProfileFields` in
// `apps/mobile/src/lib/onboarding/finalize.ts`. The maps below exist because the
// keys onboarding collects are NOT all valid column values — writing them raw
// violates CHECK constraints.
//
// ⚠️ **Paired file.** If a mapping changes here, change it there in the same
// commit. Two copies of a CHECK-constraint translation is a drift risk, and the
// zod schema at the bottom is the guard: it validates the outgoing payload
// against the real constraints before anything is written, so drift fails loudly
// at the boundary instead of silently producing a rejected or wrong row.
// Folds into packages/shared when task B1 lands.

import { z } from "zod";
import {
  PLAY_STYLE_KEYS,
  PREFERRED_FORMAT_KEYS,
  PLAY_INTENSITY_KEYS,
} from "@shared/play-profile";
import { AVAILABILITY_OPTIONS } from "./options";
import type { OnboardingDraft, DraftField } from "./draft";

// `profiles.skill_level` CHECK: '2.5-3.0' | '3.0-3.5' | '3.5-4.0' | '4.0-4.5' | '4.5+'
// Bands already matching pass through unchanged.
const SKILL_LEVEL_MAP: Record<string, string> = {
  beginner: "2.5-3.0",
  "2.5-below": "2.5-3.0",
  "4.5-plus": "4.5+",
};

export const SKILL_LEVEL_VALUES = [
  "2.5-3.0",
  "3.0-3.5",
  "3.5-4.0",
  "4.0-4.5",
  "4.5+",
] as const;

function toSkillLevel(selfRating: string | null): string | undefined {
  if (!selfRating) return undefined;
  return SKILL_LEVEL_MAP[selfRating] ?? selfRating;
}

// `profiles.self_rating` is a separate numeric-string column, preferred over the
// coarser band by PAR's initializer and used by the partner finder when `dupr`
// is null. Midpoints match PAR_RATING_SPEC.md's "Initial PAR" table.
//
// Unlike toSkillLevel there is deliberately NO fallthrough — an unknown key
// yields undefined rather than writing a non-numeric string into a numeric
// column.
const SELF_RATING_NUMERIC_MAP: Record<string, string> = {
  beginner: "2.0",
  "2.5-below": "2.4",
  "3.0-3.5": "3.25",
  "3.5-4.0": "3.75",
  "4.0-4.5": "4.25",
  "4.5-plus": "4.75",
};

function toSelfRatingNumeric(selfRating: string | null): string | undefined {
  if (!selfRating) return undefined;
  return SELF_RATING_NUMERIC_MAP[selfRating];
}

// `profiles.hand` CHECK: 'right' | 'left' | 'ambidextrous'.
// Onboarding collects 'right_handed' | 'left_handed' | 'ambidextrous'.
export const HAND_VALUES = ["right", "left", "ambidextrous"] as const;

function toHand(handedness: string | null): string | undefined {
  if (!handedness) return undefined;
  if (handedness === "right_handed") return "right";
  if (handedness === "left_handed") return "left";
  return handedness;
}

function availabilityLabel(key: string): string {
  return AVAILABILITY_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export type ProfileFields = {
  full_name?: string;
  gender?: string;
  hand?: string;
  skill_level?: string;
  self_rating?: string;
  play_style?: string[];
  preferred_formats?: string[];
  play_intensity?: string;
  availability?: string;
  date_of_birth?: string;
  location_city?: string;
  location_state?: string;
  location_lat?: number;
  location_lng?: number;
  story_radius_miles?: number;
  onboarding_intent?: string[];
};

/**
 * Builds the update payload. Only fields the user actually TOUCHED are
 * included — an untouched field is absent, not null, so it is dropped from the
 * PATCH by JSON serialisation and cannot overwrite an existing value.
 *
 * That is the whole anti-clobber mechanism. See draft.ts.
 */
export function draftToProfileFields(
  draft: OnboardingDraft,
  touched: ReadonlySet<DraftField>,
): ProfileFields {
  const out: ProfileFields = {};

  if (touched.has("firstName") || touched.has("lastName")) {
    const fullName = `${draft.firstName} ${draft.lastName}`.trim();
    if (fullName) out.full_name = fullName;
  }

  if (touched.has("gender") && draft.gender) out.gender = draft.gender;

  if (touched.has("handedness")) {
    const hand = toHand(draft.handedness);
    if (hand) out.hand = hand;
  }

  if (touched.has("selfRating")) {
    const skill = toSkillLevel(draft.selfRating);
    const rating = toSelfRatingNumeric(draft.selfRating);
    if (skill) out.skill_level = skill;
    if (rating) out.self_rating = rating;
  }

  // The "playing style" step asks three questions at once — see
  // PLAY_STYLE_VOCABULARY.md. Its keys are already the right keys; they were
  // simply all being written to one column, and only the first of them.
  //
  //   how you play     -> play_style        (text[])
  //   what you play    -> preferred_formats (text[])
  //   how seriously    -> play_intensity    (text, single)
  //
  // Every selection is now kept. This step previously stored `playingStyle[0]`
  // and discarded the other two of the three the user was invited to pick.
  if (touched.has("playingStyle") && draft.playingStyle.length) {
    const styles = draft.playingStyle.filter((k) =>
      (PLAY_STYLE_KEYS as readonly string[]).includes(k),
    );
    const formats = draft.playingStyle.filter((k) =>
      (PREFERRED_FORMAT_KEYS as readonly string[]).includes(k),
    );
    const intensity = draft.playingStyle.find((k) =>
      (PLAY_INTENSITY_KEYS as readonly string[]).includes(k),
    );
    if (styles.length) out.play_style = styles;
    if (formats.length) out.preferred_formats = formats;
    if (intensity) out.play_intensity = intensity;
  }

  // `profiles.availability` is a human-readable summary string, matching how
  // edit-profile's summarizeSchedule writes it. The jsonb availability_schedule
  // grid is deliberately left alone — the shapes do not map cleanly.
  if (touched.has("availability") && draft.availability.length) {
    out.availability = draft.availability.map(availabilityLabel).join(", ");
  }

  if (touched.has("dateOfBirth") && draft.dateOfBirth) {
    out.date_of_birth = draft.dateOfBirth;
  }

  if (touched.has("estimatedCity") && draft.estimatedCity) out.location_city = draft.estimatedCity;
  if (touched.has("estimatedState") && draft.estimatedState) out.location_state = draft.estimatedState;
  if (touched.has("estimatedLat") && draft.estimatedLat != null) out.location_lat = draft.estimatedLat;
  if (touched.has("estimatedLng") && draft.estimatedLng != null) out.location_lng = draft.estimatedLng;

  // NOT NULL DEFAULT 25 — never write a value the user did not choose.
  if (touched.has("searchRadiusMiles") && draft.searchRadiusMiles != null) {
    out.story_radius_miles = draft.searchRadiusMiles;
  }

  if (touched.has("intent") && draft.intent.length) out.onboarding_intent = draft.intent;

  return out;
}

// ─── Payload guard ───────────────────────────────────────────────────────────
//
// Validates against the real database constraints before the write. This is
// schema-boundary validation, not form validation — the form has its own
// validators. It exists so that a drift between this file and its mobile mirror,
// or a new option key added without a mapping, fails here rather than as a
// rejected write or a silently wrong row.

export const profileFieldsSchema = z.object({
  full_name: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  hand: z.enum(HAND_VALUES).optional(),
  skill_level: z.enum(SKILL_LEVEL_VALUES).optional(),
  // Numeric string; the column is numeric downstream.
  self_rating: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  play_style: z.array(z.enum(PLAY_STYLE_KEYS)).min(1).optional(),
  preferred_formats: z.array(z.enum(PREFERRED_FORMAT_KEYS)).min(1).optional(),
  play_intensity: z.enum(PLAY_INTENSITY_KEYS).optional(),
  availability: z.string().min(1).optional(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d < new Date();
    }, "date of birth must be a valid past date")
    .optional(),
  location_city: z.string().min(1).optional(),
  location_state: z.string().min(1).optional(),
  location_lat: z.number().min(-90).max(90).optional(),
  location_lng: z.number().min(-180).max(180).optional(),
  story_radius_miles: z.number().int().positive().optional(),
  onboarding_intent: z.array(z.string().min(1)).min(1).optional(),
});

export type ValidatedProfileFields = z.infer<typeof profileFieldsSchema>;
