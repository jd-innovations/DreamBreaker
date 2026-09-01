# Beta Scope — First Beta MVP

Owner: Pre-Production Manager
Decision date: 2026-08-17
Execution plan item: `TODO1.1_EXECUTION_PLAN.md` § 0.1 Freeze Scope
Applies to: `apps/mobile` (primary), `web` dev/admin routes (already gated)

## Purpose

The app's feature surface grew faster than its verification, monitoring, and
test coverage (`TODO1.1.md` § M1). This document freezes what a beta tester is
allowed to see, so QA effort concentrates on a few loops that work end to end
instead of spreading thin across many that half-work.

Nothing here deletes a feature. Everything out of scope stays in the codebase
and stays reachable in development and internal builds.

## How scope is enforced

`apps/mobile/src/lib/featureFlags.ts` is the runtime half of this document.
Change them together.

**Build environment** — `EXPO_PUBLIC_APP_ENV` resolves to one of
`development` / `internal` / `production`. It is opt-in: an unset value
resolves to `production` in any release build, so forgetting to set it can
only make the app more restrictive, never less.

| Build | `EXPO_PUBLIC_APP_ENV` | Sees hidden/internal features |
| --- | --- | --- |
| Local Metro / dev client | unset (`__DEV__`) → `development` | Yes |
| Internal TestFlight / QA | `internal` | Yes |
| Public beta / store | unset or `production` | No |

**Classifications** — `FEATURE_VISIBILITY` maps each feature to one of:

| Classification | Runtime behavior | Meaning |
| --- | --- | --- |
| `included` | On everywhere | In the beta MVP |
| `hidden` | Internal builds only | Built, not yet verified enough to expose |
| `internal-only` | Internal builds only | Diagnostics/QA tooling, never for external users |
| `deferred` | Off everywhere | Not built; no reachable code path |

**Two layers of enforcement**, because hiding a button only stops a tap:

1. **Entry points** — quick actions, slide-menu rows, and profile-menu rows
   carry an optional `feature` key and are filtered out when it is off.
2. **Routes** — `apps/mobile/src/lib/featureRoutes.ts` maps route prefixes to
   features, and `useFeatureRouteGuard()` (mounted once in the root
   `_layout.tsx`) `replace`s any blocked route with the home tab. This is what
   closes universal links, push payloads, custom-scheme links, and typed URLs.

## MVP inclusion / exclusion table

### Included

| Feature | Readiness | Production risk | Why included |
| --- | --- | --- | --- |
| Auth (email, Google, Apple) | Apple physically verified; matrix incomplete (5.2) | Medium — see risks | Nothing works without it |
| Onboarding | Complete flow, live | Low | Required first-run path |
| Profile / edit profile / settings | Live, real data | Low | Core identity surface |
| Tournaments (browse, detail, register) | Live, server-authoritative | Medium — entry payments | Primary product loop |
| Tournament QR check-in | Implemented and physically verified | Low | Required for tournament beta |
| Director tools (apply, create, workspace, brackets) | Live | Medium | Tournaments need organizers |
| Messaging (DMs, group chat, new message) | Live | Medium — moderation gaps (4.3) | Core social loop |
| Groups / communities | Live | Medium | Core social loop |
| Play events (quick game, round robin, mini tournament, clinics) | Live | Low | Core play loop |
| Log Session / My Stats / PAR | Live, read-only; PAR computed server-side | Low | Destination of the log-session loop; no client-side rating math |
| Partner Finder / connections | Live | Medium — moderation gaps | Core social loop |
| Nearby / map / facilities | Live | Low | Discovery |
| Marketplace listings (browse, create, my listings) | Live | Medium — no in-app payment; off-platform contact | Established loop, no money moves in-app |
| Support tickets + help center | Live | Low | Store-required, and beta needs a feedback channel |
| Push notifications | Code complete, device verification pending (5.1) | Medium | Retention; disable-able if 5.1 fails |
| Free court booking | Live via `confirm_reservation()` | Low | No payment boundary to cross |
| Invites, saved events, notifications, stories | Live | Low | Supporting surfaces |

### Hidden (internal builds only)

| Feature | Flag | Readiness | Production risk | Must complete before beta |
| --- | --- | --- | --- | --- |
| **Paid court booking** | `paidBooking` | PaymentSheet is wired (3.1): `booking/review.tsx` presents the native sheet, polls for the webhook-confirmed reservation, and has explicit canceled / failed / pending-webhook / confirmed states. The "Continue in Test Mode" branch is deleted. Not yet exercised end to end on a device build. | Medium — the false-confirmation path is gone; what remains is an unverified real-money flow. | A real card payment run on a dev-client device build (3.1 verification), and 3.2 (webhooks verified in production). Then flip this flag to `included`. |
| **Coach marketplace** (`/coach/*`) | `coachMarketplace` | **Included as of 2026-09-01.** Phases 0-7 built: purchase, ledger, vouchers, redemption, payouts and refunds. A real $2 purchase ran end to end through Stripe, the webhook, the ledger and voucher issuance; the voucher was redeemed by code. Connect onboarding was exercised end to end. `coach_status = 'test_ready'` remains a dev fixture, so production browse is filtered to coaches with `coach_status = 'active'` (lib/coach/offers.ts) — otherwise 25 of 26 active offers belong to fixture accounts with no Connect account and could be bought by a real user. | **Residual.** The Stripe payout transfer and a Stripe refund have not been executed (test balance); both are built and verified at the database layer. No admin UI for refunds. | Execute one payout transfer and one refund; admin refund UI |
| **Lesson marketplace** (`/lessons/*`) | `lessonMarketplace` | **Included as of 2026-09-01.** No longer browse-only: the detail screen takes payment via PaymentSheet, issues a wallet voucher, and the stale 'purchasing is not available' notice is gone. | Low. Same residual as the coach marketplace above. | Covered by the coach marketplace row |
| **Wallet** (`/wallet`, `/wallet/[id]`) | `wallet` | **Included as of 2026-09-01.** The redemption CTA is no longer a disabled "Coming Soon": a coach voucher shows a QR and an 8-character code, and a coach consumes it via `redeem_coach_voucher` — server-authorised, row-locked, and logged append-only to `coach_voucher_redemptions`. | Low. Non-coach wallet types still show their own CTAs unchanged. | Closed by Coach Marketplace Phase 5 |
| **Marketplace AI "Improve Listing"** | `marketplaceAiAssist` | Implemented; `ANTHROPIC_API_KEY` provisioning in production is unverified (see `project_marketplace_v1` notes). | Low. Fails at tap time if the key is absent. | Verify the secret in production, add a real unavailable state |

### Internal-only

| Feature | Flag | Notes |
| --- | --- | --- |
| `/design-lab` | `devTools` | Component gallery. Unlinked from any UI, but was reachable by direct route and deep link — now route-guarded. |
| `/dev-qr-scan` | `devTools` | Raw QR diagnostic scanner, distinct from the production check-in scanner at `/tournament/[id]/check-in-scan`, which stays included. |
| `/onboarding-preview` | `devTools` | Redirect shim into the onboarding flow for QA. |
| Home "DEV Onboarding" quick action | `__DEV__` (pre-existing) | Already development-only. |
| Onboarding dev exit button | `__DEV__` (pre-existing) | Already development-only. |
| `web /api/dev/simulate-payment` | — | Already correct: 404s on `NODE_ENV === "production"`, requires `DEV_TOOLS_SECRET` echoed in a header, and writes only `provider: "dev_test"` rows. **No change made.** |
| `web /api/dev/set-coach-test-ready` | — | Same guard pattern. **No change made.** |

### Deferred (not built; no reachable path)

| Feature | Flag | Notes |
| --- | --- | --- |
| Booking results Filters / Sort | `bookingFilters` | Two buttons whose only behavior was a "Coming Soon" alert. Row hidden rather than left as a dead-end CTA in a paid flow. |
| Coach offer purchase | — | No code path exists; the lesson detail screen says so plainly. |
| Wallet redemption | — | Disabled CTA inside an already-hidden module. |

## Known dead-end CTAs left in place

These were audited and deliberately **not** changed in this pass, to keep it
scoped to feature visibility and route access. They belong to execution plan
6.2 ("Replace Coming Soon Buttons"):

- `(tabs)/chat.tsx` — story category alert
- `(tabs)/profile.tsx` — match history alert
- `(tabs)/nearby.tsx` — tournament filter hint text
- `facility/[id].tsx` — host-a-tournament and claim-facility alerts
- `groups/[id].tsx`, `quick-game/*`, `round-robin/*`, `mini-tournament-created.tsx` — share/manage alerts
- `tournament/[id]/command-center.tsx`, `tournament/[id]/division-bracket.tsx` — director tool alerts
- `tournament/[id].tsx` — waitlist alert
- `players/[id].tsx` — marketplace placeholder text

None of them take money, create records, or fabricate success. They are honest
"not yet" messages inside otherwise working screens.

## Promotion criteria

A feature moves from `hidden` to `included` when all of the following hold:

1. Its execution-plan item is closed with verification evidence.
2. It has no fake success state, no mock data, and no silent fallback.
3. Its failure modes render honestly (canceled / failed / offline / empty).
4. If money moves, Stripe Dashboard state and database state have been shown to
   agree, including on duplicate and failed events.
5. It has been exercised on a physical iOS and Android device.

Flip the entry in `FEATURE_VISIBILITY`, update this table, and note the
verification evidence in `TODO1.1_EXECUTION_PLAN.md`.
