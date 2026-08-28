# Mobile — what the next build needs to verify

**Written 2026-08-27.** Read this before the first build after the Expo plan
upgrade. Everything here is committed and pushed on
`feature/expo-mobile-foundation`; none of it has ever run on a device.

## Why the app on the device currently crashes

`profiles.play_style` was migrated from `text` to `text[]` on 2026-08-27. The
build installed on the test device predates that and still runs
`playStyle.trim()` against what is now an array, which throws. Anything that
reads or writes a profile is affected — Edit Profile most directly.

**This is a sequencing mistake, not a code defect.** The migration ran before the
client that understands it could ship. The fix is committed (`7177bee`); it has
simply never been built. Migrate clients first next time, or accept the gap
knowingly.

The crash is not recoverable on-device without a new build. Do not spend time
trying — see "dead ends" below.

## Build profile to use

`eas.json` has three profiles. Only `development` sets
`developmentClient: true`, and that is the one worth having first:

```
eas build --profile development --platform ios
```

A dev-client build loads JS from Metro, so after it is installed **every further
JS change can be tested with `npx expo start --dev-client` and no new build**.
That is the constraint that made today painful — `preview` and `production`
embed their bundle and ignore Metro entirely.

Build `preview`/`production` afterwards if needed; get the dev client first.

## Verify in this order

Each of these is committed and unverified. The first two are the ones that can
still be wrong in a way that matters.

1. **Profile saving works at all.** Edit Profile → change anything → Save.
   Before `7177bee` this failed entirely with `22P02 malformed array literal`,
   because one bad column failed the whole update. If this works, client and
   schema agree.

2. **Play style.** Edit Profile → Play Style. Multi-select chips, **no "Other"
   free-text box**. Pick two, save, reopen — both should persist. Labels:
   Aggressive baseliner, Soft game, Dink master, Banger, Counter-puncher,
   All-court, Third-shot specialist, Net player.

3. **Native action sheet.** Groups → a group → header ⋯. Expect the iOS system
   sheet from the bottom, destructive item in red, swipe-to-dismiss — not a
   small popover under the button.

4. **Corrupted strings** (`e1420c7`). A profile with no name shows `—`, not
   `â€"`. Same on Account Settings. Onboarding → Enable Location button reads
   "Requesting…".

5. **Sign out** (`ac91859`). Works first tap, and leaves the web session alone —
   it is `scope: 'local'` now, where it used to sign you out everywhere.

## Then: the deferred workspace work

With a green build in hand, do the mobile half of B1/B2 **immediately after it**,
never before one that is needed:

- Root `package.json` with workspaces; `apps/mobile` joins
- Regenerate the lockfile with **npm 10**, not the local npm 11 — the EAS
  builders run 10.8.2 and the mismatch has broken builds here before
- Delete `apps/mobile/src/lib/database.types.ts` (duplicate of
  `packages/shared/src/database.types.ts`)
- Delete `apps/mobile/src/lib/playProfile.ts` (temporary mirror of
  `packages/shared/src/play-profile.ts`) and import from the shared package
- Mobile adopts the shared `summarizeSchedule()` so both platforms derive the
  same availability text

Until those mirrors are deleted, a change to either copy must be made to both —
the keys are CHECK-constrained database values, so divergence is a rejected
write.

## Dead ends already tried — do not repeat

- **Expo Go** cannot run this app. `@stripe/stripe-react-native`,
  `@sentry/react-native` and `react-native-maps` are native modules it does not
  bundle.
- **Metro against the installed build** does nothing. That build is `preview`,
  which embeds its JS.
- **`eas update` with default platforms fails.** `expo export --platform=all`
  includes web, and web dies on Stripe importing React Native internals. iOS and
  Android bundle fine. Use `--platform ios` if OTA is ever wanted.
- **`workflow:run create-production-builds.yml`** — no such file in this repo,
  and production builds would not help; they embed their bundle too.

## Not blocked by the build

- `SENTRY_AUTH_TOKEN` in Vercel — production stack traces are unsymbolicated
  until it is set. One environment variable, no code change.
- Light-theme destructive red is 3.62:1, below AA. Pre-existing, two values.
