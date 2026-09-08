# Onboarding — DB wiring status

> Updated 2026-08-05 — this flow is now wired to Supabase. See
> `apps/mobile/src/lib/onboarding/finalize.ts` (the single mapping from
> `OnboardingDraft` to real `profiles` columns) and migration
> `20260805000000_onboarding_profile_fields.sql`.

## Resolved

- `profiles.gender text` and `profiles.onboarding_intent text[]` — added in
  `20260805000000_onboarding_profile_fields.sql`. Written via `finalize.ts`.
- **Home-court relationship (screens 7–8)** — this doc previously said no FK
  existed. That was wrong: `profiles.home_court_id uuid references
  facilities(id)` already existed in the baseline schema. `finalize.ts`
  writes `draft.homeCourt?.id` to it directly; no migration was needed.
- **`play_style` shape conflict** — decided: `finalize.ts` stores only
  `draft.playingStyle[0]` (top pick) in the existing single-value column,
  matching how `edit-profile.tsx`/`useFinderCandidates.ts` already treat
  `play_style` as one tag. The other selected styles are currently dropped —
  revisit only if the product wants to surface all of them somewhere.
- **`availability`** — decided: `finalize.ts` stores a human-readable join of
  the selected tags (e.g. "Weekdays, Evenings") in the existing single-value
  `availability` text column, matching how `edit-profile.tsx` populates it
  via `summarizeSchedule()`. Onboarding's tag list (`weekdays`/`mornings`/...)
  does **not** get converted into the day-by-day `availability_schedule`
  jsonb grid — the shapes don't map cleanly onto each other without
  inventing a mapping, so `availability_schedule` stays untouched by
  onboarding. Revisit if the grid ever needs to reflect onboarding answers.
- **`selfRating`/`handedness` key mismatches** — onboarding's option keys
  (`beginner`, `2.5-below`, `4.5-plus`, `right_handed`, `left_handed`) don't
  match the `skill_level`/`hand` CHECK constraints (`2.5-3.0`...`4.5+`,
  `right`/`left`/`ambidextrous`). `finalize.ts` translates them; writing the
  raw draft values directly would have violated the CHECK constraints.
- **"Add my court later" (`addCourtLater`, screen 7)** — decided: no
  `suggestFacility()` call. That function requires a full facility form
  (name, address, lat/lng, etc.) that onboarding never collects at this
  step — `addCourtLater` just means the user skipped picking one, so there
  is nothing yet to submit. `home_court_id` stays null; the user can set a
  home court later from Edit Profile. Note `suggestFacility()` itself is
  currently unused anywhere in the app (not just onboarding) — no screen
  calls it, including `FacilityPicker`'s "enter manually" fallback, which
  only stores a local manual value, not a `facilities` row. That's a
  pre-existing gap, out of scope here.
- `full_name`, `date_of_birth`, `avatar_url` (falls back Google's `picture`
  key if `avatar_url` isn't set), `location_city/state/lat/lng`,
  `story_radius_miles` — all written as-is.

## Still open

- **Screen 14 activity level** — unchanged, see below.
- **OAuth users still see every onboarding screen** — no skip logic was
  added for fields Google already provides (name, avatar). Decided to leave
  as-is: screens pre-fill from OAuth metadata and let the user edit/confirm
  rather than silently skipping, which seemed like the safer UX default.
  Revisit if that turns out to be annoying in practice.
- **`sign-up.tsx` vs. onboarding** — still two separate, working signup
  entry points (see `TASK_GOOGLE_SIGNIN.md`). Decided to keep both for now
  rather than delete a working screen; not reconciled into one flow.

## Screen 14 — activity level

No `activity_level` (or player-count/upcoming-play-event aggregation) exists
anywhere in the codebase for facilities. Real implementation needs either:
- A computed view/RPC joining `play_participants`/`play_events` by
  `facility_id` and bucketing into high/medium/low, or
- A materialized column refreshed periodically.

`ACTIVITY_MOCKS` in `@/lib/onboarding/mockData.ts` is the mock shape this
would need to match.
