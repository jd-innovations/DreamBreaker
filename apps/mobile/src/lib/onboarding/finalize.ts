import { getSession, signUp } from '@/lib/auth';
import { updateProfile } from '@/lib/services/profile';
import { AVAILABILITY_OPTIONS } from './mockData';
import type { OnboardingDraft } from './state';

// self_rating option keys collected during onboarding don't all match
// profiles.skill_level's CHECK constraint values — translate the ones that
// differ; already-valid bands pass through unchanged.
const SKILL_LEVEL_MAP: Record<string, string> = {
  beginner: '2.5-3.0',
  '2.5-below': '2.5-3.0',
  '4.5-plus': '4.5+',
};

function toSkillLevel(selfRating: string | null): string | undefined {
  if (!selfRating) return undefined;
  return SKILL_LEVEL_MAP[selfRating] ?? selfRating;
}

// profiles.self_rating is a separate numeric-string column (CHECK'd
// downstream by par_v1_foundation.sql's initializer, which prefers it over
// the coarser skill_level band) and is what useFinderCandidates.ts falls
// back to for compatibility scoring when dupr is null. Map each onboarding
// band to its midpoint, matching PAR_RATING_SPEC.md's "Initial PAR" table.
const SELF_RATING_NUMERIC_MAP: Record<string, string> = {
  beginner: '2.0',
  '2.5-below': '2.4',
  '3.0-3.5': '3.25',
  '3.5-4.0': '3.75',
  '4.0-4.5': '4.25',
  '4.5-plus': '4.75',
};

function toSelfRatingNumeric(selfRating: string | null): string | undefined {
  if (!selfRating) return undefined;
  return SELF_RATING_NUMERIC_MAP[selfRating];
}

// profiles.hand's CHECK constraint uses 'right'/'left'/'ambidextrous';
// onboarding's handedness options are 'right_handed'/'left_handed'/'ambidextrous'.
function toHand(handedness: string | null): string | undefined {
  if (!handedness) return undefined;
  if (handedness === 'right_handed') return 'right';
  if (handedness === 'left_handed') return 'left';
  return handedness;
}

function availabilityLabel(key: string): string {
  return AVAILABILITY_OPTIONS.find(o => o.key === key)?.label ?? key;
}

// Maps the local onboarding draft to real `profiles` column values (minus
// full_name, handled separately by callers). Single source of truth for
// both the OAuth path (authenticated UPDATE) and the email path (values
// ride into raw_user_meta_data at signUp() — see fn_handle_new_user() in
// migration 20260805000000).
function draftToProfileFields(draft: OnboardingDraft) {
  return {
    avatar_url: draft.avatarUrl ?? undefined,
    gender: draft.gender ?? undefined,
    hand: toHand(draft.handedness),
    skill_level: toSkillLevel(draft.selfRating),
    self_rating: toSelfRatingNumeric(draft.selfRating),
    // Onboarding collects up to PLAYING_STYLE_MAX styles; profiles.play_style
    // is a single free-text value used elsewhere as one tag — store the top
    // choice, matching DATA_GAPS.md's documented tradeoff.
    play_style: draft.playingStyle[0] ?? undefined,
    // profiles.availability is a human-readable summary string (see
    // edit-profile.tsx's summarizeSchedule); onboarding's tag list doesn't
    // map cleanly onto the day/block availability_schedule grid, so store a
    // readable join here and leave availability_schedule for a later pass.
    availability: draft.availability.length ? draft.availability.map(availabilityLabel).join(', ') : undefined,
    date_of_birth: draft.dateOfBirth ?? undefined,
    home_court_id: draft.homeCourt?.id ?? undefined,
    location_city: draft.estimatedCity ?? undefined,
    location_state: draft.estimatedState ?? undefined,
    location_lat: draft.estimatedLat ?? undefined,
    location_lng: draft.estimatedLng ?? undefined,
    story_radius_miles: draft.searchRadiusMiles,
    onboarding_intent: draft.intent.length ? draft.intent : undefined,
  };
}

export type FinalizeOnboardingResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; error: string };

// Called once, at the true end of onboarding (all-set.tsx's CTA). Writes
// every collected draft field to Supabase:
//  - OAuth (Google/Apple) already has a live session from create-account.tsx
//    -> authenticated UPDATE via updateProfile().
//  - Email/password has no session yet (confirmation required, see
//    supabase/config.toml) -> the fields ride into signUp()'s metadata and
//    the DB trigger writes them atomically with account creation.
export async function finalizeOnboarding(draft: OnboardingDraft): Promise<FinalizeOnboardingResult> {
  const fullName = `${draft.firstName} ${draft.lastName}`.trim();
  const fields = draftToProfileFields(draft);

  try {
    const session = await getSession();

    if (session?.user) {
      await updateProfile(session.user.id, { ...fields, full_name: fullName || undefined });
      return { ok: true, needsEmailConfirmation: false };
    }

    if (!draft.profileEmail || !draft.emailPassword) {
      // Apple Sign-In's button is currently a no-op stub (see
      // TASK_GOOGLE_SIGNIN.md open question #2) — a user who picks it never
      // gets a session or fills in email/password, so they land here.
      if (draft.authMethod === 'apple') {
        return { ok: false, error: "Apple Sign-In isn't available yet. Please go back and choose Google or Email to finish creating your account." };
      }
      return { ok: false, error: 'Missing account details. Please go back and enter your email and password.' };
    }

    await signUp(draft.profileEmail, draft.emailPassword, fullName, fields);
    return { ok: true, needsEmailConfirmation: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong. Please try again.' };
  }
}
