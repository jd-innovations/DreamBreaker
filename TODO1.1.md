# TODO 1.1 – Production Readiness

Re-audit date: 2026-08-16  
Audit role: Pre-Production Manager  
Scope: DreamBreaker mobile app, web companion/admin app, Supabase schema/functions, phase documentation, native capability reports, implemented user flows, and current static checks.

## Executive Summary

DreamBreaker has advanced materially since the first `TODO1.1.md` audit. Several earlier blockers are now partially or fully addressed: EAS configuration exists, Apple Sign-In is implemented and physically verified for the standalone auth path, push notification code exists, Stripe's server-authoritative payment foundation exists, tournament QR check-in is implemented and physically verified, support tickets exist, and native camera/calendar/deep-link work has begun.

The app is still **not ready for real-world beta with thousands of users**. It may be viable for a tightly controlled internal TestFlight group if the test plan explicitly excludes or watches the remaining gaps, but broad beta would create avoidable payment, auth, data, support, and observability risk.

The biggest change from the first audit is that the risk has shifted from "missing foundations" to "partially wired systems across too many surfaces." The app now has more production-like code, but also a wider beta surface: booking, coach marketplace, QR check-in, support tickets, native push, calendar, payments, wallet/vouchers, web admin, and onboarding all have live or semi-live paths. That scope expansion requires stronger gates, more QA, and production monitoring before real users depend on it.

Current verification results:

- Mobile TypeScript: **PASS** (`npx tsc --noEmit`)
- Mobile lint: **PASS** - 0 errors, 64 warnings remaining
- Web lint: **PASS** - 0 errors, 65 warnings remaining
- Web build: **PASS** after allowing `next/font` to fetch Google Fonts
- Automated test coverage: **effectively missing**; only a mobile `groups-smoke-test.js` script was found
- Crash reporting: **missing**
- Product analytics: **missing**; only a support analytics seam logs in development
- Global mobile auth gate: **missing**; app root still redirects directly to `/(tabs)`
- Production config hygiene: **partial**; `supabase/config.toml` still uses localhost auth URLs, web Supabase clients still contain hardcoded public fallback credentials, and deployment secrets/config require external verification
- Payment architecture: **partially strong**; server-authoritative foundation and webhook finalizer exist, but booking PaymentSheet is not wired and Stripe SDK/API versions lag current guidance
- Database/migrations: **high risk**; local migrations were rebaselined/reorganized with many old migrations deleted and new baseline files untracked, and phase docs mention production/local migration-history divergence

## Production Readiness Score

- Feature Completion: **62%**
- Stability: **45%**
- Security: **58%**
- UX: **66%**
- Performance: **55%**
- Testing: **20%**
- Overall %: **51%**

Interpretation: The app is more capable than the first audit, but not more beta-safe overall because the surface area expanded faster than verification, monitoring, and test coverage. Treat `51%` as "internal validation build possible, external beta not yet."

## Critical Blockers (Must Fix Before Beta)

### C1 - Make CI/static checks green

- Priority: Critical
- Description: Mobile lint, mobile typecheck, web lint, and web build now pass locally. Warnings remain in both apps, and CI automation still needs to enforce these gates.
- Why it matters: A clean local gate is the first baseline; CI needs to preserve it so regressions do not creep back in during beta prep.
- Recommended implementation: Add CI scripts that fail on `apps/mobile` typecheck/lint and `web` lint/build, then reduce warnings that affect hooks, accessibility, images, and dead code.
- Dependencies: None.
- Estimated effort: M

### C2 - Resolve Supabase migration history and release database state

- Priority: Critical
- Description: The worktree shows many deleted legacy migrations, many new baseline/migration files, and phase docs document production/local migration divergence. Some functions were applied directly to production because `supabase db push` was unsafe.
- Why it matters: Beta cannot rely on a database that cannot be reproduced from source. This threatens rollback, new environments, RLS review, and disaster recovery.
- Recommended implementation: Freeze schema changes, reconcile `supabase migration list` against the repo, document production-applied SQL, create a clean forward-only migration path, and verify a fresh database can be built from source plus seed without manual repair.
- Dependencies: Supabase project access and production migration history.
- Estimated effort: L

### C3 - Add a global mobile auth/onboarding gate

- Priority: Critical
- Description: `apps/mobile/src/app/index.tsx` redirects directly to `/(tabs)`. Auth checks are scattered by screen using `router.replace('/sign-in')` or `requireAuth()`.
- Why it matters: One missed screen can leak authenticated-only actions, create bad guest states, or produce inconsistent onboarding behavior.
- Recommended implementation: Add a single root decision layer: loading -> welcome/onboarding/sign-in for guests/incomplete profiles -> app tabs for authenticated complete users. Keep route-level guards for defense in depth, but stop relying on them as the primary gate.
- Dependencies: Confirm desired guest-access surfaces.
- Estimated effort: M

### C4 - Finish production payment flows end to end

- Priority: Critical
- Description: Tournament entry payments now use Stripe PaymentSheet and wait for webhook-confirmed registration, which is a major improvement. Booking payments still create a PaymentIntent but do not present PaymentSheet in `booking/review.tsx`; the UI offers a test-mode continuation. Webhook finalization exists but deployment reachability and `STRIPE_WEBHOOK_SECRET` verification remain external risks.
- Why it matters: Users must never pay without a reliable success/failure path, refund path, receipt, and support trail.
- Recommended implementation: Wire `useReservationPayment()` into booking review in a custom EAS dev client, remove production test-mode continuation, verify real webhook delivery in production, verify idempotency, handle succeeded-payment-but-reservation-not-held with refund/manual review tooling, and add booking function config in `supabase/config.toml`.
- Dependencies: EAS dev build, Stripe publishable/secret keys, webhook endpoint reachable without SSO, Stripe Dashboard access.
- Estimated effort: L

### C5 - Add production crash reporting and error monitoring

- Priority: Critical
- Description: No Sentry, Crashlytics, PostHog error capture, or equivalent production crash reporter was found.
- Why it matters: A beta with thousands of users will fail in device-specific and network-specific ways. Without crash reporting, the team will learn from app store reviews and screenshots instead of actionable traces.
- Recommended implementation: Add Sentry or equivalent for mobile and web, source maps, release/version tags, user/session correlation that avoids sensitive payloads, and alerting for auth/payment/support failures.
- Dependencies: Monitoring vendor/project.
- Estimated effort: M

### C6 - Remove production-reachable mock, fake, and test-mode user paths

- Priority: Critical
- Description: Mock/fallback data remains reachable in web dashboard/tournaments, mobile community/conversation/invite paths, connection store, round-robin/quick-game roster stores, and "Coming Soon" flows. Booking has a payment test-mode fallback.
- Why it matters: Beta users cannot distinguish real app state from demo state. Mock data can cause support confusion, false metrics, and accidental interaction with fake entities.
- Recommended implementation: Put demo data behind explicit dev flags, remove production fallbacks, show honest empty states, and hide incomplete routes/actions.
- Dependencies: Product decision on demo mode.
- Estimated effort: M

### C7 - Implement account deletion and legal/privacy surfaces

- Priority: Critical
- Description: Mobile shows Privacy/Terms text but no linked legal pages. Web settings says to contact support to delete account. No complete self-service account deletion/anonymization flow was found.
- Why it matters: App Store review and privacy expectations require clear privacy information and account deletion for account-based apps. Users also need trust before entering identity, location, payment, and social data.
- Recommended implementation: Add Terms, Privacy Policy, Support, and Delete Account routes in mobile and web. Implement account deletion request/completion with Supabase Auth deletion, profile anonymization or deletion, storage cleanup policy, payment/support record retention policy, and confirmation email.
- Dependencies: Legal/privacy policy owner, Supabase service-role backend.
- Estimated effort: L

### C8 - Establish a beta QA matrix on real devices

- Priority: Critical
- Description: Phase docs show many features are implemented but not fully tested across device states. Push still requires APNs/EAS verification. Apple Sign-In has partial device coverage. Booking PaymentSheet is not device-tested. Android coverage is unclear.
- Why it matters: Native features fail differently on real devices than in web/dev environments.
- Recommended implementation: Create a required device matrix for iOS physical device, Android physical device, fresh install, upgrade install, offline/poor network, background/foreground, cold start, push tap, OAuth callback, payment interruption, camera permission denial, and location permission denial.
- Dependencies: Device access, TestFlight/internal testing build.
- Estimated effort: M

## High Priority

### H1 - Fix production auth configuration

- Priority: High
- Description: `supabase/config.toml` still uses `site_url = "http://localhost:3000"` and localhost redirect URLs. Google/Apple provider config depends on environment/Dashboard state.
- Why it matters: Wrong redirect configuration causes login, email confirmation, password reset, and OAuth callback failures in production.
- Recommended implementation: Create explicit local, preview, and production auth config documentation; verify Supabase Dashboard URLs for web and native app scheme; test email confirmation, password reset, Google, Apple, sign-out, re-login, and cold-start session persistence.
- Dependencies: Supabase Dashboard access, production domain.
- Estimated effort: M

### H2 - Remove hardcoded Supabase fallback endpoints from web clients

- Priority: High
- Description: `web/src/lib/supabase/client.ts` and `server.ts` contain hardcoded public fallback URL/anon key because env vars were previously misconfigured.
- Why it matters: This masks deployment misconfiguration and can point preview/staging builds at production without anyone noticing.
- Recommended implementation: Remove fallbacks, fail loudly on invalid environment variables, fix Vercel/env configuration, and add a startup health check.
- Dependencies: Hosting environment access.
- Estimated effort: S

### H3 - Complete analytics/event tracking

- Priority: High
- Description: No real analytics SDK or event sink exists. `supportAnalytics.ts` only logs in development.
- Why it matters: Beta needs funnels and drop-off visibility for onboarding, auth, booking, registration, payments, push opt-in, support, and crashes.
- Recommended implementation: Add PostHog, Segment, Amplitude, or a Supabase events table. Track privacy-safe events for onboarding steps, auth provider outcomes, payment attempts, payment failures, booking funnel, tournament registration, push permission, QR check-in, support tickets, and account deletion.
- Dependencies: Analytics vendor decision and privacy policy update.
- Estimated effort: M

### H4 - Complete push notification production path

- Priority: High
- Description: Client registration, listener, token upsert, logout cleanup, and tap routing exist. Phase docs still require APNs/EAS verification, direct Expo push tests, database-triggered message push tests, Android tests, receipt polling, stale-token cleanup, and preference handling.
- Why it matters: Bad push behavior can annoy users, leak stale messages to old devices, and erode trust.
- Recommended implementation: Verify APNs/Android credentials, test physical delivery and tap routing, add Expo receipt polling, delete invalid tokens, persist notification preferences and quiet hours, and add server-side dispatch logs.
- Dependencies: EAS/APNs/Firebase credentials, Supabase function logs.
- Estimated effort: M

### H5 - Finish App Store and Play Store readiness package

- Priority: High
- Description: App metadata, screenshots, privacy nutrition labels/Data safety form, support URL, marketing URL, demo account, test notes, age rating, content policy, and account deletion evidence are not represented as complete release artifacts.
- Why it matters: Store review can reject incomplete metadata, placeholder content, missing privacy links, broken login, or missing account deletion.
- Recommended implementation: Create a `/release` checklist with screenshots, app description, keywords, support/privacy URLs, demo credentials, Apple review notes, Google Data safety answers, permission purpose strings, and known beta limitations.
- Dependencies: Legal, design, App Store Connect, Google Play Console.
- Estimated effort: M

### H6 - Harden support and moderation

- Priority: High
- Description: Support tickets and floating support infrastructure exist. Moderation/block/report behavior appears incomplete and not globally enforced.
- Why it matters: Social apps need abuse handling before external users arrive.
- Recommended implementation: Ensure report/block flows exist for profiles, messages, groups, listings, tournaments, coaches, and support tickets. Enforce blocks in search, recommendations, chat, invitations, groups, and profile views. Add admin queues and audit logs.
- Dependencies: Policy decisions, admin roles.
- Estimated effort: L

### H7 - Verify RLS and service-role boundaries

- Priority: High
- Description: Many new migrations introduce booking, marketplace, payments, support, QR check-in, and coach marketplace data. RLS appears present in several places, but no current automated RLS test suite exists.
- Why it matters: User-owned data includes identity, location, messages, payments, support context, and marketplace activity.
- Recommended implementation: Build RLS tests for anon, authenticated owner, unrelated user, director, coach, facility role, and admin/service role. Review all `SECURITY DEFINER` functions for `set search_path`, authorization checks, and minimal grants.
- Dependencies: Supabase local test harness or SQL test scripts.
- Estimated effort: L

### H8 - Hide dev/test routes and admin-only tools

- Priority: High
- Description: Routes such as `dev-qr-scan`, `design-lab`, `onboarding-preview`, and web `/api/dev/*` exist. Dev payment simulator is guarded, but route availability should still be reviewed.
- Why it matters: External users should not reach internal diagnostics or test-payment affordances.
- Recommended implementation: Gate dev routes by `EXPO_PUBLIC_APP_ENV !== 'production'`, return 404 for web dev APIs in production, and add route inventory checks before release.
- Dependencies: Environment flags.
- Estimated effort: S

### H9 - Complete image handling privacy/performance work

- Priority: High
- Description: Image pipeline architecture exists, but multiple web pages still use raw `<img>` and mobile media categories remain partially implemented. EXIF/GPS stripping verification is documented as a gap.
- Why it matters: User-uploaded images can leak location metadata and slow down core screens.
- Recommended implementation: Verify EXIF removal, enforce file size/type/dimension limits, use optimized image components on web, add upload progress/error states, and audit all image categories: avatar, support, chat, marketplace, coach offers, groups, tournaments, facilities.
- Dependencies: Storage policies and CDN/image service decision.
- Estimated effort: M

### H10 - Add offline and poor-network behavior

- Priority: High
- Description: SecureStore auth persistence and AppState token refresh exist. No NetInfo/offline state, queue, or consistent offline UI was found.
- Why it matters: Courts and events are often used on mobile networks. Payments, booking holds, QR scans, and chat must fail safely.
- Recommended implementation: Add network-state detection, global offline banner, retry states, no-offline-payment guard, no-offline-check-in guard, cached read-only profile/event state where safe, and interrupted-flow recovery.
- Dependencies: Network library decision, UX copy.
- Estimated effort: M

## Medium Priority

### M1 - Reduce feature surface for first beta

- Priority: Medium
- Description: The codebase now includes tournaments, booking, coach marketplace, marketplace listings, groups, messaging, My Stats/PAR, wallet/vouchers, support, QR check-in, calendar, and push.
- Why it matters: A beta succeeds when core loops are reliable. Too many partially ready features dilute QA and support.
- Recommended implementation: Define the first beta MVP explicitly. Hide or feature-flag non-MVP modules, especially paid booking, coach purchases, wallet redemption, marketplace AI listing improvement, and unfinished My Stats/PAR surfaces if not approved.
- Dependencies: Product decision.
- Estimated effort: M

### M2 - Complete loading, empty, and error states

- Priority: Medium
- Description: Many screens have some loading/error UI, but consistency is uneven and mock fallback is sometimes used instead of a real empty state.
- Why it matters: Beta users will hit empty states more than demos do.
- Recommended implementation: Create shared loading, empty, error, retry, permission-denied, and unavailable components. Replace mock fallback with honest empty states.
- Dependencies: Design system.
- Estimated effort: M

### M3 - Accessibility audit

- Priority: Medium
- Description: Some controls include accessibility hints, but no systematic VoiceOver/TalkBack, contrast, reduced motion, dynamic type, and touch-target audit was found.
- Why it matters: Accessibility bugs become store-review and user-trust issues, especially in auth, payments, support, and onboarding.
- Recommended implementation: Test key flows with VoiceOver/TalkBack, add labels/hints to icon buttons, respect reduced motion for pulses/animations/haptics, validate contrast, and ensure text does not clip at larger font sizes.
- Dependencies: QA devices.
- Estimated effort: M

### M4 - Performance profiling

- Priority: Medium
- Description: Maps, images, large screens, support panels, and web dashboards have potential render/performance issues. Lint flags many raw `<img>` uses and hook dependency warnings.
- Why it matters: Slow first load and janky navigation produce churn during onboarding and booking.
- Recommended implementation: Profile mobile startup, route transitions, map screens, tournament detail, booking search, chat, support panel, and web LCP. Use optimized image loading and memoization where needed.
- Dependencies: Device testing and production-like data volume.
- Estimated effort: M

### M5 - Improve sign-out and session edge cases

- Priority: Medium
- Description: Sign-out deletes the current push token and routes to sign-in in visible call sites. Granular Apple sign-out/re-login, push cleanup failure, cold start, and expired session behavior remain incompletely tested.
- Why it matters: Session bugs feel like data loss and can strand users during payment or onboarding.
- Recommended implementation: Add auth QA cases for sign-out from every surface, token cleanup failure, OAuth cancel, email confirmation pending, password reset callback, app kill/reopen, token refresh, and account collision/linking.
- Dependencies: Test accounts for each provider.
- Estimated effort: M

### M6 - Finish booking product completeness

- Priority: Medium
- Description: Booking exists but filters/sorting show "Coming Soon"; booking detail deep link route is mismatched; paid booking is not fully wired.
- Why it matters: Booking is a high-stakes paid/time-sensitive workflow.
- Recommended implementation: Complete or hide filters/sorting, add `/booking/[id]` mobile route or remove links to it, finish payment, cancellation, refund, and support states.
- Dependencies: Payment work and facility data.
- Estimated effort: L

### M7 - Finish wallet/voucher redemption

- Priority: Medium
- Description: Wallet and coach voucher issuance exist, but redemption actions still show "Coming Soon."
- Why it matters: Selling coach offers without reliable redemption creates support and trust risk.
- Recommended implementation: Either hide paid coach offers/wallet redemption from beta or implement QR redemption with server-side authorization and audit trail.
- Dependencies: Coach marketplace product policy.
- Estimated effort: M

### M8 - Add transactional email verification

- Priority: Medium
- Description: Transactional email functions and templates exist, but full production deliverability, template QA, and unsubscribe/preference logic are not verified.
- Why it matters: Email is needed for auth, waitlist, support, booking, payment, and account lifecycle.
- Recommended implementation: Verify Resend secrets/domains, SPF/DKIM/DMARC, template rendering, bounce handling, and user communication preferences.
- Dependencies: Email provider access.
- Estimated effort: M

### M9 - Complete production config inventory

- Priority: Medium
- Description: Required external secrets include Supabase, Stripe, Google Maps/Places/Weather, Resend, EAS/APNs, Apple/Google auth, and possibly marketplace AI.
- Why it matters: Missing or mixed environment variables cause the hardest beta bugs to diagnose.
- Recommended implementation: Create `PRODUCTION_CONFIG.md` listing each env var, owner, environment, rotation policy, and verification command. Do not commit secret values.
- Dependencies: Service owner access.
- Estimated effort: S

### M10 - Add database integrity jobs

- Priority: Medium
- Description: Some hold/waitlist sweepers exist. Booking holds, payments requiring manual review, stale push tokens, orphaned storage objects, failed transactional emails, and support SLAs need scheduled integrity checks.
- Why it matters: Beta creates asynchronous failures that need cleanup.
- Recommended implementation: Add scheduled jobs and admin dashboards for stale holds, pending payments, abandoned PaymentIntents, failed webhooks, expired vouchers, stale push tokens, and orphaned uploads.
- Dependencies: Supabase scheduled jobs/cron.
- Estimated effort: M

## Low Priority / Nice to Have

### L1 - Native app badges

- Priority: Low
- Description: Foreground notification handling exists, but native app icon badges are disabled/not complete.
- Why it matters: Badges are useful but not required for first beta.
- Recommended implementation: Add badge count sync after push core is stable.
- Dependencies: Push preference model.
- Estimated effort: S

### L2 - Biometrics/session management

- Priority: Low
- Description: SecureStore is used, but no biometric lock or device/session management exists.
- Why it matters: Useful for trust, but not required for MVP beta.
- Recommended implementation: Add optional biometric app lock and session/device list later.
- Dependencies: Product/security decision.
- Estimated effort: M

### L3 - Live Activities / HealthKit

- Priority: Low
- Description: No ActivityKit or HealthKit implementation exists.
- Why it matters: These are future engagement features, not MVP requirements.
- Recommended implementation: Defer until core booking/tournament/payment stability is proven.
- Dependencies: Native entitlements and product specs.
- Estimated effort: L

### L4 - PAR/My Stats expansion

- Priority: Low
- Description: My Stats/PAR specs exist and components exist, but product docs say not to invent or implement unapproved PAR formulas.
- Why it matters: A rating system can damage trust if launched before the algorithm and data model are approved.
- Recommended implementation: Keep My Stats read-only/limited until PAR algorithm approval, replay validation, and user explanation copy are complete.
- Dependencies: Product approval of PAR formula.
- Estimated effort: L

### L5 - Polish visual consistency

- Priority: Low
- Description: Onboarding/sign-in visuals have improved, but overall UX consistency across old and new surfaces is uneven.
- Why it matters: Polish helps conversion, but reliability comes first.
- Recommended implementation: Run a design-system sweep after critical blockers are closed.
- Dependencies: Design tokens and QA screenshots.
- Estimated effort: M

## Area Audit: Complete / Partial / Missing

### Authentication and Onboarding

- Complete: Email/password auth, Google OAuth code path, native Apple Sign-In standalone path, password reset handling, SecureStore persistence, push-token cleanup on sign-out.
- Partial: Onboarding finalization, provider collision testing, device auth matrix, profile completion gate, legal links, password-length client/server consistency.
- Missing: Global auth gate, complete account deletion, full auth regression suite, production redirect config verification.

### Navigation and UX Consistency

- Complete: Expo Router structure, hidden native stack headers, many app routes registered.
- Partial: Screen-by-screen auth guards, deep link route mapping, support provider, visual consistency.
- Missing: Single route/access policy, production route inventory, dev route hiding, consistent empty/error states.

### Implemented Features and Edge Cases

- Complete: Tournament QR check-in core, Apple Sign-In core, support ticket foundation, server-authoritative payment foundation.
- Partial: Booking, coach marketplace, wallet redemption, push, calendar, marketplace, groups/messaging, web admin.
- Missing: Feature-level QA matrices, refund/manual review tooling, complete MVP scope freeze.

### Data Validation and Error Handling

- Complete: Some payment and QR server-side validation is strong.
- Partial: Form validation exists but is inconsistent; password length mismatch remains; many errors surface as alerts.
- Missing: Central error taxonomy, field-level validation standards, production error tracking.

### Offline Behavior

- Complete: Auth session persistence and AppState refresh handling.
- Partial: Some screens show network errors.
- Missing: Offline detection, queued/retry-safe behavior, payment/check-in offline guards, cache strategy.

### Loading, Empty, and Error States

- Complete: Some major screens have loading and error states.
- Partial: Booking/support/tournament screens vary in quality.
- Missing: Shared state components and removal of mock fallback as empty state.

### Performance Bottlenecks

- Complete: Some previous auth subscription duplication was improved through shared `useSession`.
- Partial: Map crash comments and some performance thinking exist.
- Missing: Real-device performance profile, web image optimization, production performance monitoring.

### Accessibility

- Complete: Some accessibility hints exist.
- Partial: Native defaults help basic usability.
- Missing: Full VoiceOver/TalkBack, reduced motion, dynamic type, contrast, and touch-target audit.

### Security and Permissions

- Complete: SecureStore usage, service-role payment finalization, QR server authorization, camera permission text consolidation.
- Partial: RLS exists across many tables but lacks automated tests; Apple/Google provider config needs verification; push secret handling needs review.
- Missing: Account deletion, credential rotation follow-up, comprehensive security review, moderation enforcement.

### API Integrations

- Complete: Supabase, Stripe, Expo native modules, Google Maps/Places/Weather, Resend-related functions exist.
- Partial: External config verification and webhook reachability.
- Missing: Production integration health dashboard and runbook.

### Database Integrity

- Complete: Many tables/functions/migrations exist, including payments and support.
- Partial: Some scheduled jobs exist.
- Missing: Reproducible migration history, RLS test suite, integrity jobs for async failures.

### Push Notifications

- Complete: Client code, token table, logout cleanup, foreground/tap handlers, message push function foundation.
- Partial: Physical and APNs/EAS verification.
- Missing: Receipt polling, stale-token cleanup, preference-aware dispatch.

### Image Handling

- Complete: Image pipeline docs/code, optimized onboarding images, asset standards.
- Partial: Category implementation and web image optimization.
- Missing: EXIF/GPS verification, complete storage cleanup, all-category production QA.

### Analytics and Event Tracking

- Complete: Support analytics event contract/seam.
- Partial: Development logging.
- Missing: Real analytics sink, funnel dashboards, privacy-safe event catalog.

### Crash Reporting

- Complete: None found.
- Partial: Support diagnostics may help user-reported bugs.
- Missing: Mobile/web crash reporter, release tags, alerts.

### Feature Completeness

- Complete: Some individual slices are complete enough for controlled testing.
- Partial: Most product modules.
- Missing: Explicit beta MVP lock and hidden incomplete features.

### Production Configuration

- Complete: `eas.json`, app identifiers, native plugin config.
- Partial: Env var usage and external config docs.
- Missing: Verified production auth URLs, no hardcoded fallbacks, config inventory.

### App Store / Play Store Readiness

- Complete: Bundle IDs, icons/splash, some permission strings.
- Partial: Apple Sign-In, Associated Domains, privacy terms, support.
- Missing: Metadata package, screenshots, privacy/Data safety answers, demo account, account deletion.

### Testing Gaps

- Complete: Mobile typecheck passes.
- Partial: Some phase-specific manual tests.
- Missing: Unit/integration/E2E/RLS/payment/offline/device test suites.

### Technical Debt

- Complete: Some comments document known constraints well.
- Partial: Route files remain thick; feature modules exist unevenly.
- Missing: CI gate, test harness, migration cleanup, mock removal, lint cleanup.

### Known Risks

- Complete: Many risks are honestly documented in phase reports.
- Partial: Some are tracked but not consolidated.
- Missing: Owner/date/status for each release risk.

### Missing MVP Functionality

- Complete: Core identity and tournament scaffolding.
- Partial: Booking, registration, messaging, support, marketplace, coach, wallet.
- Missing: Clear MVP definition, account deletion, monitoring, production-safe payments, reliable onboarding gate.

## Testing Plan

### Unit tests

- Add tests for auth helpers, onboarding finalization, validation utilities, payment intent client wrappers, QR payload classification, app link resolution, support category routing, image validation, and profile completion.
- Minimum beta target: core utility/service modules covered for happy paths and critical failure paths.

### Integration tests

- Add Supabase local integration tests for RLS and RPCs: registrations, payments, support tickets, push tokens, reservations, coach purchases, wallet vouchers, groups/messages, and profile updates.
- Add Stripe webhook tests with signed payload fixtures for success, failure, cancellation, duplicate event, refund, and unknown PaymentIntent.
- Add auth integration checks for email confirmation, password reset, Google OAuth callback, Apple native token path, and sign-out cleanup.

### Manual QA

- Auth: fresh install, email signup, email confirmation, sign-in, sign-out, password reset, Google, Apple, cancel provider auth, cold start, expired session.
- Onboarding: every step, back/forward, incomplete profile, permission denied, OAuth path, email path, legal links.
- Tournament: browse, register free, register paid, waitlist, hold expiry, QR check-in, wrong tournament QR, duplicate check-in.
- Booking: search, choose time, hold expiry, invite players, payment success/fail/cancel, confirmation, cancellation/refund/support.
- Support: create ticket, attach diagnostics/image, admin response, user reply, close/reopen.
- Push: opt in/out, message notification, foreground/background/cold tap, logout token cleanup.
- Marketplace/coach/wallet: purchase, voucher issuance, redemption state or hidden if not complete.

### Device testing

- iOS physical device: fresh install, TestFlight build, push, camera QR, location, Apple Sign-In, Google OAuth, Stripe PaymentSheet, calendar, deep links.
- Android physical device: fresh install, push, camera QR, location, Google OAuth, Stripe PaymentSheet, deep links.
- Accessibility: VoiceOver/TalkBack, larger text, reduced motion, high contrast.
- Network: offline, airplane mode mid-payment, poor network, app background during auth/payment, cold start from push/deep link.

### Beta testing

- Phase 0: internal team only, production-like backend, no real money unless payments are fully verified.
- Phase 1: 10-25 trusted users, core auth/onboarding/tournament flows only.
- Phase 2: 50-100 users after monitoring, analytics, support, and payment verification.
- Phase 3: broader beta only after crash-free sessions, payment success/failure data, and support load are acceptable.

## Launch Checklist

- [ ] Mobile typecheck passes.
- [x] Mobile lint passes with zero errors.
- [x] Web lint passes with zero errors.
- [x] Web build passes.
- [ ] Supabase migrations are reproducible from source.
- [ ] RLS test suite passes.
- [ ] Global auth/onboarding gate implemented.
- [ ] Account deletion implemented and tested.
- [ ] Terms, Privacy Policy, Support URL, and Contact flows live.
- [ ] Crash reporting installed and verified.
- [ ] Analytics event catalog implemented and verified.
- [ ] Stripe webhook reachable and verified with real events.
- [ ] Booking PaymentSheet wired or paid booking hidden.
- [ ] Push notifications physically verified on iOS and Android.
- [ ] APNs/EAS credentials verified.
- [ ] Dev/test routes hidden in production.
- [ ] Mock data removed or dev-flagged.
- [ ] Production env var inventory complete.
- [ ] Store permission strings match actual usage.
- [ ] App Store Connect metadata complete.
- [ ] Google Play Data safety form complete.
- [ ] Demo account/test notes prepared.
- [ ] Beta QA matrix executed and signed off.

## Post-Beta Improvements

- Add native app badges and richer notification categories.
- Add biometrics/session device management.
- Expand My Stats/PAR after algorithm approval.
- Add Live Activities for tournament/check-in/booking status if product value is proven.
- Add advanced analytics dashboards and cohort retention.
- Improve web image optimization and SEO.
- Add richer admin moderation and trust/safety workflows.
- Add automated refund tooling and payment reconciliation dashboard.
- Add full E2E testing with Detox/Playwright after MVP scope stabilizes.
