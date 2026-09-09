# Mobile — what the next build needs to verify

**Written 2026-08-27, updated 2026-08-29.** Read the update block first — the
premise this file was written on has since expired.

## ⚠️ UPDATE 2026-08-29 — the crash section below is history

The `play_style` crash described next **is fixed and shipped.** `7177bee` went
out in iOS build **#5** (`4f52e2c5`, `development` profile, 2026-08-28, commit
`02a0023`), and device testing has run normally since — `58b76bd` was verified
on device and `e83527c` was written from device screenshots.

**A dev client is installed, so JS changes need no build.** Run
`npx expo start --dev-client`. Everything committed since `02a0023` — the
`@shared` imports (`0ce5458`), the clipped tournament title (`7328daf`), the
header fix (`e83527c`) — is testable that way for free. Build only for native
changes, or for a shareable `preview`.

Preview build **#6** (`2cacd3a3`, commit `a80fce0`) was cut 2026-08-29. The
`SENTRY_AUTH_TOKEN` needed to symbolicate crash reports lives only in the EAS
`preview` environment, so 4.1 wants that build rather than the dev client.

The verification list further down is still the right list. Keep the crash
section for the sequencing lesson it records: the migration shipped ahead of the
client that understood it.

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
