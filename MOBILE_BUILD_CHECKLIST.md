# Mobile — builds, OTA, and the road to TestFlight

**Written 2026-08-27. Current as of 2026-09-10.** Sections below carry their own
dates; the OTA rules at the bottom are the ones consulted most often.

## Status 2026-09-10 — nothing needs a rebuild to be verified

Ran this file's own pre-flight (see "OTA vs rebuild") with
`BASE=e2311d02`, the commit behind the installed preview build:

| Fingerprint input | Changed? |
| --- | --- |
| `app.config.js`, `eas.json`, `.easignore`, `.gitignore`, `assets/images/` | no |
| `package.json` → `scripts` | identical |
| `package.json` → `react-native` version | no |
| native dependencies / config plugins | none |

**All clear.** The ~56 mobile commits since that build — the whole marketplace
map programme, the sharing framework, and the 2026-09-09/10 auth, onboarding
and menu work — are JS only and reach the installed build over OTA. Publish
with `node ./scripts/publish-update.js preview` and verify on the phone.

So the *only* build still required is a **production** one, and it is required
for signing and distribution, not because the native project has drifted.

## Next: TestFlight

**No production-profile build has ever existed.** Confirmed 2026-09-10 against
`eas build:list` — every iOS build to date is `preview` or `development`, all
`INTERNAL` distribution. A Store build cannot be installed any other way, which
is why TestFlight comes before the App Store: it is the only way to see the
binary that will actually be submitted.

### Two blockers, both needing an Apple login

1. **Distribution certificate + App Store provisioning profile.**
   `eas build --profile production --platform ios` fails non-interactively with
   "Distribution Certificate is not validated for non-interactive builds". Run
   it **interactively once**; EAS stores both afterwards.
2. **`submit.production` in `eas.json` is `{}`** — no App Store Connect app id,
   no Apple team id. `eas submit` needs those, or an interactive first run.
   Whether an App Store Connect app record exists at all is not knowable from
   this repo.

Everything else is configured: the EAS `production` environment already holds
all eight `EXPO_PUBLIC_*` vars plus `SENTRY_AUTH_TOKEN`.

### What a production build actually changes — 2026-08-31's warning is stale

That warning said the marketplace, wallet and coaching all disappear under
`EXPO_PUBLIC_APP_ENV=production`. **No longer true** — `featureFlags.ts` was
updated through 2026-09-09. Verified against the flag map and
`featureRoutes.ts`:

| Feature | Production |
| --- | --- |
| `coachMarketplace`, `lessonMarketplace`, `wallet`, `marketplaceAiAssist`, `myStats` | **included** |
| `paidBooking` | hidden (deliberate — G1, Stripe stays in test mode) |
| `bookingFilters` | deferred (unimplemented CTAs) |
| `devTools` | internal-only |

`useFeatureRouteGuard` bounces only `/design-lab`, `/dev-qr-scan`,
`/dev-diagnostics`, `/dev-theme`, `/onboarding-preview`. `/coach`, `/lessons`,
`/wallet` and `/stats` all stay reachable. **No main-flow link bounces to the
root gate**, which was the specific risk flagged earlier.

### Three things that bite only in a production build

- **No diagnostics screen.** `devTools` is `internal-only`, so
  `dev-diagnostics` is gone exactly when a TestFlight problem would want it.
  Reproduce on a `preview` build instead.
- **A different OTA channel.** A production build reads the **`production`**
  channel; every update so far has gone to `preview`. That path has never been
  exercised, so a TestFlight hotfix is untested ground —
  `node ./scripts/publish-update.js production`, and confirm the runtime
  matches the production build, not the preview one.
- **Production content is thin.** Counted 2026-09-10: 2 future open
  tournaments, 3 future play events, 2 marketplace listings, 2 groups, 48
  profiles (489 facilities is the one healthy set). A reviewer walkthrough and
  any screenshot will read as an abandoned app. **Seed before building**, not
  after — this gates TODO 1.1 item 7.1 as much as the screenshots themselves.

### Order

1. Finish the parked items from the 2026-09-10 session (see
   `AUTH_ONBOARDING_HANDOFF.md` §4 and the share-card layout pass).
2. Seed production events, listings and groups.
3. `eas build --profile production --platform ios`, **interactively**.
4. `eas submit`, then work the verification list below against the TestFlight
   build — that also closes TODO 1.1's 5.1, 7.2 and 7.3 device halves.
5. Demo account + screenshots closes 7.1.

---

## Why the app on the device crashed (2026-08-27 to 2026-08-28 — resolved)

`profiles.play_style` was migrated from `text` to `text[]` on 2026-08-27. The
build installed on the test device predates that and still runs
`playStyle.trim()` against what is now an array, which throws. Anything that
reads or writes a profile is affected — Edit Profile most directly.

**This was a sequencing mistake, not a code defect.** The migration ran before
the client that understands it could ship. The fix (`7177bee`) shipped in build
#5 on 2026-08-28. Migrate clients first next time, or accept the gap
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

### ✅ Closed — the original 2026-08-27 list

All five verified on builds #7 and #9 (2026-08-29 / 08-31). Kept only so nobody
re-runs them: profile saving after the `play_style` array migration, the
multi-select play-style chips, the native action sheet, the repaired mojibake
strings, and local-scope sign out.

### Verified on device 2026-09-10

- **Password reset, end to end.** `/recover` → `/verify` → `PUT /user`, all with
  the native-app referer shape. Redeemed **in the app**, not Safari.
- **Signup → confirmation → onboarding → complete profile.**

### Outstanding — all OTA-delivered, none needs a build

Publish to `preview`, force-quit, relaunch, then work down. Grouped by the
programme that produced them.

1. **Slide-in menu contrast** (`4cbd2bc`). Dark navy panel; "QUICK ACTIONS" and
   "RECENTS" legible. Was 1.11:1 against its background — invisible.
2. **No Motion & Fitness prompt** (`9103e8f`). **Fresh install only** — iOS
   remembers the answer per install, so a relaunch proves nothing. The tilt
   parallax on the onboarding welcome screen must still work.
3. **Marketplace map (Phase 3)** — price-band pins, no overlay collisions, a pin
   tap opens the listing card, handoff filter honours Location & Discovery
   settings.
4. **Marketplace lifecycle** — 30-day expiry, renew, warning email, saved
   listings, price-drop alerts, enforced minimum offer, editable photos, AI
   assist, blocked-seller contact suppressed.
5. **Offers** — the keypad no longer covers the Make Offer sheet; the Send Offer
   button renders its label.
6. **Nearby** — tiered court search (in-radius first, then everywhere else), the
   search box hits the real backend.
7. **Saved payment methods** (`ee26a07`, Stripe SetupIntent) — still TEST mode.
8. **Tournament** — hero image at creation; cancelled tournaments badge as
   cancelled, not open.
9. **Activity** — mark-all-read, notification icons, invite read-state synced
   with the Received tab.
10. **Share cards** — send an event link to iMessage. Note Apple caches previews
    **per URL**, so use an event that has never been shared, or a different
    thread.

### Still unverified from TODO 1.1, and needs the TestFlight build

- **5.1 push**: foreground, background and cold-tap delivery; invalid-token
  cleanup. (Android is blocked on hardware — D4.)
- **7.2**: VoiceOver has never been run.
- **7.3**: performance profiling needs hardware.

## ~~Then: the deferred workspace work~~ — DONE 2026-08-29, and differently

B1/B2's mobile half landed in `0ce5458`, and **no npm workspace was created.**
`packages/shared` reaches mobile through a Metro watch folder
(`apps/mobile/metro.config.js`), so the lockfile was never regenerated and the
npm 10/11 trap below never applied. `eas build:inspect -s archive` confirmed
`packages/shared/src` reaches the builders, because the archive is the whole git
repo rather than `apps/mobile`.

The original plan, kept for the reasoning:

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

## OTA vs rebuild — what actually forces a new build

Added 2026-09-09 after two OTA publishes reached nobody. The rule was
discoverable but nowhere written down, so it got guessed at instead.

`runtimeVersion.policy` is `fingerprint` (app.config.js, with the reasoning).
An `eas update` is only offered to installed builds whose runtime matches. So:

**OTA-safe — publish freely, no rebuild:**
anything under `apps/mobile/src/**`. All screens, components, hooks, lib code,
new expo-router routes. This is the overwhelming majority of day-to-day work.

**Forces a rebuild — the complete project-level input list**, produced by
`npx @expo/fingerprint@latest fingerprint:generate --platform ios` on
2026-09-09 (128 sources; the other 118 are node_modules autolinking and config
plugins, i.e. dependency changes):

| Input | Reason |
| --- | --- |
| `apps/mobile/app.config.js` | `expoConfig` |
| `apps/mobile/package.json` → **`scripts`** | `packageJson:scripts` |
| `apps/mobile/package.json` → `react-native` version | `package:react-native` |
| `apps/mobile/eas.json` | `easBuild` |
| `apps/mobile/.easignore` | `easBuild` |
| `apps/mobile/.gitignore` | `bareGitIgnore` |
| `apps/mobile/assets/images/icon.png` | `expoConfigExternalFile` |
| `apps/mobile/assets/images/pickleballapp-logo-light.png` | `expoConfigExternalFile` |
| any native dependency add/remove/version bump | autolinking |
| any config plugin change | `expoConfigPlugins` |

Note `packageJson:scripts` in particular — the scripts block is hashed, but
`devDependencies` are **not**. Adding a devDependency is OTA-safe; adding an
npm script is not, which is not intuitive.

**Pre-publish check** (local fingerprint hashes are NOT comparable to EAS's —
EAS computes in its own environment, so do not compare hashes; diff the inputs
instead):

```
BASE=<commit-of-installed-build>

# 1. Whole-file inputs
git diff $BASE..HEAD --name-only -- \
  apps/mobile/app.config.js apps/mobile/eas.json \
  apps/mobile/.easignore apps/mobile/.gitignore apps/mobile/assets/images/

# 2. package.json — only the scripts block and the react-native version are
#    hashed, so diff those, NOT the file. A devDependency change makes the file
#    differ while the fingerprint is untouched.
diff <(git show $BASE:apps/mobile/package.json | python -c "import json,sys;print(json.dumps(json.load(sys.stdin).get('scripts'),indent=2,sort_keys=True))") \
     <(git show HEAD:apps/mobile/package.json  | python -c "import json,sys;print(json.dumps(json.load(sys.stdin).get('scripts'),indent=2,sort_keys=True))")
git diff $BASE..HEAD -- apps/mobile/package.json | grep -E '^[+-].*"react-native"'

# 3. Native deps / config plugins
git diff $BASE..HEAD -- apps/mobile/package.json | grep -E '^[+-] +"(expo|react-native|@react-native|@sentry|@stripe)[^"]*":'
```

All quiet ⇒ the OTA will reach the installed build. Any hit ⇒ it will reach
nobody, silently, and a new build is required.

After publishing, confirm the `Runtime Version` line in the CLI output matches
the installed build's. The current preview build's runtime is **`9e5109d0…`**,
named in app.config.js's `userInterfaceStyle` comment.

**What broke it on 2026-09-08:** `f7e8f7d` added `"test": "vitest run"` to
`apps/mobile/package.json` scripts. From that commit on, every OTA — the WIP
consolidation, Marketplace Map Phase 0, the marker spike — targeted a runtime
no installed build had. Nothing was wrong with the updates; the device was
correctly ignoring them.

**Publish with the wrapper, never bare `eas update`:**

```
node ./scripts/publish-update.js preview --message "..."
```

It loads `EXPO_PUBLIC_*` from the EAS environment. A bare `eas update` ships
`EXPO_PUBLIC_APP_ENV` unset, `resolveAppEnv()` falls back to `production`, and
every `internal-only` feature vanishes from the internal build. It is iOS-only
by design — `expo export --platform=all` includes web, and web dies on Stripe
importing React Native internals.

**To iterate without any of this:** the `development` profile build loads JS
from Metro, so `npx expo start --dev-client` picks up every JS change with no
publish and no fingerprint involvement at all.
