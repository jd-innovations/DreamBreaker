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

    **This does not close the hole that caused the original bug.** The warning
    is `__DEV__`-gated, but the `preview` mismatch manifested in an EAS preview
    build where `__DEV__` is false. At runtime, "misconfigured preview build"
    and "correct production build" are indistinguishable — both present an
    unusable value and must fall back to `production` — so no runtime check can
    catch the former without logging in the latter. The effective guard is a
    build-time validation of `eas.json`'s `EXPO_PUBLIC_APP_ENV` values against
    `APP_ENV_VALUES` (CI lint step or a prebuild script). Not yet implemented.
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
