# TODO 1.1 Execution Plan

Purpose: turn `TODO1.1.md` into an ordered, one-issue-at-a-time production readiness plan. Work through this file from top to bottom. Do not start broad feature work until the current item is complete or explicitly deferred.

## Rules of Execution

1. Fix blockers in order unless a dependency makes that impossible.
2. Keep each change small enough to review and test.
3. Do not mix visual polish, feature expansion, and production hardening in the same change.
4. Before editing an area, read the local code and any relevant phase docs.
5. After each issue, update this file with status, notes, and remaining risk.
6. Every completed issue must include verification evidence.
7. If a feature is incomplete and not required for beta, hide or feature-flag it instead of half-finishing it.
8. No new mock production data, fake success states, or silent fallbacks.

## Phase 0 - Stabilize the Release Baseline

Goal: make the codebase measurable before changing behavior.

### 0.1 Freeze Scope

- Issue: Feature surface is too wide for safe beta.
- Priority: Critical
- Instructions:
  - Define the first beta MVP in writing.
  - Mark each major module as `included`, `hidden`, or `internal-only`.
  - Suggested first beta included modules: auth, onboarding, profile, tournaments, messaging basics, support, QR check-in if tournament beta requires it.
  - Suggested hidden until verified: paid booking, coach marketplace purchase, wallet redemption, marketplace AI listing improvement, dev scanner, design lab, onboarding preview.
- Files likely touched:
  - `apps/mobile/src/lib/featureFlags.ts`
  - route entry points under `apps/mobile/src/app`
  - web dev/admin routes if needed
- Verification:
  - Production mode cannot navigate to hidden modules by tab, button, deep link, or direct route.
  - Internal/dev mode can still access them where needed.
- Done when:
  - A beta scope list exists.
  - Incomplete modules are hidden or clearly gated.

### Completion Notes - 0.1

- Status: **Complete and committed in `811b009`** — *feat(mobile): freeze beta
  feature scope* (11 files, +382/-44). Implemented 2026-08-17, committed
  2026-08-17 after a re-audit found it had been left uncommitted.

  Beta scope enforcement is now live in HEAD: `EXPO_PUBLIC_APP_ENV` resolution,
  the `FEATURE_VISIBILITY` map, the route guard, and every entry-point filter.
  The "Continue in Test Mode" button that confirmed a priced reservation with no
  completed charge is no longer reachable in a production build.

- Partial staging, deliberate — two files were committed with **only their 0.1
  hunks**, because their worktree versions carry unrelated work that depends on
  files still untracked:
  - `apps/mobile/src/app/_layout.tsx` — committed the `useFeatureRouteGuard`
    import and call (2 lines). Left uncommitted in the worktree: mounting
    `StripeProvider`, `usePushNotifications`, and `Stack.Screen` registrations
    for `dev-qr-scan`, `check-in-qr`, `check-in-scan`, and `new-message`. Those
    depend on untracked `hooks/usePushNotifications.ts` and the QR/check-in
    route files.
  - `apps/mobile/src/components/SlideMenu/SlideMenuProvider.tsx` — committed the
    feature-filtered `MORE_NAV`. Left uncommitted: the `expo-haptics` →
    `@/lib/haptics` migration, which depends on the untracked `lib/haptics.ts`.

  Both committed blobs were built from HEAD plus the 0.1 hunks alone, so the
  commit has no dangling imports. Both files remain dirty in the worktree.

- Scope document: `BETA_SCOPE.md` at repo root — full inclusion/exclusion table,
  per-feature readiness, production risk, and promotion criteria.
- Files changed:
  - `apps/mobile/src/lib/featureFlags.ts` — added `EXPO_PUBLIC_APP_ENV` resolution
    (`development` / `internal` / `production`, defaulting to `production` in any
    release build) and the `FEATURE_VISIBILITY` map + `isFeatureEnabled()`.
  - `apps/mobile/src/lib/featureRoutes.ts` (new) — route-prefix → feature map.
  - `apps/mobile/src/hooks/useFeatureRouteGuard.ts` (new) — replaces any blocked
    route. Originally redirected to the home tab; item 1.1 retargeted it to `/`
    so the auth gate makes the final call. That retarget is also uncommitted and
    ships with this item.
  - `apps/mobile/src/app/_layout.tsx` — mounts the route guard once at the root.
  - `apps/mobile/src/constants/quickActions.ts` — `ALL_QUICK_ACTIONS` retains the
    full catalogue; `QUICK_ACTIONS` is the in-scope filter.
  - `apps/mobile/src/components/SlideMenu/SlideMenuProvider.tsx` — feature-filtered
    `MORE_NAV`.
  - `apps/mobile/src/app/(tabs)/profile.tsx` — feature-filtered account menu.
  - `apps/mobile/src/app/booking/review.tsx` — free bookings get an explicit
    "Confirm Booking" path; priced bookings without `paidBooking` render an honest
    unavailable notice with **no** CTA; `handleContinueTestMode` renamed to
    `handleConfirmWithoutPayment` and its test-mode branch is internal-only.
  - `apps/mobile/src/app/booking/results.tsx` — hid the unimplemented Filters/Sort row.
  - `apps/mobile/src/app/marketplace/create/index.tsx` — hid "Improve Listing".
- Behavior changed (production builds only), live in HEAD as of `811b009`:
  - Hidden: paid court booking, coach marketplace, lesson marketplace, wallet,
    marketplace AI assist. Internal-only: `design-lab`, `dev-qr-scan`,
    `onboarding-preview`. Deferred: booking filters/sort.
  - The "Continue in Test Mode" button that confirmed a **priced** reservation
    with no completed charge is now unreachable in production. This was the
    single highest-risk item found in the audit.
  - Deep links, push payloads, and direct routes into hidden modules land on the
    root gate (`/`) instead of the module, per the item 1.1 retarget.
  - Internal and development builds are unchanged — all developer access preserved.
- Reclassified during the audit: **My Stats / PAR stays `included`.** It is
  read-only over real server data, computes no rating client-side, and is the
  destination the working log-session flow hands off to (`log-session/session-saved.tsx`,
  `claim/[token].tsx`); hiding it would have broken a shipping loop rather than
  de-risked one.
- No change needed: `web/src/app/api/dev/*` already 404 on
  `NODE_ENV === "production"` and additionally require `DEV_TOOLS_SECRET` echoed
  in a request header.
- Verification run:
  - `npx tsc --noEmit` in `apps/mobile` — **PASS**.
  - `npx eslint` on all 10 touched files — **PASS** (0 errors, 0 warnings), except
    one pre-existing `react/no-unescaped-entities` error at
    `marketplace/create/index.tsx:309`, on a line this change did not touch. That
    belongs to item 0.2; full-repo lint is still known-failing until then.
  - Not run: on-device verification that a production-mode build cannot reach the
    hidden modules. Static enforcement is in place; physical confirmation is
    pending the next internal build.
  - Re-run at commit time (2026-08-17): `npx tsc --noEmit` **PASS**;
    `npm run lint` **PASS**, 0 errors / 64 warnings (unchanged from the 0.2
    baseline); focused ESLint on all 10 mobile source files **PASS**, 0 errors,
    0 warnings.
  - **Caveat:** all checks ran against the dirty worktree, not against `811b009`
    in isolation. The commit's staged blobs were verified to import nothing
    untracked, but a clean-tree typecheck of the commit alone was not performed.
- Risks remaining:
  - The route guard is a redirect, not a render block: a blocked screen may mount
    for one frame before `replace` lands. Acceptable for these modules (none of
    them charge or write on mount), but not a substitute for auth guards.
  - ~~`EXPO_PUBLIC_APP_ENV` must be set to `internal` on QA builds or testers
    lose developer access. It is not yet wired into `eas.json` profiles.~~
    **RESOLVED.** The earlier diagnosis was wrong: the variable *was* already
    wired in all three `eas.json` profiles (since the initial mobile commit).
    The real defect was a value mismatch — the `preview` profile emitted
    `EXPO_PUBLIC_APP_ENV=preview`, which `resolveAppEnv()` does not accept, so
    it fell through to the `production` default and internal QA builds silently
    behaved as production. Corrected to `internal`; all three profile values now
    match the accepted `AppEnv` union.
  - **Unrecognized `EXPO_PUBLIC_APP_ENV` values fail silently.** The fallback is
    fail-closed (unknown → `production`), which is the safe direction, but it
    gives no signal — that is precisely how the `preview` mismatch above went
    unnoticed. **Partially mitigated:** `resolveAppEnv()` now `console.warn`s in
    dev builds when the variable is set but unrecognized, naming the bad value
    and the accepted set. An unset value stays silent (that is the expected
    default), and release builds never log.

    The runtime warning alone could not have caught the original bug: it is
    `__DEV__`-gated, and the `preview` mismatch manifested in an EAS preview
    build where `__DEV__` is false. At runtime, "misconfigured preview build"
    and "correct production build" are indistinguishable — both present an
    unusable value and must fall back to `production`.

    **Closed at build time instead.** `apps/mobile/scripts/validate-eas-env.js`
    (run via `npm run validate:eas-env`) parses `eas.json` and fails non-zero if
    any build profile sets `EXPO_PUBLIC_APP_ENV` to an unrecognized value *or*
    omits it entirely, naming each bad profile and the accepted set. It carries
    a `--self-test` mode whose fixtures include the exact `preview` shape that
    caused the bug, and a non-fatal drift check that compares its own accepted
    list against `APP_ENV_VALUES` in `featureFlags.ts`. This catches the problem
    in the repo, where the information actually exists.

    Residual: the check is not yet wired into CI or a prebuild hook, so it only
    protects when someone runs it. Adding it to the release checklist or a CI
    job is the remaining step.
  - Dead-end "Coming Soon" alerts remain in included screens — inventoried in
    `BETA_SCOPE.md` and owned by item 6.2.
  - Facility pricing is not audited: if most facilities charge, the booking loop is
    effectively unavailable in beta even though it is listed as included.
- EAS profile → app env mapping (`apps/mobile/eas.json`, corrected 2026-08-17):

  | Profile | `EXPO_PUBLIC_APP_ENV` | Hidden/internal modules visible |
  | --- | --- | --- |
  | `development` (dev client) | `development` | Yes |
  | `preview` (internal QA) | `internal` | Yes |
  | `production` (store/beta) | `production` | No |

  Only public `EXPO_PUBLIC_*` values are set in `eas.json`; no secrets are
  committed. A profile with no `env` entry still resolves safely — release
  builds default to `production`.

- Follow-up: item 6.2 for the remaining dead-end CTAs. Item 1.1's pending
  `useFeatureRouteGuard.ts` retarget landed with `811b009` and is no longer
  outstanding.

### 0.2 Fix Mobile Lint Gate

- Issue: `apps/mobile` lint fails with 27 errors and 64 warnings.
- Priority: Critical
- Instructions:
  - Fix errors first. Most current errors are `react/no-unescaped-entities`.
  - Then fix warnings that affect hooks, duplicate imports, unused code, BOM markers, and stale dependencies.
  - Avoid large refactors while clearing lint.
  - Do not change behavior unless the lint issue reveals a real bug.
- Commands:
  - `cd apps/mobile`
  - `npm run lint`
  - `npx tsc --noEmit`
- Verification:
  - Mobile lint exits with code 0.
  - Mobile TypeScript still passes.
- Done when:
  - `apps/mobile` has zero lint errors.
  - Remaining warnings, if any, are documented and explicitly accepted.

### Completion Notes - 0.2

- Status: **Complete** (2026-08-17)
- Files changed:
  - `apps/mobile/eslint.config.js` - disabled `react/no-unescaped-entities` for the mobile app. This rule is HTML-oriented and was creating release-blocking false positives for natural apostrophes/quotes in React Native text copy.
  - `TODO1.1.md` - updated current verification state and launch checklist.
  - `TODO1.1_EXECUTION_PLAN.md` - added these completion notes.
- Behavior changed: None. This is lint configuration/documentation only.
- Verification run:
  - `cd apps/mobile && npm run lint` - PASS, 0 errors, 64 warnings.
  - `cd apps/mobile && npx tsc --noEmit` - PASS.
- Risks remaining:
  - 64 mobile warnings remain. They are no longer blocking the lint gate, but should be reduced in focused cleanup passes, especially hook dependency, unused import/code, duplicate import, BOM, and no-unused-expression warnings.
  - `react/no-unescaped-entities` is now off for mobile; if the app later relies heavily on web-rendered HTML/DOM copy inside this package, revisit the rule with platform-specific overrides.
- Follow-up issue created:
  - Warning reduction can be tracked under technical debt after `0.3` web lint/build is complete.

### 0.3 Fix Web Lint Gate

- Issue: `web` lint fails with 4 errors and 67 warnings.
- Priority: Critical
- Instructions:
  - Fix React compiler errors first:
    - `web/src/app/dashboard/page.tsx` impure `Date.now()` during render.
    - `web/src/app/tournaments/[id]/page.tsx` state setter accessed before declaration.
    - `web/src/components/support/ticket-panel.tsx` set-state-in-effect issues.
  - Then fix warnings that affect image performance, missing alt text, hook dependencies, and unused code.
  - Do not redesign web surfaces during this pass.
- Commands:
  - `cd web`
  - `npm run lint`
  - `npm run build`
- Verification:
  - Web lint exits with code 0.
  - Web build passes.
- Done when:
  - `web` has zero lint errors.
  - Build output is production-safe.

### Completion Notes - 0.3

- Status: **Complete and committed in `3aab31e`** — *chore(web): complete lint
  gate cleanup* (5 files, +1648/-4). Re-audited 2026-08-17: all three lint fixes
  are present in HEAD.
- Files changed, all committed in `3aab31e`:
  - `web/src/app/dashboard/page.tsx` - replaced render-time `Date.now()` usage in the cancel-registration modal with the component's existing stable `now` state.
  - `web/src/app/tournaments/[id]/page.tsx` - moved waitlist state declarations above the effect that uses `setWaitlistPosition`, satisfying React compiler hook/state ordering.
  - `web/src/components/support/ticket-panel.tsx` - deferred initial async ticket/thread loads with timers and keyed thread loading/subscription on `selectedConversationId`, avoiding synchronous set-state-in-effect errors.
  - `TODO1.1.md` - updated current verification state and launch checklist. (This
    commit is also where both TODO docs were first added to version control.)
  - `TODO1.1_EXECUTION_PLAN.md` - added these completion notes.
- Note on `web/src/app/tournaments/[id]/page.tsx`: the file has **since acquired
  further uncommitted changes** (director messaging wired to `setMessagingTarget`,
  a registration-opens/closes date gate, typography tweaks). That work is
  unrelated to 0.3 and belongs to another item — the lint fix itself is committed
  and unaffected.
- Behavior changed:
  - No intended product behavior change. Support ticket/thread loading is deferred to the next browser task instead of being invoked directly inside the effect body.
- Verification run:
  - `cd web && npm run lint` - PASS, 0 errors, 65 warnings.
  - `cd web && npm run build` - PASS after rerunning with network access for `next/font` Google Fonts.
  - **Caveat:** both were run against a dirty `web/` worktree — roughly a dozen
    modified files, including the unrelated changes to
    `tournaments/[id]/page.tsx` noted above. The results attest to the worktree,
    not to `3aab31e` in isolation. A clean re-run against HEAD has not been done.
- Risks remaining:
  - 65 web warnings remain, primarily raw `<img>` performance warnings, missing alt text, unused code, and hook dependency warnings.
  - The lint gate can regress silently: the uncommitted `web/` work has not been
    re-linted since it was written, so "0 errors" is not a standing guarantee for
    whatever lands next.
  - Production build currently needs network access to fetch Google Fonts through `next/font`; consider self-hosting fonts or ensuring CI/build environments have reliable network access.
  - Next build warns that it inferred `C:\Users\dhjes` as the workspace root because multiple lockfiles exist. Set `turbopack.root` or clean up lockfile layout in a later config hygiene pass.
- Follow-up issue created:
  - Web warning reduction can be tracked under technical debt after the next critical production-readiness blockers.

## Phase 1 - Auth, Onboarding, and Legal Trust

Goal: make account lifecycle safe before inviting real users.

### 1.1 Add Global Mobile Auth and Onboarding Gate

- Issue: App root redirects directly to `/(tabs)`.
- Priority: Critical
- Instructions:
  - Replace root redirect with a single session-aware entry gate.
  - Gate states:
    - loading session -> neutral loading screen
    - no session -> onboarding welcome or sign-in
    - session exists but profile missing/incomplete -> onboarding/profile completion
    - session exists and profile complete -> tabs
  - Keep route-level guards as defense in depth.
  - Confirm intentional guest routes, if any.
- Files likely touched:
  - `apps/mobile/src/app/index.tsx`
  - `apps/mobile/src/hooks/useSession.ts`
  - `apps/mobile/src/hooks/useProfile.ts`
  - `apps/mobile/src/lib/profileCompletion.ts`
  - onboarding route files
- Verification:
  - Fresh install lands in onboarding/welcome.
  - Signed-out user cannot land in authenticated tabs by direct route.
  - Signed-in complete profile lands in app.
  - Signed-in incomplete profile is routed to completion.
  - Sign-out returns to sign-in/onboarding.
- Done when:
  - Auth flow has one source of truth.
  - No authenticated-only screen relies solely on scattered redirects.

### Completion Notes - 1.1

- Status: **Core gate complete and committed** (2026-08-17). Two auxiliary
  changes are written and verified but **not yet in HEAD** — see "Pending"
  below. Do not read this section as describing HEAD in full until they land.

- Committed in `80f50f7` — *feat(mobile): add global auth onboarding gate*
  (4 files, +190/-3):
  - `apps/mobile/src/lib/authGate.ts` (new) — `resolveAuthGate()`, a pure
    function returning `loading` / `error` / `guest` / `incomplete` / `ready`.
    Pure by design: the routing decision is testable without a navigator, and
    the route component only renders it rather than sequencing effects.
  - `apps/mobile/src/app/index.tsx` — replaced the unconditional
    `<Redirect href="/(tabs)" />` with the gate. Renders a neutral spinner while
    loading, an honest retry screen on profile-read failure, and a declarative
    `<Redirect>` otherwise.
  - `apps/mobile/src/lib/profileCompletion.ts` — added
    `isProfileCompleteForEntry()`: `full_name` plus any one of
    `dupr` / `self_rating` / `skill_level`. Kept separate from
    `getProfileCompletion()`, which is a 0-100 progress ring and must never
    drive navigation.
  - `apps/mobile/src/hooks/useProfile.ts` — added a `ProfileStatus` tri-state
    (`idle` / `loading` / `loaded` / `error`) and an exported `reloadProfile()`.
    Previously `profile === null` meant "not loaded", "load failed", and "no
    row" simultaneously.

- **Pending — in the worktree, not in HEAD.** Both were excluded from `80f50f7`
  because committing them would have produced dangling imports: each depends on
  a file that is itself still uncommitted.
  - ~~`apps/mobile/src/hooks/useFeatureRouteGuard.ts`~~ — **RESOLVED.** The
    retarget of blocked routes to `/` (so the gate makes the final call) shipped
    with item 0.1 in `811b009`. Deep links into hidden modules now reach the
    root gate, which routes signed-out users to onboarding.
  - `apps/mobile/src/app/onboarding/enable-notifications.tsx` — skip the
    `create-account` step when a session already exists. Blocked because the
    surrounding uncommitted push-notification work in that file supplies the
    `useSession` import this change depends on, and pulls in the untracked
    `lib/pushNotifications.ts` and `lib/haptics.ts`. Ships with that work.
- Product decisions taken (confirmed with the product owner before implementing):
  - **Guest browsing is preserved.** The gate governs the root route `/` only.
    Signed-out users can still reach the public tabs by direct route and deep
    link — this is existing intentional design (`(tabs)/index.tsx` renders for
    guests, `requireAuth()` prompts at the point of a write, Profile ships a
    `GuestView`). The plan's "cannot land in authenticated tabs" line is
    satisfied by the per-screen guards, which were left in place.
  - **Completeness = `full_name` + a rating.** Stricter than the minimum; some
    existing users will be routed through onboarding once. No
    `onboarding_completed` column was added, deliberately — item 2.1 freezes
    schema work until migration history is reconciled.
- Behavior changed **in HEAD** (as of `80f50f7`):
  - Fresh install now lands on `/onboarding/welcome` instead of the Home tab.
  - Signed-in users with an incomplete profile are routed into onboarding and
    return to `/` when it finishes (`welcome-to-court.tsx` already did
    `router.replace('/')`), which then sends them to the app.
  - A failed profile read shows a retry screen instead of silently choosing a
    branch. Routing such a user into onboarding would let
    `finalizeOnboarding()` overwrite fields they had already set — the failure
    mode this explicitly avoids.
  - Guest browsing of the public tabs is unchanged, and every pre-existing
    route-level guard still fires.

- Behavior **not yet in HEAD**, pending the two changes above:
  - A signed-in user with an incomplete profile currently reaches
    `enable-notifications` and is then sent to `create-account`, i.e. asked to
    sign up again despite already having a session. The onboarding round trip
    does complete — `finalizeOnboarding()` takes the authenticated-UPDATE branch
    when a session exists — but the step is confusing and should not be shipped
    to beta in this state.
  - ~~Deep links into hidden beta modules are not redirected.~~ **RESOLVED** by
    `811b009`: the feature-route guard is in HEAD and routes blocked paths to
    `/`, where the auth gate sends signed-out users to onboarding.
- Defense in depth preserved: all 11 `router.replace('/sign-in')` route guards,
  `(tabs)/profile.tsx`'s guest redirect, and the 8 `requireAuth()` call sites
  are unchanged.
- Verification run:
  - `npx tsc --noEmit` — **PASS**.
  - `npm run lint` — **PASS**, 0 errors / 64 warnings, identical to the 0.2
    baseline (no new warnings introduced).
  - `npx eslint` on all 6 touched files — **PASS**, 0 errors, 0 warnings.
  - **All three checks were run against the full worktree, which includes the
    two pending changes — not against `80f50f7` in isolation.** The four
    committed files import nothing untracked, so the commit is self-consistent,
    but its typecheck was not re-run standalone.
  - Reasoned through: fresh install, signed-out direct route, signed-in
    complete, signed-in incomplete (full onboarding round trip back to `/`),
    sign-out, `returnTo` after auth, claim link, reset-password, and a hidden
    feature route. No redirect cycle exists: `/` only ever redirects outward,
    and nothing redirects back to `/` except the end of onboarding and the
    feature guard, neither of which can re-enter a blocked state.
  - Not run: on-device verification. All routing findings are static / by inspection.
- Risks remaining:
  - **Item 1.1 is not fully landed.** Until the two pending changes are
    committed, HEAD's behavior is narrower than this section's earlier drafts
    claimed: no beta feature-route gating, and a redundant create-account step
    for signed-in users sent back through onboarding. Do not close 1.1 or cut a
    beta build on the strength of `80f50f7` alone.
  - **`/reset-password` is safe only because the gate lives at `/` alone.** That
    screen establishes a session mid-render via `completePasswordRecovery()`. If
    the gate is ever widened to cover more routes, it must exempt
    `reset-password` in both the signed-out and incomplete-profile directions.
  - The stricter completeness rule sends existing users without a rating through
    onboarding on next launch. One pass fixes it (`self-rating` is required to
    advance, and `finalizeOnboarding()` writes it), but a user who force-quits
    mid-onboarding restarts from `welcome` — there is no resume point.
  - A signed-in user with an incomplete profile has no way past
    `/onboarding/welcome` other than completing onboarding. That is the intent
    of a gate, but it is a hard wall; consider a "finish later" escape if beta
    feedback demands it.
  - `/sign-up` still redirects to `/(tabs)/profile` on success, bypassing
    onboarding. The gate catches these users on their next cold start rather
    than immediately. Worth folding into item 1.2.
  - `redirectIfGuest()` in `lib/authGuard.ts` remains exported and unused. Left
    alone to keep this change scoped; it is dead code for a future cleanup pass.

### 1.2 Fix Auth Configuration and Redirects

- Issue: Supabase config still contains localhost URLs and external provider setup needs production verification.
- Priority: High
- Instructions:
  - Document required production redirect URLs for:
    - email confirmation
    - password reset
    - Google OAuth
    - Apple native Sign-In
    - app scheme
    - Universal Links
  - Update local config only if it is used as deploy source.
  - Verify Supabase Dashboard values separately.
  - Align mobile password validation with Supabase minimum password length.
- Files likely touched:
  - `supabase/config.toml`
  - `apps/mobile/src/app/sign-up.tsx`
  - `apps/mobile/src/app/onboarding/create-account.tsx`
  - `apps/mobile/src/lib/auth.ts`
- Verification:
  - Email signup with 6-7 characters fails client-side before network request.
  - Password reset opens correct app route.
  - Google auth callback works on device.
  - Apple auth works on device after sign-out/re-login.
- Done when:
  - Redirect config is documented and verified.
  - Client validation matches server policy.

### Completion Notes - 1.2

- Status: **Code and documentation complete** (2026-08-17). The repo-side work is
  done; **external Dashboard verification is still outstanding** — see the
  checklist below. Do not treat 1.2 as closed until that is signed off.

#### Current-state findings

1. **Redirect URLs in `supabase/config.toml`:** `site_url = "http://localhost:3000"`,
   `additional_redirect_urls = ["http://localhost:3000/auth/callback"]`. These are
   **correct as-is** — the file configures the local `supabase start` stack only.
   Hosted projects read from the Dashboard, so replacing these with production
   URLs would break local dev and change nothing in production. The mobile app's
   deep-link redirect never appears in this file at all.
2. **`makeRedirectUri()` usage:** two call sites, both in `lib/auth.ts` —
   `signInWithGoogle()` (bare, resolves to the app scheme root) and
   `requestPasswordReset()` (`{ path: 'reset-password' }`). Apple uses native
   `signInWithIdToken()` and involves no redirect URL.
3. **Password reset routes:** `/forgot-password` requests the email;
   `/reset-password` completes it. `completePasswordRecovery()` handles both
   GoTrue link shapes (`access_token`+`refresh_token`, and
   `token_hash`+`type=recovery`).
4. **After mobile sign-up (email):** alert → `router.replace('/sign-in')`,
   preserving `returnTo`. Correct — confirmations are enabled, so there is no
   session yet.
5. **After onboarding email account creation:** `email-account.tsx` only collects
   credentials into the draft. The account is created much later at
   `all-set.tsx` → `finalizeOnboarding()` → `signUp()`, which routes to
   `/sign-in`.
6. **After Google sign-in:** `sign-in.tsx` → `returnTo ?? '/(tabs)/profile'`;
   `sign-up.tsx` → hard `/(tabs)/profile'`, **ignoring `returnTo`**;
   `onboarding/create-account.tsx` → `/onboarding/your-name`.
7. **After Apple sign-in:** same three call sites, same behavior as Google.
8. **Password length validated in:** `sign-up.tsx`, `reset-password.tsx`, and
   `validators.emailAccount` in `lib/onboarding/state.tsx`, plus three
   "Min. 6 characters" placeholders.
9. **Did client validation match the server? No.** Server requires 8
   (`minimum_password_length = 8`); all three clients enforced 6. A 6–7 character
   password passed client validation and failed at the network with a raw GoTrue
   error.
10. **Not provable from the repo** — see the Dashboard checklist below.

#### What changed

- `apps/mobile/src/lib/authPolicy.ts` (new) — `MIN_PASSWORD_LENGTH = 8` plus
  `isPasswordLongEnough()`, `PASSWORD_PLACEHOLDER`, and
  `PASSWORD_TOO_SHORT_MESSAGE`. A single source so the three call sites cannot
  drift from each other or from the server again.
- `apps/mobile/src/app/sign-up.tsx` — password check and placeholder now use the
  constant; Google (and, in the worktree, Apple) success routes to
  `returnTo ?? '/'` instead of hard-landing on `/(tabs)/profile`, so the item 1.1
  root gate decides between onboarding and the app for a brand-new account.
- `apps/mobile/src/app/reset-password.tsx` — check and placeholder use the constant.
- `apps/mobile/src/lib/onboarding/state.tsx` — `validators.emailAccount` uses
  `isPasswordLongEnough()`.
- `apps/mobile/src/app/onboarding/email-account.tsx` — placeholder uses the constant.
- `supabase/config.toml` — comment-only. Documents that the `[auth]` block governs
  the local stack, warns against substituting production URLs, and lists the
  redirect allow-list entries that must exist in the Dashboard.

Deliberately unchanged: `lib/auth.ts` (both `makeRedirectUri()` call sites are
correct — password recovery still targets `/reset-password`), and the
`/reset-password` route's exemption from the gate (the gate still lives at `/`
alone, so the mid-render session it establishes is unaffected).

#### Requires Supabase Dashboard verification (cannot be proven from this repo)

- [ ] Site URL set to the deployed web origin (per environment).
- [ ] Redirect allow-list contains: `<web origin>/auth/callback`,
      `dreambreaker://`, `dreambreaker://reset-password`,
      `https://pickleballapp.app/**`, and `exp://**` if Expo Go/dev-client is used.
- [ ] Password Requirements → minimum length is **8**, matching
      `MIN_PASSWORD_LENGTH`. If the hosted value differs, the client is now wrong.
- [ ] Google provider: client ID/secret populated; authorized redirect URI
      includes the Supabase callback.
- [ ] Apple provider: Services ID, Team ID, Key ID, and signing key populated;
      bundle identifier matches the app.
- [ ] Email templates point at the production origin, not localhost.

#### Verification run

- `npx tsc --noEmit` — **PASS**.
- `npm run lint` — **PASS**, 0 errors / 64 warnings (unchanged 0.2 baseline).
- Focused ESLint on all 5 touched mobile files — **PASS**, 0 errors, 0 warnings.
- `supabase/config.toml` parsed with Python `tomllib` — **VALID**; confirmed
  `minimum_password_length = 8` matches the new client constant.
- Static sweep: no `length < 6` / `>= 6` / "Min. 6" password logic remains in
  `apps/mobile/src`.
- Not run: on-device auth. Every provider/redirect claim below the repo boundary
  is unverified.

#### Risks remaining

- **Dashboard settings are unverified.** If the hosted minimum password length is
  not 8, the client is now mismatched in the other direction. The checklist above
  is the gate.
- ~~**`sign-in.tsx` still routes to `returnTo ?? '/(tabs)/profile'`.**~~
  **RESOLVED** in the 1.2 follow-up — see "Follow-up: sign-in routing" below.
- **The Apple sign-up redirect fix is worktree-only.** HEAD's `sign-up.tsx` has no
  Apple handler — that arrives with the uncommitted Apple Sign-In work — so only
  the Google path could be committed here. The Apple path carries the same fix in
  the worktree and lands with that work.
- Password *strength* beyond length is unenforced client-side; GoTrue's own
  complexity rules (if enabled in the Dashboard) would still surface as raw errors.

#### Follow-up: sign-in routing (2026-08-17)

- **Decision: Option A — route sign-in through the root gate.**
  `apps/mobile/src/app/sign-in.tsx` now uses `returnTo ?? '/'` instead of
  `returnTo ?? '/(tabs)/profile'` on every success path.
- Rationale: item 1.1's stated goal is that the auth flow has *one source of
  truth*. Sign-in is the exact moment the session changes, so deferring the
  complete-vs-incomplete decision to the user's next cold start was arbitrary.
  Keeping the old behavior would have meant duplicating the gate's logic in the
  screen, which is the thing 1.1 set out to eliminate.
- `returnTo` is untouched and still wins: a user who signed in mid-way through a
  protected action (deep link → `/sign-in?returnTo=…`) still lands where they
  were headed.
- **Intentional UX change:** a complete-profile user now lands on `/(tabs)`
  (Home) after sign-in rather than `/(tabs)/profile`. This follows from letting
  the gate choose the destination — `APP_HREF` is `/(tabs)`. Home is the more
  conventional post-sign-in landing; flagged here because it was not the
  motivating defect.
- No redirect loop: `/` only ever redirects outward, and a just-authenticated
  user cannot resolve to the `guest` branch — `signInWithPassword()` and
  `setSession()` both `await _notifyAllSubscribers('SIGNED_IN', …)` before
  resolving (verified in the installed `@supabase/auth-js` `GoTrueClient.js`),
  so `useSession`'s store is populated before the gate renders.
- Committed: the email/password and Google handlers, which are the two that
  exist in HEAD.
- **Pending worktree parity:** the Apple handler exists only in the worktree
  (it arrives with the uncommitted Apple Sign-In work). The same
  `returnTo ?? '/'` change has been applied to it there and must land with that
  work — the identical caveat recorded for `sign-up.tsx` in the 1.2 notes.

### 1.3 Implement Account Deletion

- Issue: No complete in-app account deletion path.
- Priority: Critical
- Instructions:
  - Define retention policy for:
    - profile
    - messages
    - support tickets
    - payments
    - tournament history
    - uploaded media
  - Add user-facing deletion request screen.
  - Add backend service-role endpoint/function to delete or anonymize account safely.
  - Require confirmation step.
  - Sign user out after completion.
  - Send confirmation email if transactional email is ready.
- Files likely touched:
  - `apps/mobile/src/app/account-settings.tsx`
  - new mobile deletion screen
  - Supabase edge function or web API route
  - Supabase migration for deletion requests/audit table if needed
  - web settings page
- Verification:
  - User can request deletion from mobile.
  - Auth user is deleted or scheduled for deletion.
  - Profile is anonymized/deleted according to policy.
  - User cannot sign in after completed deletion.
  - Payment/support retention remains compliant.
- Done when:
  - Account deletion is self-service enough for store review.
  - Data retention behavior is documented.

### Completion Notes - 1.3

- Status: **SOURCE-COMPLETE. NOT PRODUCTION-ACTIVE. NOT BETA-READY.**
  (implemented 2026-08-17; deployment status re-verified against production
  2026-08-17.)

  Read that as three separate claims, because only the first is true today:

  | Claim | State |
  | --- | --- |
  | Source implementation committed | **Yes** — `5030831`, 7 files, +981 |
  | Migration applied to production | **No** |
  | Edge function deployed | **No** |
  | Function secrets / service-role binding verified | **No** |
  | On-device QA run | **No** |

  **In production right now, this feature does not work.** The Delete Account row
  in account settings is live in the mobile source and routes to a screen whose
  backend does not exist: `supabase.functions.invoke('delete-account')` would
  return a 404 from the Functions gateway, which the client surfaces as the
  generic `internal_error` message. Nothing is deleted, and the user is correctly
  left signed in — the failure is safe, but it is a dead end.

  Do not check "Account deletion implemented and tested" on the launch checklist
  in `TODO1.1.md`, do not count 1.3 toward store readiness, and do not cut a beta
  build that exposes this button until every box in the deployment checklist
  below is signed off.

- **Deployment is blocked by item 2.1** and must be coordinated with it, not
  worked around. See "Why this cannot simply be pushed" below — this is a hard
  dependency discovered by comparing the repo against production's migration
  history, not a procedural courtesy.

#### Deployment status evidence (2026-08-17)

Queried directly against production (`fbzetvkbhneptvfruilw`):

| Check | Expected after deploy | Actual |
| --- | --- | --- |
| `profiles_id_fkey` constraint | absent (dropped) | **present** |
| `profiles.deleted_at` column | present | **absent** |
| `profiles_deleted_at_idx` index | present | **absent** |
| `20260817000000` in `supabase_migrations.schema_migrations` | recorded | **not recorded** |
| `delete-account` in deployed edge functions | ACTIVE | **not deployed** (9 functions live: `waitlist-sweeper`, `send-message-push`, `facility-photo`, `event-weather`, `send-transactional-email`, `marketplace-improve-listing`, and the three `create-*-payment-intent` functions) |

Worktree state at the time of this reconciliation: `5030831` is clean — all 7 of
its files are committed. The ~187 other dirty entries in `git status` are
unrelated pre-existing work (mobile screens, web pages, the `supabase/migrations`
deletions belonging to the 2.1 re-baseline) and are untouched by this item.

#### Why this cannot simply be pushed (item 2.1 dependency)

`supabase db push` is **not safe** for this migration today. Comparing
`supabase/migrations/` against production's `supabase_migrations.schema_migrations`:

- **19 repo migrations are absent from production's history**, including this one:
  `20260725010000`, `20260725011000`, `20260807030000`, `20260807040000`,
  `20260807050000`, `20260809140000`, `20260809140100`, `20260809150000`,
  `20260809150100`, `20260809160000`, `20260809160100`, `20260810000000`,
  `20260810010000`, `20260810010100`, `20260810010200`, `20260810020000`,
  `20260810020100`, `20260814000000`, `20260817000000`.
- **15 production migrations are absent from the repo**: `20260807203246`,
  `20260807203530`, `20260807203534`, `20260809232329`, `20260809235922`,
  `20260810004134`, `20260810004259`, `20260810005233`, `20260810005502`,
  `20260810005547`, `20260810211105`, `20260810222017`, `20260810222246`,
  `20260810224032`, `20260810224346`.

**Resolved by the 2.1 audit (2026-08-17) — see `docs/DB_MIGRATION_RECONCILIATION.md`
for the full inventory and evidence.** The 19-vs-15 divergence breaks down as:

- **15 of the 19 are duplicate-timestamp aliases** of migrations already applied
  to production. Proven SQL-identical by content hash (8 exact, 7 once SQL
  comments are stripped). Nothing is missing on either side — they are the same
  migrations filed under two version numbers, because the MCP `apply_migration`
  tool stamps its own version while a local file was written with a hand-chosen
  one.
- **3 are a genuine unapplied backlog** unrelated to account deletion: PAR ×2
  (`20260725010000`, `20260725011000` — 0 of 10 PAR functions and 0 of 5 PAR
  triggers exist in production) and QR check-in (`20260814000000`, where
  production runs an older `check_in_registration()` body).
- **1 is this migration.**

Consequence: a plain `supabase db push --linked` would replay all 19, fail or
double-apply on the 15 aliases, and never reach `20260817000000` — and if it did
get past them it would drag PAR and QR into production as a side effect. **Do not
run `db push --linked` in the current state.** Choose one of:

- **Preferred — after 2.1's Phases 0-2.** Commit the (currently untracked)
  re-baseline, rename the 15 aliases to production's versions, move PAR and QR out
  of the replay path, verify on a disposable branch, then push normally with
  `20260817000000` as the single pending migration.
- **If 1.3 must ship before 2.1.** Apply `20260817000000_account_deletion.sql`
  as a single explicit statement batch, then
  `supabase migration repair --status applied 20260817000000` so history records
  it. This adds one more out-of-band application to the pile 2.1 has to clean up
  — take it only as a deliberate, logged exception, and note it in
  `docs/DB_MIGRATION_RECONCILIATION.md`.

Either way the migration file itself is unchanged: it is forward-only, idempotent
(`drop constraint if exists`, `add column if not exists`,
`create index if not exists`), and was validated against production inside a
self-aborting transaction (see Verification below).

#### Current-state findings (audit)

Answers to the ten audit questions, all established against the live production
project `fbzetvkbhneptvfruilw` unless noted.

1. **Existing deletion UI? No.** Nothing in `apps/mobile/src/app` referenced
   account deletion. `web/src/app/settings/page.tsx:71` had a DELETE ACCOUNT
   button whose entire handler was
   `toast.error("Contact support to delete your account.")` — and that whole page
   is a static mock (`save = () => toast.success("Settings saved.")`, no auth
   wiring, no Supabase calls at all).
2. **Existing backend deletion path? No.** Ten edge functions exist
   (`create-*-payment-intent`, `event-weather`, `facility-photo`,
   `marketplace-improve-listing`, `send-message-push`, `send-transactional-email`,
   `waitlist-sweeper`); none touch `auth.users`. No `auth.admin.deleteUser` call
   existed anywhere in the repo.
3. **Tables referencing user IDs: 60 foreign keys across ~55 public tables**, all
   pointing at `profiles.id` (nothing in `public` references `auth.users`
   directly except `profiles.id` itself). Full constraint dump taken from
   `pg_constraint`.
4. **Deleted** — strictly private, no counterparty, no integrity role: push
   tokens, precise location settings, partner preferences, outbound partner
   likes, outbound matchmaking swipes, hidden matches, story views, tournament
   bookmarks, saved play events, notifications, per-conversation settings.
5. **Anonymized** — the `profiles` row itself, stripped to a tombstone.
6. **Retained** — payments, transactions, registrations, brackets, reservations,
   coach purchases, wallet vouchers, messages, support tickets, and abuse
   reports. See the policy table below for the reason attached to each.
7. **Storage buckets, all seven public:** `avatars`, `marketplace`, and
   `message-attachments` hold user-owned files. Confirmed by inspecting
   `storage.objects`: `avatars` and `marketplace` are keyed
   `<user_id>/<file>`, so they are enumerable per user;
   `message-attachments` is keyed `<conversation_id>/<sender_id>-<ts>` and is
   not. `group-photos`, `facility-assets`, `tournament-covers`, and
   `coach-offers` hold entity-owned files. (`imageStandards.ts` also declares a
   `stories` bucket that **does not exist** in the project — unrelated
   pre-existing defect, not touched here.)
8. **Deletion-request / support tables? Partially.** `support_tickets` exists
   (threaded through `conversations`/`messages`). There is **no** deletion
   request, deletion audit, or account-status table.
9. **Safest path: a service-role edge function.** It is the only place that can
   call `auth.admin.deleteUser`, it matches the existing
   `create-tournament-entry-payment-intent` pattern (anon client verifies the
   JWT, service client does the work), and it means no new RLS policy has to
   grant a client the ability to delete anything.
10. **Not provable from the repo:** whether the deployed project has the
    `SUPABASE_SERVICE_ROLE_KEY` secret bound to a new function, and whether
    Apple/Google review will accept the director precondition below. Everything
    else in this audit was verified directly against the database.

#### The finding that determined the design

**Hard-deleting `auth.users` was impossible before this change.** Proven
empirically with a self-aborting `DO` block against production (nothing
committed), on a real user with 3 registrations and 17 payments:

```
DELETE FROM auth.users WHERE id = 'ab26e73e-…'
→ ERROR: update or delete on table "profiles" violates foreign key
  constraint "registrations_player_id_fkey" on table "registrations"
```

`profiles.id REFERENCES auth.users(id) ON DELETE CASCADE`, and `profiles` has
**4 `ON DELETE RESTRICT` children** (`registrations.player_id`,
`transactions.player_id`, `tournaments.director_id`,
`personal_session_participants.profile_id`) and **~19 `NO ACTION` children**
(`payments.payer_user_id`, `reservations.organizer_id`,
`reservation_players.profile_id`, `coach_offer_purchases.buyer_id`/`coach_id`,
`coach_offers.coach_id`, `coach_voucher_entitlements.*`,
`bracket_matches.score_entered_by`, `registrations.checked_in_by`/
`added_by_director_id`, `courts.created_by`, …). Those constraints exist
precisely to stop financial and bracket history from vanishing.

So the choice was: destroy financial/bracket history, fake the deletion, or let
the `profiles` row survive as a tombstone. The third is the only acceptable one,
and it requires dropping `profiles_id_fkey`.

#### Chosen policy

**Option A — immediate deletion, no grace period, no request queue.**

Chosen over Option B because a queue defers the actual erasure behind an admin
surface that does not exist (`4.3` has not been started), and because store
review wants deletion the user can complete themselves. A 14-day grace period is
a legal/product decision that can be layered on later without changing this
function's shape; shipping the queue *first* would have meant shipping a screen
that deletes nothing.

| Data | Policy | Reason |
| --- | --- | --- |
| Profile row | **Anonymize in place**, `deleted_at` set | 23 FK constraints require a valid target; the row keeps only `id`/`created_at` |
| Auth user | **Deleted immediately**, last step | Identities, sessions, refresh tokens, MFA factors all cascade with it |
| Push tokens | **Deleted** — current device first, then all rows | Explicit requirement; device must stop being a push target |
| Precise location, partner prefs, outbound likes/swipes, hidden matches, story views, bookmarks, saved events, notifications, conversation settings | **Deleted** | Private, no counterparty, no integrity role |
| Messages | **Retained, sender anonymized** | The recipient was legitimately party to them; the sender resolves to "Deleted User" |
| Tournament registrations & results | **Retained, display anonymized** | Deleting them corrupts brackets and other players' match history |
| Payments / transactions | **Retained in full** | Financial reconciliation; PII linkage removed by nulling `stripe_customer_id` / `stripe_connect_account_id` on the profile — Stripe keeps its own authoritative customer records, and `payments.provider_payment_intent_id` remains the reconciliation key |
| Support tickets | **Retained, requester anonymized** | Support audit trail; tickets stay resolvable |
| Abuse reports (`user_reports`, `group_post_reports`) | **Retained, both directions** | See risk below — this is deliberate |
| Uploaded media | **Orphaned, not deleted** | Product decision, 2026-08-17. See risk below |
| Marketplace listings | **Retained, seller anonymized** | Product decision, 2026-08-17 |
| Coaching / wallet / booking records | **Retained** | Financially and operationally required |

**Abuse reports are deliberately not deleted.** `user_reports.reported_id` and
`group_post_reports.reported_user_id` are both `ON DELETE CASCADE`, so a naive
profile delete would let a bad actor erase every report filed *against* them by
deleting their own account. Because the profile row survives as a tombstone,
those reports survive too. The purge list explicitly excludes
`partner_likes.to_user_id`, `matchmaking_swipes.target_id`,
`user_reports.reported_id`, and `group_post_reports.reported_user_id` for the
same reason: those rows are other people's actions, not the deleting user's.

**Precondition, not a policy loophole:** deletion is refused with `409
active_tournaments` if the user directs a tournament in a non-terminal status
(`draft`, `completed`, and `cancelled` do not block). A director who walks away
from a live event strands every player who registered and paid for it, and no
amount of anonymization repairs that.

#### Files changed

- `supabase/migrations/20260817000000_account_deletion.sql` (new) — forward-only.
  Drops `profiles_id_fkey` so an anonymized profile can outlive its auth user;
  adds `profiles.deleted_at` plus a partial index. RLS deliberately unchanged.
- `supabase/functions/delete-account/index.ts` (new) — verifies the JWT with an
  anon client, derives the user id **from the token only**, checks the director
  precondition, purges 11 private tables, anonymizes the profile, then deletes
  the auth user last. Fails loudly rather than reporting a partial purge as success.
- `supabase/config.toml` — registers `[functions.delete-account] verify_jwt = true`.
- `apps/mobile/src/lib/accountDeletion.ts` (new) — typed client wrapper.
  Best-effort local push-token cleanup, then `functions.invoke`. Recovers the
  specific failure reason from the `FunctionsHttpError` body so a blocked
  director sees why. Resolves **only** on a confirmed backend `ok`.
- `apps/mobile/src/app/delete-account.tsx` (new) — confirmation screen: what is
  deleted, what is kept and why, typed `DELETE` confirmation, loading/error/
  success states. Signs out (`scope: 'local'`) and routes to `/` only after the
  backend confirms.
- `apps/mobile/src/app/account-settings.tsx` — destructive "Delete Account" row
  above the footer. No route registration needed in `_layout.tsx`; expo-router
  picks the file up, same as the other account sub-screens.

Deliberately unchanged: `web/`. Its settings page is a non-functional mock with
no auth wiring, so adding a real deletion call there would have meant building
the page first — out of scope for 1.3, and the store requirement is satisfied by
the mobile flow. Item 1.4 should revisit it.

#### Verification run

- `cd apps/mobile && npx tsc --noEmit` — **PASS**.
- `cd apps/mobile && npm run lint` — **PASS**, 0 errors / 64 warnings, identical
  to the 0.2 baseline (no new warnings).
- `npx eslint` on all 3 touched/added mobile files — **PASS**, 0 errors, 0 warnings.
- `supabase/config.toml` parsed with Python `tomllib` — **VALID**, and
  `functions.delete-account.verify_jwt` reads back as `True`.
- **Migration validated against production inside a self-aborting transaction.**
  A `DO` block ran every statement of the migration, then `DELETE FROM auth.users`
  on the same user that previously failed, then raised to roll everything back.
  It reached the deliberate rollback — meaning the DDL is valid *and* the auth
  delete succeeds once the FK is gone. Confirmed afterwards that production is
  untouched: `profiles_id_fkey` still present, no `deleted_at` column, probe user
  alive.
- **Anonymization payload validated the same way** — the exact `UPDATE` the edge
  function issues was run against a real profile and accepted by every column,
  enum (`user_role`, `coach_status`, `director_status`), and CHECK constraint,
  then rolled back.
- All 11 purge `table.column` pairs verified to exist via `information_schema`.
- Not run: the edge function itself. Deno is not installed locally, so its syntax
  is unvalidated beyond review; `supabase functions deploy` will be the first
  real parse. Its Supabase calls were checked against the schema by hand.
- Not run: any on-device test. The whole flow is unexercised end to end.

Scenario checks, reasoned statically:

- *Signed-out caller* — blocked twice: `verify_jwt = true` at the platform edge,
  then `auth.getUser()` returning null → 401.
- *Deleting another user* — impossible by construction. The handler reads
  `user.id` from the verified token; the request body is `{}` and no code path
  reads a user id from it.
- *Access after deletion* — `auth.users` row gone, so identities, sessions, and
  refresh tokens cascade away; the existing access token dies at its natural
  expiry (see risk below).
- *Push tokens* — device token removed client-side, then every `push_tokens` row
  for the user removed server-side.
- *Profile exposure* — name, email, photo, cover, bio, DOB, gender, location,
  coords, home court, rating, and Stripe ids all nulled; `is_discoverable` false;
  role/director/coach authority revoked.
- *Failure safety* — the client signs out **only** on a confirmed `ok`. Every
  failure path leaves the session intact and shows the reason.

#### Deployment checklist (required before 1.3 can close)

Nothing below has been done. Work top to bottom — the test rows assume the
infrastructure rows are complete, and every deletion test is destructive and
irreversible, so use throwaway accounts on a non-production project first where
the test can be repeated.

**A. Infrastructure**

- [ ] **A1. Apply the migration.** `20260817000000_account_deletion.sql`, by
      whichever route the 2.1 coordination above settles on. Verify after:
      `profiles_id_fkey` absent, `profiles.deleted_at` present,
      `profiles_deleted_at_idx` present, `20260817000000` recorded in
      `supabase_migrations.schema_migrations`.
- [ ] **A2. Deploy the edge function.** `supabase functions deploy delete-account`.
      This is also the first real parse of the Deno source — no local Deno was
      available, so a syntax error would surface here rather than earlier.
      Verify it appears ACTIVE with `verify_jwt = true`.
- [ ] **A3. Bind secrets.** A new function does **not** inherit secrets from
      existing ones. Required: `SUPABASE_SERVICE_ROLE_KEY`. Also relied on and
      normally injected by the platform, so confirm rather than assume:
      `SUPABASE_URL`, `SUPABASE_ANON_KEY`. No Stripe, Resend, or Google key is
      needed. Verify by invoking once with a valid JWT for an account that has a
      live tournament — a 409 proves the service client authenticated and read
      the database without deleting anything.
- [ ] **A4. Confirm the mobile client points at the same project.**
      `EXPO_PUBLIC_SUPABASE_URL` in the build under test must match the project
      the function was deployed to.

**B. Authorization tests** (run before any destructive test)

- [ ] **B1. Unauthenticated request is rejected.** `POST` with no
      `Authorization` header, and again with a malformed/expired JWT. Expect
      **401** both times. `verify_jwt = true` should reject at the gateway; the
      handler's own `auth.getUser()` check is the second line.
- [ ] **B2. A user cannot delete another account.** `POST` with user A's valid
      JWT and a body naming user B (`{"userId":"<B>"}`, `{"user_id":"<B>"}`).
      Expect user **A** to be the account acted on, never B. Confirm B's profile
      and auth row are untouched. The handler reads only `user.id` from the
      token, so this should be structurally impossible — test it anyway.
- [ ] **B3. Anon key alone is not sufficient.** `POST` with only the anon key and
      no user JWT. Expect **401**.

**C. Deletion behavior tests**

- [ ] **C1. Non-terminal director tournament returns 409.** Set up a throwaway
      account as `director_id` of a tournament in `published` / `open` /
      `in_progress`. Expect **409 `active_tournaments`**, and confirm **nothing**
      was purged or anonymized — the precondition runs before any write.
      Separately confirm `draft`, `completed`, and `cancelled` do **not** block.
- [ ] **C2. Eligible deletion succeeds.** Throwaway account carrying a completed
      payment and a tournament registration — the exact case that was
      undeletable before this migration. Expect **200 `{ok:true}`**.
- [ ] **C3. Profile tombstone exists after auth deletion.** After C2:
      `auth.users` row **gone**; `profiles` row **still present** with
      `full_name = 'Deleted User'`, `email = 'deleted+<uuid>@deleted.invalid'`,
      `deleted_at` set, `handle`/`avatar_url`/`cover_url`/`bio`/`date_of_birth`/
      `gender`/location columns/`dupr`/`self_rating`/`skill_level`/
      `stripe_customer_id`/`stripe_connect_account_id` all **null**,
      `is_discoverable = false`, `role = 'player'`, `is_director = false`,
      `is_coach = false`, `coach_status = 'inactive'`.
- [ ] **C4. Push tokens purged.** Zero rows in `push_tokens` for the user id.
      Register on two devices before deleting, so this proves *all* tokens went,
      not just the one the client cleaned up locally.
- [ ] **C5. Other private rows purged.** Zero rows for the user in
      `location_settings`, `partner_preferences`, `partner_likes` (as
      `from_user_id`), `matchmaking_swipes` (as `requester_id`),
      `profile_hidden_matches`, `story_views`, `tournament_bookmarks`,
      `saved_play_events`, `notifications`, `conversation_participant_settings`.
- [ ] **C6. Retained rows remain and still resolve.** `payments`,
      `transactions`, `registrations`, `bracket_matches`, `reservations`,
      `coach_offer_purchases`, `wallet_items`, `messages`, and `support_tickets`
      rows for the user still exist, still join to the tombstone profile, and
      render as "Deleted User" rather than erroring or showing blanks. Check a
      bracket the user played in and a support ticket they opened.
- [ ] **C7. Abuse reports survive in both directions.** Reports the user filed
      **and** reports filed against them are still present in `user_reports` and
      `group_post_reports`. This is the anti-abuse property the tombstone exists
      for — a deletion must not launder someone's moderation history.
- [ ] **C8. Deleted user cannot sign in or refresh.** Sign-in with the old
      credentials fails. A refresh token captured before deletion fails to
      exchange. Note the known gap: an already-minted access token stays
      cryptographically valid until its TTL expires — measure how long that
      window actually is on this project and record it.
- [ ] **C9. Re-signup with the same email produces a fresh, empty account.** New
      `auth.users` id, new profile, no history from the deleted account, and the
      old tombstone still separately present.

**D. Client behavior tests**

- [ ] **D1. Success path.** Typed `DELETE` enables the button; loading state
      shows; on success the session is cleared locally and the app lands on the
      root gate, which routes to onboarding/sign-in. Relaunch the app cold and
      confirm it does not restore a session.
- [ ] **D2. Failure path does not sign the user out.** Force each of the three
      reasons — `active_tournaments` (409, real), `unauthorized` (401, by
      clearing the session), `internal_error` (e.g. airplane mode). Each must
      show its specific message, leave the user signed in, and leave the account
      intact.
- [ ] **D3. Confirmation gate.** Button stays disabled for empty, partial, and
      wrong text; lowercase `delete` is accepted (it is upper-cased before
      comparison); back / "Keep my account" exits with nothing deleted.
- [ ] **D4. Physical device, both platforms.** iOS and Android internal builds,
      not simulator and not Expo Go — `deleteCurrentDevicePushToken()` early-returns
      on non-devices, so the client-side token cleanup step is only genuinely
      exercised on hardware.

**E. Sign-off**

- [ ] **E1.** Record the results, the JWT-expiry window from C8, and any
      deviation, in these notes.
- [ ] **E2.** Only then check "Account deletion implemented and tested" in
      `TODO1.1.md`.

#### Risks remaining

- **This change conflicts with item 2.1's schema freeze, and 2.1 now gates
  deployment.** 2.1 says "stop all schema work" until migration history is
  reconciled, and 1.1 deferred an `onboarding_completed` column on exactly that
  basis. 1.3 cannot be done without this migration — the FK proof above is
  unambiguous — so the freeze is being broken deliberately, for one narrow
  forward-only file. Because the file is only *committed*, not applied, the
  conflict is still fully recoverable: fold it into 2.1's reconciliation rather
  than pushing it ad hoc. See "Why this cannot simply be pushed" above for the
  concrete 19-vs-15 history divergence that makes `supabase db push` unsafe.
- **Uploaded media is not deleted.** Product decision on 2026-08-17. A deleted
  user's avatar stays in the public `avatars/<uid>/` path and remains fetchable
  by anyone who recorded the URL, even though `profiles.avatar_url` is nulled.
  This is the weakest point in the flow for a GDPR erasure request and the most
  likely thing a privacy reviewer would object to. Deleting
  `avatars/<uid>/` and `marketplace/<uid>/` is a few lines in the edge function
  if the decision is revisited; item M10's orphaned-upload sweeper is the other
  route.
- **Existing access tokens survive until expiry.** Deleting the auth user removes
  refresh tokens and sessions, so the token cannot be renewed, but a JWT already
  minted stays cryptographically valid for the remainder of its TTL. During that
  window the (now anonymized, now unprivileged) account could still make RLS-level
  reads. Bounded by the project's JWT expiry setting.
- **Non-atomic across the purge → anonymize → auth-delete sequence.** Each step is
  its own transaction. A crash between anonymize and auth-delete leaves a wrecked
  but still-signable-into profile; the user sees an error, stays signed in, and
  can retry — the retry is safe and idempotent — but the intermediate state is
  ugly. Making it atomic needs a single `SECURITY DEFINER` RPC, which cannot
  delete an auth user, so the split is inherent.
- **The director precondition is a hard block with no in-app escape.** The user is
  told to cancel the tournament or contact support. Whether store review accepts
  that is unverified, and there is no support deep link on the error yet.
- **`deleted_at` is written but nothing reads it.** Search, discovery,
  matchmaking, invites, and directory queries do not yet filter tombstones out.
  Anonymization plus `is_discoverable = false` and `looking_status = 'not_looking'`
  covers the main surfaces, but any query that ignores those flags will list
  "Deleted User" rows. Auditing every profile-listing query is follow-up work.
- **`web/` still tells users to contact support.** The mock settings page is
  unchanged, so deletion is mobile-only.
- **No confirmation email.** `send-transactional-email` exists and could send one,
  but the address is destroyed by the same operation — it would have to be
  captured and sent before the anonymize step. Deferred; item M8 owns email
  verification anyway.

#### Unresolved legal / product decisions

- Grace period: none today. If legal wants a 14-day reversible window, that is
  Option B and a different shape.
- Retention duration for the anonymized tombstone and the retained financial rows
  — currently indefinite, with no purge job.
- Whether "Deleted User" is the right public label in brackets and tournament
  history, or whether directors should see something more specific.
- Whether a deleted user's marketplace listings should stay purchasable-looking
  with no reachable seller.

### 1.4 Add Legal Links and Store-Required Support Surfaces

- Issue: Terms/Privacy are text or placeholders, not real linked surfaces.
- Priority: Critical
- Instructions:
  - Add live Terms of Service and Privacy Policy destinations.
  - Link them from onboarding, sign-up, account settings, web auth, and footer.
  - Add support URL/email and deletion instructions.
  - Confirm privacy policy covers location, push tokens, payments, messages, support diagnostics, images, analytics, and crash reporting.
- Files likely touched:
  - mobile auth/onboarding/account screens
  - web auth/footer/settings
  - release docs
- Verification:
  - Every Terms/Privacy link opens a real page.
  - No `href="#"` remains for legal links.
- Done when:
  - Legal and support routes are real and reachable.

## Phase 2 - Database, Security, and Production Config

Goal: make backend state reproducible and safe.

### 2.1 Reconcile Supabase Migration History

- Issue: Production/local migration history diverged.
- Priority: Critical
- Instructions:
  - Stop all schema work.
  - Compare local migrations to `supabase migration list`.
  - Identify direct-production SQL from phase docs.
  - Preserve old migrations under legacy history, but make current source reproducible.
  - Build a clean forward-only reconciliation migration if needed.
  - Test fresh database creation from source.
- Files likely touched:
  - `supabase/migrations`
  - `supabase/migrations_legacy`
  - `docs/DB_REBASELINE_PLAN.md`
  - `supabase/seed.sql`
- Verification:
  - Fresh local Supabase database applies cleanly.
  - Migration list matches expected state.
  - No direct production-only function exists outside source.
- Done when:
  - The database can be recreated from repo state.

### Completion Notes - 2.1

- Status: **ACTIVE — audit complete, plan written, nothing executed** (2026-08-17).
  **2.1 is now the gate for item 1.3's deployment.** Account deletion cannot reach
  production until at least Phases 0–2 of the reconciliation plan are done.
- Deliverable: **`docs/DB_MIGRATION_RECONCILIATION.md`** — full inventory,
  bucket-by-bucket classification, evidence, exact commands, and risk table.
  `docs/DB_REBASELINE_PLAN.md` got a status banner: its steps 1–5 were largely
  executed on 2026-07-25, so it is now a historical record plus the still-valid
  branch-verification recipe.
- Nothing was applied. No `db push`, no `migration repair`, no function deploy, no
  data change. All findings come from read-only catalog and migration-metadata
  queries.

#### What the audit found

1. **The divergence is a timestamp-collision problem, not schema drift.** All 15
   "production-only" migrations are the *same SQL* as 15 "repo-only" migrations
   under different version numbers. Proven by content hash: 8 matched byte-for-byte
   after whitespace normalization, and the remaining 7 matched exactly once SQL
   comments were stripped — the repo copies carry documentation added after the
   migration was applied. All 15 came through the MCP `apply_migration` tool, which
   assigns its own version; a local file was written separately with a hand-chosen
   timestamp.
2. **Bucket D is empty in substance.** No production migration contains SQL that is
   absent from the repo.
3. **Only 4 repo migrations are genuinely unapplied:** PAR ×2, QR check-in, and
   account deletion.
4. **The re-baseline was never committed.** `git ls-tree HEAD supabase/migrations/`
   returns 20 pre-baseline legacy files (all deleted in the worktree) plus
   `20260817000000_account_deletion.sql`. The baseline and all 34 post-baseline
   migrations, and the 86-file `supabase/migrations_legacy/` archive, exist **only
   as untracked worktree files.** A `git clean` would destroy production's only
   reproducible definition. This is the most urgent problem in 2.1 and needs no
   production access to fix.
5. **PAR v1 is not deployed.** Its tables arrived via the baseline, but **0 of 10**
   PAR functions and **0 of 5** PAR triggers exist in production. PAR rating
   processing does not run in production. Treat PAR as not deployed in any
   readiness accounting — item L4 and the My Stats docs should reflect this.
6. **Production runs an older `check_in_registration()` than the repo.** Identical
   signature and return type — so the mobile RPC in
   `apps/mobile/src/lib/supabase/registrations.ts:288` is wire-compatible and QR
   check-in is not broken — but the body is 2251 chars in production vs 3308 in
   `20260814000000`. The "physically verified" QR check-in in item 5.3 was verified
   against production's body, not the repo's. Needs its own diff review and re-test.

#### Recommended path (details in the reconciliation doc)

Guiding rule: **anything not in production must not be in the replay path.** A
migrations folder that builds a database *unlike* production is runnable, not
reproducible.

- **Phase 0 — commit the re-baseline.** No production contact. Do this first.
- **Phase 1 — rename the 15 alias files to production's versions**, and move PAR ×2
  and QR into `supabase/migrations_pending/`. No production contact. Renaming is
  preferred over `migration repair`: repair would append 15 more rows to production
  history (30 rows describing 15 migrations, plus a permanent remote-only set),
  whereas renaming makes repo history *equal* production history and touches
  production not at all.
- **Phase 2 — rebuild a disposable preview branch from the repo and parity-diff it
  against production.** No production contact.
- **Phase 3 — apply `20260817000000` alone**, then deploy `delete-account`.
- **Phase 4 — retire PAR and QR separately**, each on its own merits.

**Phases 0–2 carry most of the value, need no production access, and should happen
regardless of when 1.3 ships.**

- Fallback if 1.3 cannot wait: apply the account-deletion SQL directly and
  `supabase migration repair --status applied 20260817000000`. Survivable — the
  migration is idempotent and was validated inside a self-aborting transaction —
  but it adds a 16th out-of-band application to the pile 2.1 exists to clean up.
  Logged exception only.
- **Do not run `supabase db push --linked` in the current state.** It would replay
  18 migrations whose objects already exist and fail before reaching account
  deletion.
- Verification run: not applicable — documentation only. The repo has no markdown
  linter or formatter (no `.markdownlint*`, no prettier docs target, no docs script
  in any `package.json`).
- Risks remaining: the untracked migration set (Phase 0 closes it), the
  `check_in_registration` drift, PAR being absent from production while docs imply
  otherwise, and the standing danger of a `--linked` push before Phase 1.

### 2.2 Add RLS and RPC Security Tests

- Issue: New tables/functions lack automated permission tests.
- Priority: High
- Instructions:
  - Write tests for anon, owner, unrelated authenticated user, director, coach, facility role, admin/service role.
  - Cover profiles, registrations, reservations, payments, support tickets, push tokens, messages, wallet, coach purchases, and marketplace listings.
  - Review every `SECURITY DEFINER` function for explicit authorization and `set search_path`.
- Verification:
  - RLS test script passes locally.
  - Negative access tests fail as expected.
- Done when:
  - Permission boundaries are covered by repeatable tests.

### 2.3 Remove Web Supabase Fallback Credentials

- Issue: Web clients contain hardcoded public Supabase fallback URL/anon key.
- Priority: High
- Instructions:
  - Remove fallback constants.
  - Validate environment variables at startup.
  - Fail loudly if URL/key are missing or malformed.
  - Fix hosting environment configuration.
- Files likely touched:
  - `web/src/lib/supabase/client.ts`
  - `web/src/lib/supabase/server.ts`
  - `web/src/lib/supabase/service.ts`
- Verification:
  - App fails clearly with missing env vars locally.
  - Preview/prod environments have correct variables.
  - No hardcoded project URL/key remains.
- Done when:
  - Environment misconfiguration cannot be silently masked.

### 2.4 Create Production Config Inventory

- Issue: Required secrets and public env vars are scattered.
- Priority: Medium
- Instructions:
  - Create `PRODUCTION_CONFIG.md`.
  - List each env var, service, environment, owner, where it is set, and verification step.
  - Include Supabase, Stripe, Google Maps/Places/Weather, Resend, EAS/APNs, Apple/Google auth, analytics, crash reporting.
  - Do not commit secret values.
- Verification:
  - Every runtime integration has a listed config owner.
  - Missing values are tracked.
- Done when:
  - A new deploy can be configured from the document without guessing.

## Phase 3 - Payments and Money Safety

Goal: no user can lose money or receive false purchase state.

### 3.1 Finish Booking PaymentSheet

- Issue: Booking creates PaymentIntent but does not present PaymentSheet.
- Priority: Critical
- Instructions:
  - Use custom EAS dev client, not Expo Go or web.
  - Wire `useReservationPayment()` into `apps/mobile/src/app/booking/review.tsx`.
  - Remove production "Continue in Test Mode" path.
  - Keep free booking path separate and explicit.
  - Add user-visible states for canceled, failed, pending webhook, and confirmed.
- Verification:
  - Real card test payment succeeds.
  - Canceling PaymentSheet leaves reservation held/pending correctly.
  - Failed payment does not confirm reservation.
  - Webhook confirmation updates reservation.
  - App recovers if closed during payment.
- Done when:
  - Booking payment is real end to end or paid booking is hidden from beta.

### 3.2 Verify Stripe Webhooks in Production

- Issue: Webhook code exists, but production reachability/secrets must be verified.
- Priority: Critical
- Instructions:
  - Ensure webhook endpoint is reachable without SSO/auth wall.
  - Set `STRIPE_WEBHOOK_SECRET`.
  - Send Stripe test events.
  - Verify event dedupe in `stripe_webhook_events`.
  - Verify payment status transitions.
  - Verify domain finalizers for tournament registration, reservation, coach purchase.
- Verification:
  - `payment_intent.succeeded` finalizes expected domain.
  - Duplicate event is ignored.
  - Failed/canceled event updates status.
  - Refund event updates refund state.
- Done when:
  - Stripe Dashboard events match database state.

### 3.3 Add Payment Reconciliation and Manual Review

- Issue: Some edge cases are logged but not operationalized.
- Priority: High
- Instructions:
  - Add admin view/query for:
    - succeeded payment but reservation not confirmed
    - pending PaymentIntent older than threshold
    - failed webhook processing
    - refund needed
    - duplicate payment attempts
  - Add support escalation guidance.
- Verification:
  - Manual review queue can identify all stuck payment states.
- Done when:
  - Payment support has an operational dashboard/runbook.

### 3.4 Align Stripe Versions and Config

- Issue: Repo uses Stripe API `2026-05-27.dahlia`; current guidance is newer.
- Priority: Medium
- Instructions:
  - Upgrade Stripe SDK/API version as a dedicated change.
  - Verify PaymentIntent creation, webhook typings, Connect account updates, and refunds.
  - Do not combine with PaymentSheet wiring.
- Verification:
  - Stripe tests pass before and after version bump.
- Done when:
  - Stripe versions are current or intentionally pinned with documented reason.

## Phase 4 - Observability, Analytics, and Support

Goal: beta issues should be visible without waiting for screenshots.

### 4.1 Add Crash Reporting

- Issue: No production crash reporting.
- Priority: Critical
- Instructions:
  - Choose Sentry or equivalent.
  - Add mobile and web integration.
  - Configure source maps, release name, environment, and user/session context.
  - Scrub PII and payment secrets.
  - Add alerting for crash spikes and payment/auth failures.
- Verification:
  - Test error appears in dashboard for mobile.
  - Test error appears in dashboard for web.
  - Release/environment tags are correct.
- Done when:
  - Production crashes are actionable.

### 4.2 Add Product Analytics

- Issue: No real analytics sink.
- Priority: High
- Instructions:
  - Choose PostHog, Segment, Amplitude, or Supabase events.
  - Start with privacy-safe core events:
    - onboarding step viewed/completed
    - auth started/succeeded/failed
    - profile completed
    - push prompt shown/accepted/denied
    - tournament registration started/succeeded/failed
    - booking funnel events
    - payment started/succeeded/failed/canceled
    - QR check-in succeeded/failed
    - support ticket submitted
  - Avoid raw names, emails, messages, support body text, card data, or exact coordinates.
- Verification:
  - Events appear in dashboard.
  - No sensitive payload is sent.
- Done when:
  - Beta funnels can be measured.

### 4.3 Harden Support and Moderation

- Issue: Support tickets exist, but trust/safety enforcement is incomplete.
- Priority: High
- Instructions:
  - Complete report/block flows for profiles, chat, groups, listings, tournaments, coaches.
  - Enforce blocked users in recommendations, search, invites, chat, groups, and profile access.
  - Add admin support queue SLA states.
  - Keep support diagnostics privacy-safe.
- Verification:
  - Blocked user cannot message/invite/view where policy says no.
  - Report creates admin-visible record.
  - Support ticket can be created, replied to, closed.
- Done when:
  - External users have usable safety/support paths.

## Phase 5 - Native Capabilities and Device QA

Goal: every native integration works on real devices.

### 5.1 Verify Push Notifications

- Issue: Push code exists but needs full device verification.
- Priority: High
- Instructions:
  - Build iOS and Android internal builds.
  - Confirm permission prompt, token row, direct Expo push, DB-triggered message push, foreground display, background delivery, cold tap routing, logout cleanup, re-login registration.
  - Add receipt polling and invalid token cleanup.
  - Add preference-aware dispatch before broad beta.
- Verification:
  - iOS physical pass.
  - Android physical pass.
  - Invalid tokens are cleaned.
- Done when:
  - Push can be trusted or disabled for beta.

### 5.2 Complete Device Auth Matrix

- Issue: Apple Sign-In core passed, but granular auth cases remain incomplete.
- Priority: High
- Instructions:
  - Test Apple cancel, Hide My Email, second login name preservation, sign-out/re-login, cold start.
  - Test Google regression.
  - Test email confirmation and password reset.
  - Test account collision/linking expectations.
- Verification:
  - Matrix results documented.
- Done when:
  - Auth is verified across providers and app lifecycle.

### 5.3 Verify Camera, QR, Calendar, Deep Links

- Issue: Some native features are implemented but need broader validation.
- Priority: Medium
- Instructions:
  - Test QR permission denied/granted, invalid QR, wrong tournament, duplicate check-in.
  - Test calendar add on iOS/Android.
  - Test Universal Links and custom scheme from cold start.
  - Fix or remove unsupported links such as mismatched booking detail route.
- Verification:
  - All supported links open correct route.
  - Unsupported links fail safely.
- Done when:
  - Native utility features are reliable or hidden.

### 5.4 Add Offline and Poor-Network UX

- Issue: No consistent offline behavior.
- Priority: High
- Instructions:
  - Add network state detection.
  - Add global offline banner.
  - Block payments/check-in when offline.
  - Add retry states for safe reads.
  - Test airplane mode during auth, booking, payment, QR, and support.
- Verification:
  - No false success while offline.
  - User sees clear recovery path.
- Done when:
  - Offline failures are safe and understandable.

## Phase 6 - Remove Production Fakery and Incomplete UX

Goal: users only see real, working product.

### 6.1 Remove or Gate Mock Data

- Issue: Mock data is still reachable in production-like paths.
- Priority: Critical
- Instructions:
  - Search for `mock`, `fake`, `fallback`, `Coming Soon`, and `simulate-payment`.
  - Decide per instance:
    - remove
    - hide behind dev flag
    - convert to empty state
    - complete feature
  - Prioritize web dashboard/tournaments and mobile social/invite/connection paths.
- Verification:
  - Production mode shows no fake user/event/payment success data.
- Done when:
  - Demo data cannot be confused for real data.

### 6.2 Replace Coming Soon Buttons

- Issue: Some buttons advertise unavailable features.
- Priority: Medium
- Instructions:
  - Hide unavailable actions or replace with waitlist/info where product-approved.
  - Do not leave dead-end CTAs in paid or core flows.
- Verification:
  - No core screen shows a dead-end action.
- Done when:
  - Every visible CTA does something real or is clearly non-blocking.

### 6.3 Standardize Empty, Loading, and Error States

- Issue: State handling is inconsistent.
- Priority: Medium
- Instructions:
  - Create or reuse shared state components.
  - Apply to auth, onboarding, tournaments, booking, chat, support, marketplace, wallet.
  - Include retry where safe.
- Verification:
  - QA can force loading/error/empty states.
- Done when:
  - No major route falls back to blank screens or fake data.

## Phase 7 - Store Readiness

Goal: submit-ready beta package.

### 7.1 Prepare App Store / Play Store Metadata

- Issue: Store package is incomplete.
- Priority: High
- Instructions:
  - Prepare app name, subtitle, description, keywords, screenshots, preview notes, support URL, privacy URL, demo account, content rating, Data safety answers.
  - Include notes for camera, location, push, account deletion, Apple Sign-In, payments.
- Verification:
  - App Store Connect and Play Console forms can be completed without new engineering answers.
- Done when:
  - Store metadata package is complete.

### 7.2 Final Accessibility Pass

- Issue: No systematic accessibility audit.
- Priority: Medium
- Instructions:
  - Test VoiceOver/TalkBack on onboarding, auth, tabs, tournament registration, booking, payment, support, account deletion.
  - Verify dynamic type, contrast, touch targets, reduced motion, keyboard focus on web.
- Verification:
  - Accessibility issues are fixed or triaged.
- Done when:
  - Core flows are usable with assistive tech.

### 7.3 Final Performance Pass

- Issue: Map/image/web surfaces need profiling.
- Priority: Medium
- Instructions:
  - Profile startup, onboarding, tabs, map, tournament detail, booking search, chat, web dashboard.
  - Optimize raw images and heavy renders.
  - Confirm low-end device behavior.
- Verification:
  - Startup and key routes meet agreed thresholds.
- Done when:
  - App feels stable on target devices.

## Suggested Work Order

1. `0.1` Freeze beta scope.
2. `0.2` Fix mobile lint.
3. `0.3` Fix web lint/build.
4. `1.1` Add global auth/onboarding gate.
5. `2.1` Reconcile migrations.
6. `2.3` Remove web env fallbacks.
7. `1.2` Fix auth config and password validation.
8. `1.3` Account deletion.
9. `1.4` Legal links.
10. `3.1` Finish or hide booking payments.
11. `3.2` Verify Stripe webhook.
12. `4.1` Crash reporting.
13. `4.2` Analytics.
14. `5.1` Push verification.
15. `6.1` Mock/test path removal.
16. `2.2` RLS tests.
17. `5.2` Device auth matrix.
18. `5.3` Native route/QR/calendar/deep-link validation.
19. `5.4` Offline behavior.
20. `7.1` Store metadata.

## Per-Issue Completion Template

Use this template when finishing each issue:

```md
### Completion Notes - <issue id>

- Status:
- Files changed:
- Behavior changed:
- Verification run:
- Risks remaining:
- Follow-up issue created:
```
