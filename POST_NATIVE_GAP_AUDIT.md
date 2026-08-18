# Pickleballapp Post-Native / Pre-TestFlight Gap Audit

## Executive Summary

This is a fresh read-only repository audit of DreamBreaker / pickleballapp after the native capability phases. Current code has materially advanced since `NATIVE_CAPABILITIES_AUDIT.md`: push notifications, haptics, Universal Links, QR scanning, tournament QR check-in, native calendar event creation, Stripe provider wiring, and Apple Sign-In code/config now exist in the repo.

Overall readiness: **READY FOR TESTFLIGHT WITH KNOWN GAPS**.

The app is not yet an App Store submission candidate. The highest-risk gaps are: unresolved Supabase migration-history divergence, missing in-app account deletion, an onboarding Apple Sign-In path that still behaves like an unfinished stub, production-reachable booking test-mode confirmation/payment gap, hard-coded bearer JWT literals in SQL migrations, incomplete external configuration verification, and limited production crash/error/analytics visibility.

The current codebase can likely produce a meaningful internal TestFlight build for real-device validation, but only if the team treats the build as a validation vehicle, not as a production release candidate. Do not run `supabase db push` against production until migration reconciliation is complete.

## Overall Readiness

READY FOR TESTFLIGHT WITH KNOWN GAPS

| Area | Status | Severity | Finding | Recommended Action |
|---|---|---|---|---|
| Supabase migrations | RISK | P0 - TestFlight/release blocker | Phase reports document local and production migration histories diverged; current repo contains direct-production SQL workarounds. | Freeze production `db push`; reconcile history before any schema deploy. |
| Account deletion | GAP | P1 - fix before App Store submission | No in-app account deletion UI or backend `auth.users` deletion path found. | Implement deletion/anonymization flow before App Review. |
| Apple Sign-In onboarding | GAP | P0 - TestFlight/release blocker | Standalone Apple Sign-In exists, but onboarding `create-account` Apple button does not call it and finalize still errors that Apple is unavailable. | Fix before testing onboarding with Apple. |
| Booking payment | GAP | P0 - TestFlight/release blocker | Booking review still creates a PaymentIntent then offers "Continue in Test Mode"; no native PaymentSheet call in that route. | Wire `useReservationPayment()` or hide paid booking from TestFlight. |
| Edge Function config | GAP | P1 - fix before App Store submission | `create-booking-payment-intent` exists in `supabase/functions` but has no `[functions.create-booking-payment-intent]` entry in `supabase/config.toml`. | Add config entry during implementation phase. |
| Secrets in SQL | RISK | P1 - fix before App Store submission | Bearer JWT literals exist in baseline/transactional-email migrations. | Rotate/review credentials and replace hard-coded SQL auth where possible. |
| Universal Links | NEEDS VERIFICATION | P1 - fix before App Store submission | AASA route depends on `APPLE_TEAM_ID`; Phase 4 documented apex redirect risk. | Verify live AASA returns 200 without redirect and correct appID. |
| Apple Sign-In config | NEEDS VERIFICATION | P0 - TestFlight/release blocker | Code/plugin exist; Phase 7 says no EAS build or physical iPhone test yet. | Verify Apple Developer capability and Supabase Authorized Client IDs; build/test. |
| Push notifications | NEEDS VERIFICATION | P2 - important but can follow | Client/server path exists; receipt cleanup and physical APNs evidence remain incomplete. | Test through TestFlight; add stale-token cleanup before launch. |
| Crash/error monitoring | GAP | P2 - important but can follow | No dedicated production crash reporter found. | Add before broad external TestFlight or App Store launch. |
| UGC moderation | GAP | P1 - fix before App Store submission | Reports/block tables and some UI exist; block filtering is explicitly not wired globally. | Complete critical report/block flows before App Review. |
| Deferred native features | DEFERRED | P3 - polish/optional | Apple Maps as primary Google replacement, Live Activities, HealthKit, booking QR, coach voucher redemption are intentionally parked. | Do not block TestFlight unless their UI presents them as done. |

## 1 - Original Native Audit Reconciliation

| Capability | Original Finding | Current Implementation | Physical Evidence | Remaining Gap | Production Relevance |
|---|---|---|---|---|---|
| Push Notifications | Missing client native registration/routing. | `expo-notifications` installed/configured; `usePushNotifications()` registers existing permission, foreground/listener/tap handling; token upsert/delete uses `push_tokens` (`apps/mobile/src/lib/pushNotifications.ts:75`, `:124`, `:144`). | Phase 1 says NOT TESTED end-to-end. | APNs/EAS credentials, receipt cleanup, stale-token cleanup, broader routing. | TestFlight should validate this. |
| Apple Maps / mapping | Apple Maps missing; Google Maps active. | iOS map renderer was changed to provider default in Phase 6; Google Maps API keys still configured in `app.config.js:3-4`, `:19-31`. | Phase 6 user-confirmed "maps work." | Google Maps iOS native SDK is not wired if Google tiles/styling are required on iOS. | Not a blocker if iOS default maps are acceptable. |
| Haptics | Scattered calls. | Central `haptics` utility exists; phase report says raw imports removed. | No physical feel testing except later flows. | Physical feel/accessibility polish. | Not a blocker. |
| Deep Linking / Universal Links | Custom scheme only, no Associated Domains/AASA. | Associated Domains set (`app.config.js:15-18`); AASA route exists (`web/src/app/.well-known/apple-app-site-association/route.ts:4-12`); resolver supports declared routes (`externalRouting.ts:72-95`). | Phase 4 reports one conversation Universal Link PASS; other states not tested. | Booking route mismatch; AASA env/domain redirect manual verification. | App Store risk if AASA unreliable. |
| QR Camera | Not implemented. | `expo-camera` configured with shared camera copy and microphone disabled (`app.config.js:62-78`); generic `QRScanner` and payload classifier exist. | Phase 5 physical iPhone PASS for scanner foundation. | Dev route production-reachable by path; business flows limited. | Scanner foundation ready; dev route should be hidden before App Store. |
| Tournament QR Check-In | Not implemented. | `check_in_registration()` RPC migration exists; manual and QR paths call shared RPC (`registrations.ts:287-313`; `check-in-scan.tsx:76-86`). | Phase 5.1 post-hotfix physical PASS. | Migration history divergence remains. | Production-worthy after migration reconciliation. |
| Calendar Integration | Not implemented. | `expo-calendar` installed; no plugin registered by design; native event editor only. | Phase 6 physical PASS at broad level. | Some scenarios not individually tested; booking Universal Link omitted because route missing. | Good TestFlight candidate. |
| Google OAuth | Needs redirect/device verification. | Browser OAuth uses Supabase session architecture (`auth.ts:42-65`) and SecureStore (`supabase.ts:13-37`). | Phase reports require external verification. | Dashboard redirect allow-list and provider/client config. | P0 for TestFlight auth matrix. |
| Stripe PaymentSheet | SDK installed, not mounted. | `StripeProvider` mounted (`_layout.tsx:7`, `:42`); tournament PaymentSheet hook in active use; booking hook exists but route not wired. | Phase 6 reports a real tournament registration/payment trace after webhook URL fix. | Booking still test-mode; Stripe dashboard/webhook needs verification. | P0 for paid booking testing. |
| Apple Sign-In | Server config only. | `expo-apple-authentication` installed/plugin; native flow added (`auth.ts:75-145`); standalone sign-in/up buttons gated by availability. | Phase 7: no EAS build, no device tests. | Onboarding Apple button is stale/unwired. | P0 before Apple onboarding TestFlight. |
| Live Activities | Not implemented. | No ActivityKit found. | None. | Deferred. | Not a blocker. |
| HealthKit | Not implemented. | No HealthKit found. | None. | Deferred pending My Stats/PAR product approval. | Not a blocker. |

## 2 - Native Configuration Audit

Fact found in repository:

- Authoritative config is `apps/mobile/app.config.js`.
- Bundle/package id: `com.dreambreakerpb.app` in `apps/mobile/app.json`.
- URL scheme: `dreambreaker` in `apps/mobile/app.json`.
- Associated Domains: `applinks:pickleballapp.app` in `app.config.js:15-18`.
- Plugins include router, splash, datetimepicker, fonts, web browser, secure store, asset, location, image picker, camera, notifications, Stripe, Apple auth, dev client (`app.config.js:34-105`).
- The shared camera permission solution exists: one `CAMERA_PERMISSION_TEXT` is passed to both image picker and camera (`app.config.js:6-9`, `:55-60`, `:62-78`).
- Camera microphone permissions are explicitly suppressed (`app.config.js:73-77`).
- Calendar plugin is intentionally not registered; repo comments explain least privilege (`app.config.js:81-93`).
- Stripe plugin is active with `enableGooglePay: false` (`app.config.js:94-98`).

Recommendation:

- Verify generated iOS entitlements in the next EAS artifact: Associated Domains and Apple Sign-In should both be present.
- Broaden photo permission copy before App Store because the current `photosPermission` mentions chat only while app surfaces also include avatars, support, marketplace, coach offers, groups, and event images (`app.config.js:57-58`).

## 3 - EAS / TestFlight / Production Build Audit

Fact found in repository:

- `eas.json` has `development` internal dev-client profile, `preview` internal distribution profile, and `production` channel with `autoIncrement: true` (`apps/mobile/eas.json:7-27`).
- `cli.appVersionSource` is `remote` (`apps/mobile/eas.json:2-5`).
- App version is `1.0.0` (`apps/mobile/app.json`).
- Production env selection is limited to `EXPO_PUBLIC_APP_ENV=production`; secrets and public API keys are not shown in repo.

Readiness:

- DEVELOPMENT BUILD READY: likely yes; recent phase reports show successful EAS development builds, but Apple Sign-In phase has not been rebuilt/tested.
- TESTFLIGHT BUILD READY: **ready with known gaps** if paid booking and onboarding Apple are fixed or excluded from the test plan.
- APP STORE BUILD READY: no, because account deletion, privacy/legal surfaces, external config verification, migration reconciliation, and production monitoring are incomplete.

Needs external verification:

- EAS credentials/provisioning profiles.
- APNs credentials.
- Apple Sign-In capability on App ID.
- App Store Connect app record and privacy details.
- Production `EXPO_PUBLIC_*` values and Stripe/Supabase/Google keys.

## 4 - Authentication Audit

Fact found in repository:

- Email/password sign-in and sign-up use Supabase (`auth.ts:13-37`).
- Email confirmations are enabled in Supabase local config (`supabase/config.toml` auth.email).
- Password reset handles both token shapes (`auth.ts:151-187`).
- Google OAuth uses `makeRedirectUri()`, `openAuthSessionAsync()`, then `supabase.auth.setSession()` (`auth.ts:42-65`).
- Apple native auth uses nonce, `AppleAuthentication.signInAsync()`, then `supabase.auth.signInWithIdToken()` (`auth.ts:75-145`).
- SecureStore-backed Supabase session persistence exists (`supabase.ts:13-37`).
- Auto-refresh stops/starts on AppState changes (`supabase.ts:39-50`).
- Logout deletes current device push token before `supabase.auth.signOut()` (`auth.ts:194-205`).

Gaps / risks:

- Onboarding Apple path is incomplete: `create-account.tsx` renders "Continue with Apple" but `chooseProvider('apple')` does not call `signInWithApple()` (`create-account.tsx:20-37`, `:83-90`). `finalizeOnboarding()` still returns "Apple Sign-In isn't available yet" when `authMethod === 'apple'` and no session/email password exists (`finalize.ts:107-113`).
- Standalone sign-up validates password length at 6 chars (`sign-up.tsx:56-58`) while Supabase config says minimum 8; this is not a security hole, but it creates avoidable UX errors.
- Provider collision behavior is entirely Supabase Dashboard-governed; no custom linking code found.

Recommendation:

- Fix onboarding Apple before a TestFlight auth matrix that includes Apple.
- Externally verify Supabase Apple Authorized Client IDs include `com.dreambreakerpb.app`, Google redirect URLs, and identity-linking settings.

## 5 - Onboarding Audit

Fact found in repository:

- Onboarding finalization maps draft fields into `profiles` either by authenticated `updateProfile()` for OAuth sessions or by email signup metadata for confirmation-required accounts (`finalize.ts:88-118`).
- Required completeness is not a hard gate in `profileCompletion.ts`; it computes a percentage across avatar, bio, handle, location, hand, style, skill/rating, and availability (`profileCompletion.ts:5-22`).
- OAuth-created users route to `/(tabs)/profile` after auth (`sign-in.tsx:58-60`, `:73-76`, `:90-93`; `sign-up.tsx:84-87`, `:101-104`).

Gaps:

- Apple during onboarding can bypass real auth and fail only at finalization. This is a TestFlight-blocking path if onboarding is the primary new-user flow.
- Onboarding legal text shows Terms/Privacy as styled text, not linked text (`create-account.tsx:107-110`).
- Some onboarding comments are stale and mention Apple as a no-op even though standalone Apple is now implemented (`finalize.ts:107-113`).

## 6 - Push Notification Audit

Fact found in repository:

- Client token registration uses Expo project id and upserts into `push_tokens` (`pushNotifications.ts:31-60`, `:75-113`).
- Logout cleanup deletes the current token (`pushNotifications.ts:124-141`; `auth.ts:194-205`).
- Startup registration does not prompt (`usePushNotifications.ts:19-31`); explicit prompting happens elsewhere.
- Foreground notifications show alert/sound/list but no badge (`usePushNotifications.ts:9-17`).
- Tap routing supports conversation id and URL/link data (`externalRouting.ts:98-108`; `pushNotifications.ts:144-157`).
- `push_tokens` has owner RLS (`baseline_from_prod.sql:4313-4326`, `:7447-7462`).

Gaps:

- No Expo receipt polling or stale-token cleanup found.
- No persisted quiet hours/category preferences in dispatch path.
- No evidence of APNs/EAS push credentials in repo; expected, but needs external verification.
- Phase 1 documented end-to-end push tests as not complete.

Classification:

- BLOCKER: only if TestFlight goal requires push validation on day one.
- SHOULD FIX BEFORE LAUNCH: stale-token cleanup and delivery error visibility.
- SAFE TO DEFER: marketing notification preferences.

## 7 - Universal Links / Deep Link Audit

Fact found in repository:

- AASA supports `/conversation/*`, `/groups/*`, `/tournament/*`, `/booking/*`, `/marketplace/*`, `/coach/offers/*`, `/claim/*`, `/community/*` (`web/.../apple-app-site-association/route.ts:4-12`).
- `appLinks` declares those plus `facility` (`appLinks.ts:12-33`).
- Resolver supports the AASA set but not facility (`externalRouting.ts:72-95`).
- `_layout.tsx` registers routes for conversation, groups, tournament, community, marketplace, claim, booking wizard screens, and coach offer edit/index/create, but no `booking/[id]` and no `coach/offers/[id]` detail route (`_layout.tsx:70-174`, `:106-121`, `:130-160`, `:210-213`).

Route comparison:

| Path | AASA | appLinks | Mobile route | Resolver | Status |
|---|---:|---:|---:|---:|---|
| conversation | Yes | Yes | Yes | Yes | PASS |
| groups | Yes | Yes | Yes | Yes | PASS |
| tournament | Yes | Yes | Yes | Yes | PASS |
| booking | Yes | Yes | No `/booking/[id]` | Yes | GAP |
| marketplace | Yes | Yes | Yes | Yes | PASS |
| coach offers | Yes | Yes | No public `[id]` detail, only edit/index/create | Yes | PARTIAL |
| claim | Yes | Yes | Yes | Yes | PASS |
| community | Yes | Yes | Yes | Yes | PASS |
| facility | No | Yes | Yes | No | SUPERSEDED/unsupported external path |

Historical booking gap status: **STILL OPEN**. `appLinks.booking(id)` exists (`appLinks.ts:18`, `:30`) and resolver returns `/booking/:id` (`externalRouting.ts:83-84`), but route inventory has no `apps/mobile/src/app/booking/[id].tsx`.

## 8 - QR Camera Audit

Fact found in repository:

- `expo-camera` installed and configured; microphone disabled (`app.config.js:62-78`).
- Generic `QRScanner` exports platform split (`components/index.ts`, `QRScanner.native.tsx`, `QRScanner.web.tsx`).
- `classifyQrPayload()` treats dev sentinel, HTTPS app links, `/q/<token>`, and unsupported content separately (`qrPayload.ts:23-74`).
- Dev route `dev-qr-scan` is registered in `_layout.tsx:67-69`.

Gaps:

- `dev-qr-scan`, `design-lab`, and `onboarding-preview` are production-route-reachable by direct path unless Expo Router/static config excludes them; no such exclusion found.
- Generic scanner remains reusable; business logic is in `check-in-scan.tsx`, not inside `QRScanner`.

Recommendation:

- Hide dev scanner/design routes before App Store and probably before external TestFlight.

## 9 - Tournament QR Check-In Audit

Fact found in repository:

- `check_in_registration(p_registration_id, p_tournament_id)` is a `SECURITY DEFINER` RPC with `SET search_path TO public` (`20260814000000...sql:34-47`).
- It authorizes director/tournament before reading registration, locks the row, handles wrong tournament, duplicates, eligibility, and qualified `returning r.checked_in_at` hotfix (`20260814000000...sql:80-127`).
- Manual `checkInPlayer()` calls the same RPC as QR (`registrations.ts:287-313`).
- Manual screen calls `checkInPlayer(reg.id, id)` (`check-in.tsx:241`); scanner calls `checkInRegistration(classification.token, tournamentId)` (`check-in-scan.tsx:76-86`).
- RLS policy still exists for director update own tournament (`baseline_from_prod.sql:7489-7491`).

Current status:

- Repository representation includes the ambiguity hotfix (`20260814000000...sql:120-124`).
- Production history differs from repository history per phase report; this must be reconciled.

## 10 - Calendar Integration Audit

Fact found in repository:

- `expo-calendar` installed but plugin not registered to avoid unnecessary calendar permissions (`app.config.js:81-93`).
- Calendar button is wired to booking confirmation, tournament detail/registration success, and community event detail per phase report.
- Calendar uses native event editor, not silent calendar writes.

Gaps:

- Booking calendar notes omit Universal Link because booking detail route is missing.
- Phase report says cancel/duplicate/timezone/cancelled gating and booking/community device tests were not individually itemized.

Recommendation:

- Keep no-permission approach; do not add two-way sync.

## 11 - Google Maps / Location Audit

Fact found in repository:

- Google Maps public keys are injected from `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` (`app.config.js:3-4`, `:19-31`).
- `expo-location` permission text is present (`app.config.js:47-52`).
- Phase 6 fixed iOS map rendering by using default provider; active Google API key restrictions still need external verification.

Risks:

- TestFlight can fail if production Google Maps/Places keys are missing, over-restricted, or only authorized for development bundle/domain/API set.
- Location denied fallback exists per prior audit, but should be physically tested.

## 12 - Stripe / Payments Audit

Fact found in repository:

- `StripeProvider` is mounted with `STRIPE_PUBLISHABLE_KEY` (`_layout.tsx:7`, `:42`).
- Shared Edge Function primitive never marks payment succeeded; webhook does (`supabase/functions/_shared/payments.ts:13-14`, `:55-58`; `web/src/app/api/stripe/webhooks/route.ts:69-80`).
- Webhook verifies `STRIPE_WEBHOOK_SECRET` and dedupes events (`web/src/app/api/stripe/webhooks/route.ts:24`, `:88-100`).
- Tournament PaymentSheet hook is active (`useTournamentEntryPayment.ts`), and registration screen comments state client never declares success (`register.tsx:341-345`).
- Booking payment intent Edge Function exists (`supabase/functions/create-booking-payment-intent/index.ts`) but is missing from `supabase/config.toml` entries (`supabase/config.toml:88-103`).
- Booking review still does not present PaymentSheet and allows direct test-mode confirmation (`booking/review.tsx:84-90`, `:119-126`, `:253-264`).
- Dev payment simulator is production-404 and secret-gated (`web/src/app/api/dev/simulate-payment/route.ts:16-35`).

Gaps:

- Paid booking is not production-safe as currently reachable. Client can continue in test mode after a PaymentIntent exists.
- Coach marketplace real-money path has payment creation/finalization architecture, but voucher redemption/payout lifecycle remains partial.
- Stripe dashboard webhook endpoint, signing secret, live/test mode separation, and Apple Pay merchant id need external verification.

## 13 - Supabase Database / Migration Audit

Critical fact:

- `TOURNAMENT_QR_CHECKIN_PHASE5_1.md` documents that normal `supabase db push` surfaced a pre-existing migration-history divergence: roughly 15 production migrations missing locally and roughly 15 local files not applied remotely. The phase applied direct SQL instead.
- Current repo contains local migrations through `20260814000000_tournament_qr_checkin_phase5_1.sql`.
- Current repo also contains `supabase/_baseline/pre_repair_inventory.txt`, indicating a prior repair/inventory effort.

Answer:

- Is it currently safe for a developer/AI coder to run `supabase db push` against production? **ONLY AFTER RECONCILIATION**.

Why:

- The CLI may replay local-only migrations, omit production-only migrations, or rewrite migration bookkeeping without proving schema equivalence.
- Direct production SQL for `check_in_registration()` may or may not align with the remote migration ledger.
- Generated `database.types.ts` was regenerated from live database and may reflect production drift not represented by local migration files.

Safe reconciliation plan:

1. Freeze production schema pushes.
2. Export production migration ledger and schema-only dump.
3. Diff every remote-only timestamp against current local schema.
4. Diff every local-only migration against production schema to determine already-applied-under-other-ID vs genuinely pending.
5. Create forward-only reconciliation migrations for schema gaps; use `migration repair` only after timestamp equivalence is proven.
6. Regenerate database types after reconciliation.
7. Document the reconciled ledger before allowing AI/developers to run `db push`.

Severity: P0 for production release safety; P1 for internal TestFlight if no schema pushes occur.

## 14 - RLS / Authorization Audit

Fact found in repository:

- `profiles` RLS enabled with public read and owner update constraints that prevent users changing role/director fields (`baseline_from_prod.sql:7432-7443`).
- `registrations` RLS includes admin, director, and player policies (`baseline_from_prod.sql:7470-7503`).
- `push_tokens` RLS is self-scoped (`baseline_from_prod.sql:7447-7462`).
- `payments` RLS is payer read/admin access only, with no authenticated write policy (`20260809140000_shared_payment_foundation.sql:74-83`).
- `reservations` and `reservation_players` RLS exists with public active read, participant/organizer/staff policies, and RPC-based creation/join/confirm/cancel (`20260809162811...sql:196-269`, `:309-613`).
- Marketplace, coach offers, coach purchases, and coach voucher entitlements have RLS and server-authoritative creation/finalization functions (`20260807050000_marketplace.sql:100-116`; `20260809160000...sql:132-152`; `20260810010000...sql:286-297`; `20260810020000...sql:134-148`).

Risks:

- Public `profiles` read is broad; it may be intended for discovery but drives App Store privacy-label and abuse considerations.
- Block table exists, but mobile code explicitly says block filtering is not wired globally (`apps/mobile/src/lib/services/blocking.ts:1-4`).
- SECURITY DEFINER functions generally set `search_path`, including `check_in_registration()`, but full RLS simulation was not run in this audit.

Recommendation:

- Run targeted RLS tests as authenticated non-owner, owner, director, admin, and service-role for payments, registrations, conversations/messages, reservations, marketplace, coach purchases, wallet, support, and reports.

## 15 - Secrets / Security Audit

Fact found in repository:

- No Stripe secret key, webhook secret, service-role key, Apple private key, `.p8`, Google secret, or Resend key value was found in tracked application code by secret-pattern search.
- Hard-coded bearer JWT literals exist in SQL migrations:
  - `supabase/migrations/20260725000000_baseline_from_prod.sql:2380`
  - `supabase/migrations/20260807000000_transactional_email.sql:77`
- The transactional-email migration comments classify the bearer as anon key (`20260807000000_transactional_email.sql:64`), but this is still a source-controlled credential and should be reviewed/rotated.

Do not print values:

- Values are intentionally not reproduced here.

Recommendation:

- Rotate/review the exposed bearer credentials.
- Prefer Edge Function secrets, Vault, or a database-safe config mechanism for function invocation auth.
- Confirm whether production triggers still use these exact literals.

## 16 - Permissions / Privacy Audit

| Permission/capability | Why Needed | Requested Where | User Initiated | Text / Least Privilege | Risk |
|---|---|---|---|---|---|
| Notifications | Message/in-app push | `expo-notifications`, explicit enable/settings | Yes for prompt; startup checks existing only | No custom iOS text in repo | Needs APNs/device test |
| Camera | QR and photo capture | image picker + camera plugins | Yes | Shared camera text includes photos and QR (`app.config.js:8-9`) | PASS |
| Photo library | Attach/upload images | image picker plugin | Yes | Mentions chat only (`app.config.js:57-58`) | Copy too narrow |
| Location | Nearby courts/games/tournaments | location plugin/services | Yes | When-in-use only (`app.config.js:47-52`) | PASS pending device tests |
| Calendar | Add event via native editor | No permission prompt | Yes | Least privilege, no plugin | PASS |
| Apple Sign-In | Auth | Entitlement plugin | Yes | Capability, not permission | Needs external config |
| Microphone | Not needed | Suppressed for camera | N/A | `microphonePermission: false` | PASS |

## 17 - Production Logging Audit

Fact found in repository:

- Many mobile logs are guarded by `__DEV__`, including push token/status data (`pushNotifications.ts`, `usePushNotifications.ts`) and Apple auth state (`auth.ts`).
- Production-reachable `console.error/warn` calls remain in services for marketplace, profile, My Stats, notifications, wallet, brackets, and Edge Functions.
- Web dashboard and public web routes contain mock fallback and console logging, but this audit focuses on mobile release readiness.

Classification:

- SAFE: operational Edge Function errors that do not print secrets.
- DEV-ONLY: `__DEV__` push/auth/support logs.
- REMOVE BEFORE PRODUCTION: mobile profile fetch errors that include `userId` (`services/profile.ts:100`, `:109`), raw Stripe PaymentSheet error messages if they include provider details (`useTournamentEntryPayment.ts:84-90`), and any QR/push data logging if guards are removed.
- SECURITY RISK: hard-coded SQL bearer literals, not console output.

## 18 - Crash / Error Monitoring Audit

Fact found in repository:

- No Sentry, Crashlytics, Bugsnag, PostHog, Segment, or similar mobile production SDK in `apps/mobile/package.json`.
- Support diagnostics exist and explicitly avoid NetInfo dependency per comments (`supportDiagnostics.ts`).
- No global native crash reporter found.

Visible today:

- Local alerts, console output, Supabase/Stripe logs, support tickets, Edge Function logs.

Invisible today:

- Native crashes, JS exceptions in TestFlight, unhandled promise rejections, startup failures before support can be opened.

Recommendation:

- Not required for a tiny internal TestFlight, but strongly recommended before broad TestFlight and before App Store launch.

## 19 - Analytics / Admin Observability Audit

Fact found in repository:

- Support analytics is dev-only (`supportAnalytics.ts:22-23`).
- Admin web has operational tables for tournaments, finance, reports, support tickets, and users.
- No product analytics SDK found.

Measurement gaps:

- Account creation, onboarding completion, auth provider, login frequency, active users/sessions, booking/payment funnels, QR check-in usage, calendar usage, marketplace/coach funnel, support drop-off, and error/drop-off instrumentation are incomplete or absent.

Recommendation:

- Add a minimal privacy-aware event set before production decisions depend on funnel data.

## 20 - App Lifecycle / Network / Offline Audit

Fact found in repository:

- Supabase token refresh is AppState-aware (`supabase.ts:39-50`).
- Push cold-start tap handling calls `getLastNotificationResponseAsync()` (`usePushNotifications.ts:55-61`).
- External links have centralized handling via `useExternalLinks()`.
- No global NetInfo/offline queue dependency found.
- Booking wizard state is session-local until reservation creation; reservation hold recovery is limited.

Risks:

- PaymentSheet background/resume and webhook delay need physical testing.
- Reservation hold expiry during app background may leave stale UI.
- QR scans without network produce client error state, but should be device-tested.
- OAuth and Apple auth return paths need cold-start/background testing.

## 21 - Account Deletion / Data Rights

Current state: **MISSING**.

Fact found in repository:

- Account settings exposes logout and support, but no delete-account action in inspected settings area (`account-settings.tsx:115-129`, `:210-223`).
- Search found no `auth.admin.deleteUser`, `deleteUser`, `delete_account`, or backend deletion function.

Impact:

- Apple requires apps that support account creation to offer account deletion.

Recommendation:

- Implement in-app deletion before App Store submission. Define retention/anonymization behavior for messages, marketplace listings, registrations/tournament history, reservations, payment records, support tickets, and UGC.

## 22 - User-Generated Content / Safety

Fact found in repository:

- UGC surfaces include profiles, avatars/photos, messaging, groups/feed, community play, marketplace listings/photos, coach offers, support attachments.
- Reporting exists for users, group content, marketplace listings (`baseline_from_prod.sql:4489-4503`, `:3830-3850`; `marketplace.sql:78-83`; `groupService.ts:527-547`; `listingService.ts:213-224`).
- Web messaging has report/block controls (`web/src/components/messaging/panel.tsx:470-495`).
- Mobile block wrapper explicitly says no screen reads block table yet (`services/blocking.ts:1-4`).

Gaps:

- Mobile report/block UX is inconsistent across all UGC surfaces.
- Blocking may not suppress discovery/chat/group content app-wide.
- Moderation escalation/admin review exists in web admin but needs workflow verification.

App Store risk:

- UGC apps need report/block/contact mechanisms. This is partial, not complete.

## 23 - Support / Contact Audit

Fact found in repository:

- Account settings links to help/support (`account-settings.tsx:210-223`).
- Help screen provides support email, support ticket creation, ticket list, and help-center URL (`help-support.tsx:118-145`).
- Support ticket routes exist under `apps/mobile/src/app/support`.

Gaps:

- Help Center URL `https://dreambreakerpb.com/help` needs external verification.
- Common-topic rows on help screen are non-clickable (`help-support.tsx:149-172`).
- Support floating launcher is behind a flag and defaults off per migration comments.

## 24 - Legal / App Store Surface Audit

Fact found in repository:

- Onboarding create-account shows Terms and Privacy text but not links (`create-account.tsx:107-110`).
- Help support contains privacy reassurance but no linked Privacy Policy/Terms (`help-support.tsx:186-191`).
- No in-app account deletion found.

Recommendation:

- Add accessible links to Privacy Policy and Terms in onboarding/account/support before App Store submission.
- Add account deletion before submission.
- Verify purchase disclosures for Stripe/marketplace/coach flows.

## 25 - App Store Privacy Label Worksheet

Based on implementation:

| Data | Source | Purpose | Linked to Identity | Server Stored | Third Party/Service |
|---|---|---|---:|---:|---|
| Name | onboarding/auth/profile | Profile, discovery, registrations | Yes | Yes | Supabase |
| Email | auth/onboarding/support/invites | Auth, contact, invites, receipts | Yes | Yes | Supabase, Resend, Apple/Google auth |
| Birthday/age | onboarding date_of_birth | Profile/onboarding | Yes | Yes | Supabase |
| Gender | onboarding/profile/play participants | Matching/events | Yes | Yes | Supabase |
| Location precise/coarse | device + profile/facility search | Nearby courts/games | Yes | Yes if saved to profile/settings | Supabase, Google APIs |
| Photos/images | avatars, chat/support/group/marketplace/coach | UGC/media | Yes | Yes | Supabase Storage, image services if used |
| Messages | chat/support | Messaging/support | Yes | Yes | Supabase |
| UGC | profiles, groups, marketplace, coach offers, events | App content | Yes | Yes | Supabase |
| Identifiers | auth user id, push tokens, Stripe ids | Auth, push, payment | Yes | Yes | Supabase, Expo, Stripe |
| Purchases/payment status | Stripe/payment tables | Paid registration/booking/coach | Yes | Yes | Stripe, Supabase |
| Payment card details | PaymentSheet | Payment processing | Yes to Stripe | Not in app DB | Stripe |
| Usage/activity | registrations, bookings, swipes, QR check-ins | Product operation | Yes | Yes | Supabase |
| Diagnostics | support diagnostics | Support | Yes if submitted | Yes in tickets | Supabase |
| Analytics | dev-only support analytics today | Dev support | No production SDK found | No | None found |
| Contacts | Not found | N/A | N/A | N/A | N/A |
| Device info | support diagnostics, push | Support/push | Potentially | In support tickets/push tokens | Expo/Supabase |

## 26 - Accessibility Audit

High-impact findings:

- Some icon-only controls have labels (QR scanner), but this is not consistent across auth, maps, marketplace, and headers.
- Native Apple button likely provides proper accessibility, but physical VoiceOver testing is not documented.
- Haptics are secondary feedback, not sole feedback, in new flows.
- Animated auth CTA does not appear to check reduced-motion.
- Touch targets often use `hitSlop`, but not systematically.

Recommendation:

- Before broad TestFlight, run VoiceOver smoke tests on auth, onboarding, booking payment, tournament check-in QR, calendar, messaging, marketplace, and support.

## 27 - Dev / Mock / Placeholder Code Audit

Fact found in repository:

- Dev routes registered: `onboarding-preview`, `design-lab`, `dev-qr-scan` (`_layout.tsx:66-69`).
- Booking paid flow has visible "Payment UI is not live" and "Continue in Test Mode" (`booking/review.tsx:253-264`, `:269-274`).
- Wallet redemption is "Coming Soon" (`wallet/[id].tsx:220`; `WalletCard.tsx:118`) and coach voucher redemption is intentionally partial.
- Multiple local/demo/mock stores remain for community/round-robin/mini-tournament/partner flows.
- Web public app uses mock fallback in several pages; separate from mobile TestFlight but relevant to Universal Link fallback credibility.

Classification:

- MUST HIDE BEFORE TESTFLIGHT: booking paid test-mode path unless scoped out; onboarding Apple unfinished path.
- MUST REMOVE/HIDE BEFORE APP STORE: dev routes and visible test-mode payment language.
- INTENTIONAL PLACEHOLDER: coach voucher redemption and booking QR check-in.
- SAFE DEV-ONLY: dev simulator API is production-404 and secret-gated.

## 28 - Dependency / Native Module Audit

| Capability | Package | Installed | Configured | Used | Physical Test | Production Ready |
|---|---|---:|---:|---:|---:|---:|
| Push Notifications | `expo-notifications` | Yes | Yes | Yes | Not fully | Partial |
| Camera / QR | `expo-camera` | Yes | Yes | Yes | Yes | Yes, scanner only |
| Image Picker | `expo-image-picker` | Yes | Yes | Yes | Needs broad retest | Partial |
| Haptics | `expo-haptics` | Yes | No plugin needed | Yes | Partial | Yes |
| Calendar | `expo-calendar` | Yes | Plugin intentionally omitted | Yes | Partial | Partial |
| Apple Sign-In | `expo-apple-authentication` | Yes | Yes | Yes | No | No |
| Google OAuth | `expo-auth-session`, `expo-web-browser` | Yes | Scheme | Yes | Needs | Partial |
| Stripe | `@stripe/stripe-react-native` | Yes | Yes | Tournament yes, booking partial | Partial | Partial |
| Google Maps | `react-native-maps` | Yes | API keys env | Yes | Partial | Partial |
| Location | `expo-location` | Yes | Yes | Yes | Needs | Partial |
| SecureStore | `expo-secure-store` | Yes | Yes | Yes | Yes by prior usage | Yes |
| Sharing | `expo-sharing`, RN Share | Yes | No plugin needed | Yes | Needs | Partial |
| QR generation | `react-native-qrcode-svg` | Yes | No native code | Yes | Yes | Yes for tournament QR |

Suspicious/release-relevant:

- `expo-dev-client` is configured; expected for development builds but production builds should be checked for dev-client inclusion behavior.
- `expo-sensors`, `expo-glass-effect`, old Expo example assets may be unused; not release-blocking.

## 29 - Performance / App Size Audit

Fact found in repository:

- Largest mobile assets: `pba-logo.png` 2.0 MB, `icon.png` 0.8 MB, `pba-logo-cropped.png` 0.7 MB, onboarding/default court images under 0.5 MB.
- No bundled videos found in top asset list.
- Expo/react example assets remain (`react-logo*`, `expo-logo`, `splash-icon`) and can be cleaned later.

Assessment:

- No clear production app-size blocker found from assets alone.
- Prior unusually large EAS build is plausibly development-build overhead plus native modules, but verify actual production IPA size once a production/preview build exists.

## 30 - External Configuration Checklist

| Item | Status | Notes |
|---|---|---|
| Apple Developer App ID | NEEDS MANUAL VERIFICATION | Must match `com.dreambreakerpb.app`. |
| Sign in with Apple capability | NEEDS MANUAL VERIFICATION | Required for Phase 7. |
| Apple Sign-In key / Services ID | NEEDS MANUAL VERIFICATION | Supabase provider config env-backed. |
| Supabase Apple Authorized Client IDs | NEEDS MANUAL VERIFICATION | Must include bundle id for native token flow. |
| APNs | NEEDS MANUAL VERIFICATION | No credentials in repo. |
| EAS credentials | NEEDS MANUAL VERIFICATION | Required for TestFlight. |
| App Store Connect | NEEDS MANUAL VERIFICATION | Submit profile empty. |
| Supabase Google provider | NEEDS MANUAL VERIFICATION | Config env-backed. |
| Supabase Custom SMTP | NEEDS MANUAL VERIFICATION | Email confirmations enabled. |
| Supabase custom auth domain | NEEDS MANUAL VERIFICATION | Not visible in repo. |
| Stripe webhook | NEEDS MANUAL VERIFICATION | Phase 6 says fixed manually; code cannot prove dashboard state. |
| Stripe production/test config | NEEDS MANUAL VERIFICATION | Publishable key env; secret/dashboard outside repo. |
| Google OAuth Console | NEEDS MANUAL VERIFICATION | Redirect/client IDs outside repo. |
| Google Maps APIs | NEEDS MANUAL VERIFICATION | Keys env-backed. |
| API-key restrictions | NEEDS MANUAL VERIFICATION | Dashboard only. |
| Vercel production domain | NEEDS MANUAL VERIFICATION | Phase 4 apex redirect concern. |
| AASA endpoint | NEEDS MANUAL VERIFICATION | Route exists; live response/domain must be checked. |
| Resend | NEEDS MANUAL VERIFICATION | Env secret required. |
| Production env vars | NEEDS MANUAL VERIFICATION | Not committed, as expected. |
| DNS | NEEDS MANUAL VERIFICATION | External. |

## 31 - TestFlight Regression Matrix

| Flow | Priority | Automated Evidence | Physical Test Needed | Status |
|---|---|---|---|---|
| cold launch | P0 | Prior tsc reports only | Yes | NEEDS TEST |
| email signup | P0 | Code exists | Yes | NEEDS TEST |
| email login | P0 | Code exists | Yes | NEEDS TEST |
| password reset | P0 | Code exists | Yes | NEEDS TEST |
| Google OAuth | P0 | Code exists | Yes | NEEDS TEST |
| Apple Sign-In | P0 | Code exists | Yes, new build | BLOCKED by config/test |
| logout | P0 | Code exists | Yes | NEEDS TEST |
| session restore | P0 | SecureStore code | Yes | NEEDS TEST |
| onboarding | P0 | Code exists | Yes | APPLE GAP |
| notification permission | P1 | Code exists | Yes | NEEDS TEST |
| push notification | P1 | Code exists | Yes | NEEDS TEST |
| push tap | P1 | Code exists | Yes | NEEDS TEST |
| Universal Link | P1 | Code exists | Yes | PARTIAL |
| invalid Universal Link | P1 | Prior fix documented | Yes | NEEDS TEST |
| messaging | P0 | Code/RLS exists | Yes | NEEDS TEST |
| image upload | P1 | Pipeline exists | Yes | NEEDS TEST |
| location | P1 | Code/config exists | Yes | NEEDS TEST |
| Google Maps | P1 | Code/config exists | Yes | PARTIAL |
| tournament discovery | P0 | Code exists | Yes | NEEDS TEST |
| tournament registration | P0 | PaymentSheet path exists | Yes | PARTIAL |
| tournament payment | P0 | Phase 6 traced success | Yes | PARTIAL |
| tournament QR | P1 | Phase 5.1 code/physical pass | Yes regression | PASS/RETEST |
| manual tournament check-in | P1 | Shared RPC | Yes regression | PASS/RETEST |
| QR tournament check-in | P1 | Shared RPC | Yes regression | PASS/RETEST |
| booking search | P0 | Booking engine code | Yes | NEEDS TEST |
| booking reservation | P0 | RPC exists | Yes | NEEDS TEST |
| booking PaymentSheet | P0 | Hook exists, route not wired | Yes | GAP |
| booking confirmation | P0 | Test mode exists | Yes | GAP |
| calendar add | P1 | Code + broad physical pass | Yes regression | PARTIAL |
| Quick Game | P1 | Code exists | Yes | NEEDS TEST |
| Round Robin | P2 | Code exists | Yes | NEEDS TEST |
| Mini Tournament | P2 | Code exists | Yes | NEEDS TEST |
| Partner Finder | P1 | Code/mock mix | Yes | NEEDS TEST |
| groups | P1 | Code/RLS exists | Yes | NEEDS TEST |
| marketplace | P1 | Code/RLS/reporting exists | Yes | NEEDS TEST |
| coach marketplace | P2 | Partial payment/voucher lifecycle | Yes | PARTIAL |
| support | P1 | Tickets/help exist | Yes | NEEDS TEST |

## 32 - TestFlight Readiness

Can we create a meaningful TestFlight build now?

**READY FOR TESTFLIGHT WITH KNOWN GAPS**, provided the build is scoped and the P0 gaps below are fixed or explicitly excluded from the test plan.

### TESTFLIGHT BLOCKERS

- Apple Sign-In through onboarding is broken/stale if Apple onboarding is in scope.
- Paid booking flow is not production-safe: PaymentSheet is not wired and test-mode confirmation remains reachable.
- Apple Sign-In has not been rebuilt/tested after entitlement plugin.
- Production schema should not be changed until migration reconciliation is complete.

### FIX DURING TESTFLIGHT

- Push APNs/token/delivery/tap verification.
- Universal Link cold/warm/push tap tests and AASA direct-host verification.
- Calendar edge cases.
- Location/maps permission-denied/fallback behavior.
- Payment webhook delay/resume/cancel cases.

### APP STORE SUBMISSION BLOCKERS

- Account deletion.
- Legal links/Privacy Policy/Terms/support surfaces.
- UGC report/block/moderation completion.
- Migration reconciliation.
- Secrets rotation/review.
- Production monitoring/diagnostics decision.
- Hide dev/test routes and test-mode payment copy.

### POST-LAUNCH / LATER

- Live Activities.
- HealthKit.
- Booking QR check-in.
- Coach voucher QR redemption.
- Full analytics suite.
- App icon badge sophistication.

## 33 - Top Gaps

1. Supabase migration-history divergence.
   Evidence: Phase 5.1 documents direct production SQL and diverged local/remote histories; current repo still has that migration state.
   Severity: P0.
   Next action: dedicated reconciliation; do not `db push`.
   Required before TestFlight: only if schema deploys are needed; required before production.

2. Booking paid flow is still test-mode.
   Evidence: `booking/review.tsx:119-126`, `:253-264`.
   Severity: P0.
   Next action: wire native PaymentSheet or hide paid booking from TestFlight.
   Required before TestFlight: yes if booking payment is in scope.

3. Apple onboarding path is unfinished.
   Evidence: `create-account.tsx:20-37`, `:83-90`; `finalize.ts:107-113`.
   Severity: P0.
   Next action: make onboarding Apple call `signInWithApple()` or remove button until ready.
   Required before TestFlight: yes if Apple signup/onboarding is in scope.

4. No in-app account deletion.
   Evidence: no deletion route/function found; account settings only logout/help (`account-settings.tsx:115-129`, `:210-223`).
   Severity: P1.
   Next action: implement deletion/anonymization.
   Required before TestFlight: no; before App Store: yes.

5. Hard-coded bearer JWT literals in SQL migrations.
   Evidence: `baseline_from_prod.sql:2380`, `transactional_email.sql:77`.
   Severity: P1.
   Next action: rotate/review and replace with safer secret/config mechanism.
   Required before TestFlight: no for internal, yes before production.

6. Universal Link booking mismatch.
   Evidence: `appLinks.ts:18`, `:30`; `externalRouting.ts:83-84`; no `booking/[id].tsx`.
   Severity: P1.
   Next action: add booking detail route or remove booking link support until route exists.
   Required before TestFlight: no unless booking links are tested.

7. Missing `create-booking-payment-intent` Supabase config entry.
   Evidence: function folder exists; `supabase/config.toml:88-103` omits it.
   Severity: P1.
   Next action: add function config during deploy-readiness phase.
   Required before TestFlight: maybe, depending deployment method.

8. UGC moderation/blocking incomplete on mobile.
   Evidence: reporting tables/services exist; block service says not globally read (`services/blocking.ts:1-4`).
   Severity: P1.
   Next action: complete report/block surfaces and filtering for critical UGC.
   Required before TestFlight: no; before App Store: yes.

9. No production crash monitoring.
   Evidence: no crash SDK in package; support analytics dev-only.
   Severity: P2.
   Next action: choose vendor or minimal error pipeline.
   Required before TestFlight: no for small internal; recommended before broader testing.

10. Dev/test surfaces reachable.
   Evidence: `_layout.tsx:66-69`; booking test-mode text.
   Severity: P1.
   Next action: guard by environment or remove from production navigation/build.
   Required before TestFlight: recommended before external testers.

## 34 - Recommended Implementation Order

Phase A - Critical TestFlight blockers:

- Fix Apple onboarding or remove the Apple option from onboarding until tested.
- Wire booking PaymentSheet or disable paid booking/test-mode continuation.
- Build Apple-capable EAS iOS dev/preview build and run auth smoke tests.

Phase B - Database safety:

- Reconcile Supabase migration history.
- Confirm `check_in_registration()` production definition matches repo.
- Add missing Edge Function config entries.

Phase C - App Store compliance:

- Add account deletion.
- Add linked Privacy Policy/Terms/support surfaces.
- Complete UGC report/block/moderation for critical surfaces.
- Hide dev/test routes and test-mode copy.

Phase D - External configuration:

- Verify Apple, APNs, EAS, Supabase providers, Stripe webhook, Google Maps/OAuth, Vercel/AASA, Resend, DNS, production env vars.

Phase E - Observability:

- Add crash reporting and minimal production-safe analytics.
- Define payment/auth/error alerts.

Phase F - TestFlight findings:

- Run regression matrix, fix device-only issues, then prepare App Store candidate.

# TestFlight Decision

1. Can we ship a TestFlight build now?

Yes, **for meaningful internal/pre-production testing with known gaps**, not as a release candidate. Scope the build carefully and do not change production schema until migration reconciliation is complete.

2. What MUST be fixed before TestFlight?

- Apple onboarding path, if Apple signup/onboarding is in scope.
- Booking paid flow, if paid booking is in scope.
- Apple Sign-In external config/build verification, if Apple Sign-In appears in the build.
- Any production env var omissions that prevent launch/auth/payments/maps.

3. What should be tested THROUGH TestFlight?

- Push permission/token/delivery/tap routing.
- Universal Links cold/warm start and push link routing.
- Apple/Google/email auth, logout, session restore.
- Tournament payment/registration/check-in QR regression.
- Calendar add/cancel/duplicate/timezone.
- Location/maps denied/granted flows.
- Booking reservation/payment once fixed.

4. What MUST be fixed before App Store submission?

- Account deletion.
- Privacy Policy/Terms/support links.
- UGC reporting/blocking/moderation completeness.
- Dev/test route and test-mode payment cleanup.
- Migration reconciliation.
- Secrets rotation/review.
- Production crash/error monitoring decision.
- External dashboard configuration verification.

5. What can safely wait until after initial release?

- Live Activities.
- HealthKit.
- Booking QR check-in.
- Coach voucher QR redemption.
- Advanced notification preferences/badges.
- Full analytics sophistication.
- Apple Maps as a new feature beyond current working map behavior.

# Recommended Next Development Phase

Recommended single next phase: **Critical TestFlight Readiness Cleanup**.

Scope it narrowly: fix Apple onboarding, finish or disable paid booking PaymentSheet/test-mode behavior, hide dev/test routes from production builds, add the missing booking Edge Function config entry if deployment requires it, and produce a new iOS EAS preview/TestFlight build for the regression matrix. The next phase should not add another native feature; the highest value now is making the current native feature set honest and testable.
