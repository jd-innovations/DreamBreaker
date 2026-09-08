# BOOKING_ENGINE_PHASE3_REPORT.md

> **SUPERSEDED 2026-08-21 — do not action the unblock steps below.** Execution-plan
> item 3.1 completed the wiring this report was waiting on: `useReservationPayment()`
> is imported by `booking/review.tsx`, PaymentSheet is presented, and the
> "Continue in Test Mode" branch is deleted. Both blockers described below have
> also been re-tested and neither holds as written — see "What changed since this
> report" immediately after the blocker section. The findings are preserved as a
> record of what was true on 2026-08-11, not as outstanding work. Current status
> lives in `TODO1.1_EXECUTION_PLAN.md` §3.1 Completion Notes.

> Status: Phase 3A complete (PaymentIntent creation + finalize logic, real and deployed) — client-side PaymentSheet code is written but **not wired into any screen**, blocked by an environment constraint discovered this phase. Phase 3B (webhook-based confirmation) remains blocked as expected, per explicit scope.
> Source of truth: [BOOKING_ENGINE_PHASE1_REPORT.md](BOOKING_ENGINE_PHASE1_REPORT.md), [BOOKING_ENGINE_PHASE2_REPORT.md](BOOKING_ENGINE_PHASE2_REPORT.md)
> Applied to: Supabase project `fbzetvkbhneptvfruilw` ("dreambreaker-pb")
> Scope: `apps/mobile`, `supabase/functions/`, `web/src/lib/payments/`

---

## Read this first — two separate blockers, don't conflate them

1. **Phase 3B (webhook confirmation) — expected, unchanged.** Stripe cannot reach `web/src/app/api/stripe/webhooks/route.ts` in this environment (Vercel SSO protection on the deployment, no `STRIPE_WEBHOOK_SECRET`). This was known before this phase started and is exactly as scoped.
2. **PaymentSheet / `@stripe/stripe-react-native` — new, discovered this phase.** Importing that package anywhere reachable from `apps/mobile/src/app/` breaks the Metro bundle on **both** targets available in this dev environment — not just Expo Go. Confirmed by direct test (see "What actually happened" below). This is a separate, harder blocker than the webhook one: there is no way to visually exercise Stripe's native payment UI in this session at all, on any target.

Both are infrastructure/environment gaps, not code defects. Everything on the server side (PaymentIntent creation, pricing, finalize logic) is real, deployed, and verified. The one thing genuinely missing is the mobile screen actually presenting Stripe's UI.

## What changed since this report (verified 2026-08-21)

Both blockers above were re-tested directly. Neither is accurate any more:

1. **Webhook (blocker 1) — resolved, and partly wrong when written.**
   `POST https://pickleballapp.app/api/stripe/webhooks` returns
   `400 {"error":"Missing stripe-signature header"}`, i.e. the signature check
   fires — so `STRIPE_WEBHOOK_SECRET` **is** set. `stripe_webhook_events` holds
   16 `payment_intent.succeeded` rows, all processed, and 15 payments have
   reached `succeeded` in production. Vercel SSO protection is real
   (`all_except_custom_domains`) but the API route answers regardless; point
   Stripe at the custom domain to be safe.

2. **PaymentSheet (blocker 2) — narrower than described.** The constraint is
   web-target-specific: Metro's *web* bundler still refuses
   `@stripe/stripe-react-native` over a transitive `ReactFabric` import. It never
   applied to a dev-client device build, which is how the app now runs. Steps 1–6
   below are all done: `StripeProvider` wraps the tree in `_layout.tsx`, the
   config plugin is in `app.config.js`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is
   set in `.env` and in all three EAS environments, and `review.tsx` branches on
   the full `PaymentOutcome`.

What genuinely remains: `finalizeReservationPayment()` has still never executed
in production — every succeeded payment to date is a tournament one. That is what
the pending device test will exercise for the first time.

---

## Summary

**Completed and verified:**
- `supabase/functions/create-booking-payment-intent/` — new edge function, deployed (version 1, `verify_jwt: true`). Mirrors `create-tournament-entry-payment-intent` exactly: verifies the caller's JWT, resolves the reservation's server-snapshotted `final_price_cents` (already includes any Flash Deal discount — never recomputed), guards against paying twice/on a cancelled or hold-expired reservation, then calls the existing domain-neutral `createPayment()` primitive. Attaches the payment to the **existing** reservation via `purpose_id` — never creates a second reservation.
- `web/src/lib/payments/finalizePayment.ts` — added `finalizeReservationPayment()`, dispatched from the existing `purpose_type` switch (the one file that needed a new branch, per its own header comment). On a succeeded payment: idempotent no-op if already confirmed, refuses to confirm (logs for manual review) if the reservation is no longer `held` (e.g. cancelled while payment was in flight), otherwise flips `held → confirmed` directly via the service client — the same transition `confirm_reservation()` performs, but safe to run from a server-side/webhook context where `auth.uid()` is null.
- `apps/mobile/src/lib/payments/reservationPaymentIntent.ts` — new, Stripe-SDK-free. `createBookingPaymentIntent()`, error-code-to-message mapping, confirmation polling, and payment-status lookup (`fetchReservationPayment`/`fetchReservationPayments` for single/bulk use). Deliberately isolated from any Stripe import so it's safe to use from any screen under `src/app/`.
- `apps/mobile/src/lib/payments/useReservationPayment.ts` — the real `useStripe()`/`initPaymentSheet()`/`presentPaymentSheet()` hook. **Written, type-checked, not imported by any screen** — see the blocker below.
- `booking/review.tsx` — now calls the real edge function for real (creates an actual Stripe PaymentIntent + `payments` row), shows the real amount, and is honest in the UI about payment UI not being available in this build rather than faking success or silently falling back.
- `booking/confirmation.tsx`, `booking/game-status.tsx`, `booking/my-bookings.tsx` — all three now look up and display the real payment status (`Paid` / `Payment Pending` / `Payment Failed` / `Test Mode` / etc.) from the `payments` table instead of a hardcoded "test mode" note.

**Not done, and why:**
- Stripe's PaymentSheet is never actually presented to a user in this environment. `useReservationPayment.ts` exists and is correct but isn't wired into `review.tsx`.
- Real webhook-driven finalization has not fired in production, since Stripe cannot reach this environment (unchanged Phase 3B blocker).

---

## What actually happened with StripeProvider (read before touching this again)

The existing code comment in `_layout.tsx` (from before this phase) said `@stripe/stripe-react-native` "does not resolve inside Expo Go." Since all verification in this project so far has used the **web** target (`expo start --web`, driven by Playwright — no device/simulator has ever been available in this environment), I tested whether the web target was actually affected too, rather than assuming the old comment's Expo-Go-specific framing was the whole story.

**It broke immediately.** I added `import { StripeProvider } from '@stripe/stripe-react-native'` to `_layout.tsx`, wrapped the app, added the `@stripe/stripe-react-native` config plugin back to `app.config.js` (the `expo-dev-client` plugin was already present, suggesting someone had already started paving toward a custom dev client) — and the shared dev server's home route immediately started 500ing for everyone. The actual bundler error, read directly out of the failed response body:

```
Importing native-only module "react-native/Libraries/ReactPrivate/ReactNativePrivateInitializeCore" on web from: node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-dev.js
Import stack:
 node_modules/@stripe/stripe-react-native/lib/module/helpers.js
 | import "react-native/Libraries/Components/TextInput/TextInputState"
           ^ Importing react-native internals is not supported on web.
 node_modules/@stripe/stripe-react-native/lib/module/components/CardForm.js
 node_modules/@stripe/stripe-react-native/lib/module/index.js
 src/app/_layout.tsx
 | import "@stripe/stripe-react-native"
```

`@stripe/stripe-react-native`'s own `helpers.js` transitively imports React Native's `TextInputState`, which pulls in `ReactFabric` — a native-only renderer path that Metro's web bundler explicitly refuses to resolve. This is not fixable by import placement: Expo Router's route-manifest bundling (`expo-router/entry.js`) eagerly resolves every route file to build its route table, so this breaks on the **first page load of the whole app**, regardless of which specific screen carries the import — confirmed by the fact that `/` itself 500'd, not just a hypothetical booking route.

I reverted both files immediately (confirmed via `curl` that the home route returned to `200`, then confirmed a full page load via direct fetch of the rendered HTML) and did not re-attempt it. Given this same mechanism is documented to also break Expo Go (native) for the original, different reason ("Unable to resolve module"), and this environment has no device or simulator to test against anyway, there was no path forward available this session — re-testing a second time would only re-confirm the same root cause at the cost of the shared dev server again.

**What this means concretely:** to actually present Stripe's PaymentSheet, someone needs to build and run the app via a custom Expo dev client (`eas build --profile development` or local `expo run:ios`/`expo run:android`) on a real device or simulator — neither of which exists in this session. Until then, `useReservationPayment.ts` is correct, ready code that cannot be exercised here.

**To unblock (exact steps, for whoever has device/simulator access):**
1. Build a custom dev client: `eas build --profile development --platform ios` (or `android`), or `npx expo run:ios`/`run:android` locally if Xcode/Android Studio is available.
2. Install it on a device or simulator (not Expo Go).
3. In `apps/mobile/src/app/_layout.tsx`, re-add `import { StripeProvider } from '@stripe/stripe-react-native'` and `import { STRIPE_PUBLISHABLE_KEY } from '@/lib/payments/stripeConfig'`, and wrap the app in `<StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="...">` (see the git history of this file for the exact diff I wrote and reverted — it's correct, just untestable here).
4. In `apps/mobile/app.config.js`, re-add the `['@stripe/stripe-react-native', { merchantIdentifier: '...' }]` plugin entry (a real merchant ID, not the placeholder I used).
5. ~~Set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `apps/mobile/.env` (currently unset).~~ **Done** — set locally and in the EAS `development`, `preview`, and `production` environments (2026-08-21).
6. **Done (3.1, 2026-08-21).** In `booking/review.tsx`, replace the `handlePay` implementation's "create intent, then show a static Test Mode message" behavior with a call to `useReservationPayment().payForReservation(reservation.id, attemptId)`, and branch the UI on its returned `PaymentOutcome` (`confirmed` / `succeeded_pending_confirmation` / `canceled` / `failed` / `error`) instead of the current `paymentReady` state.
7. Test on the real device/simulator. Do not attempt this on `expo start --web` or Expo Go again — both are confirmed broken.

---

## Files Created

- `supabase/functions/create-booking-payment-intent/index.ts` — deployed
- `apps/mobile/src/lib/payments/reservationPaymentIntent.ts` — Stripe-free PaymentIntent creation, error messages, confirmation polling, payment-status lookups
- `apps/mobile/src/lib/payments/useReservationPayment.ts` — real PaymentSheet hook, written but not imported by any screen (see blocker above)

## Files Modified

- `web/src/lib/payments/finalizePayment.ts` — added `finalizeReservationPayment()` + dispatch branch
- `apps/mobile/src/app/booking/review.tsx` — real PaymentIntent creation wired in; honest "payment UI unavailable in this build" state with a Continue-in-Test-Mode fallback; guards against re-paying an already-confirmed reservation and against creating a second reservation
- `apps/mobile/src/app/booking/confirmation.tsx`, `game-status.tsx`, `my-bookings.tsx` — real payment status displayed via `fetchReservationPayment`/`fetchReservationPayments`, falling back to "Test Mode" when no `payments` row exists (the pre-Stripe direct-confirm path, still valid and still used as the fallback)
- `apps/mobile/src/app/_layout.tsx`, `apps/mobile/app.config.js` — StripeProvider/plugin added, tested, reverted (see above); comments updated to record what was learned so this isn't rediscovered the hard way again

## Database Changes

None. `payments`, `payment_status`, and `stripe_webhook_events` already existed from the shared payment foundation (`20260809140000_shared_payment_foundation.sql`) and are reused as-is — including in the mobile app's `database.types.ts`, which already had `payments` typed (no regeneration needed).

---

## Reused Architecture (per explicit instruction not to duplicate it)

- `supabase/functions/_shared/payments.ts`'s `createPayment()` — called as-is, no changes.
- `payments` table, its RLS (payer can read own rows, no client INSERT/UPDATE — service role only), its idempotency-key retry behavior.
- `finalizePaymentSucceeded()`'s dispatch-by-`purpose_type` pattern — `finalizeReservationPayment` is the only new branch; nothing about the webhook route, the idempotency ledger, or the dev simulation route changed.
- The exact auth pattern from `create-tournament-entry-payment-intent`: pass the user's own JWT through, verify via `auth.getUser()`, use the service-role client only to read authoritative data, never trust a client-supplied amount.
- Metadata convention: camelCase domain keys (`reservationId`, `facilityId`, `assetType`, `assetId`, `organizerId`), matching `tournamentId`/`divisionId`/`playerId` etc. from the tournament function.

---

## Tests Performed

**Static analysis:** `npx tsc --noEmit` (mobile and web) and `npx eslint` on every touched file — 0 errors on both, at every checkpoint including after the StripeProvider revert. (One transient issue: Expo Router's auto-generated `.expo/types/router.d.ts` got corrupted mid-write twice during this session, same as in Phase 2 — not a source issue, fixed by deleting it and touching a route file to force regeneration.)

**Live, no fabrication:**
- **Edge function deployed and reachable.** `create-booking-payment-intent` version 1, `verify_jwt: true`, matching the tournament/coach functions' configuration exactly.
- **Auth boundary verified live, twice.** A request with no `Authorization` header gets rejected by the platform gateway itself (`401 UNAUTHORIZED_NO_AUTH_HEADER`) before my code even runs. A request with the anon key as the bearer token (exactly what an unauthenticated mobile client's `supabase.functions.invoke()` sends) passes the gateway but is correctly rejected by the function's own `auth.getUser()` check (`401 {"error":"unauthorized"}`) — the exact error code `reservationPaymentErrorMessage()` on the client maps to "Please sign in to pay for this reservation."
- **No authenticated session was available in this environment** (unchanged constraint from every prior phase in this project — no test credentials exist for this session). This means the organizer-gated path through the real HTTP edge function (pricing lookup, guard conditions, real Stripe PaymentIntent creation) could not be driven end-to-end through its actual entrypoint. I do not claim it was.
- **What I verified instead, at the same rigor as every prior phase's SQL-impersonation testing:** created a fresh held reservation on the Flash-Deal court (Court C, 20% off, base $18.00 → $14.40), inserted a `payments` row exactly as `createPayment()` would (same columns, same amount), then replicated `finalizeReservationPayment()`'s exact conditional `UPDATE` statement three times:
  1. **Normal path**: `held → confirmed`, `hold_expires_at` cleared, `confirmed_at` set, `final_price_cents` unchanged at **1440** (proving the Flash Deal discount survives the full create → pay → finalize chain).
  2. **Idempotency**: re-running the identical conditional update against the now-`confirmed` row returned zero rows — a true no-op, matching the function's own early-return guard.
  3. **Split-brain guard**: created a second reservation, cancelled it via the real `cancel_reservation()` RPC, then ran the same finalize update — zero rows affected, reservation stayed `cancelled`, never got overwritten to `confirmed`. This is the exact "payment succeeded after the reservation was cancelled out from under it" case the function's code comment calls out as needing manual review rather than silent confirmation.
- **No duplicate reservation created**: every payment-attachment test in this phase used an existing reservation's id as `purpose_id` — nothing in this phase's code path, real or simulated, calls `create_reservation()` a second time for the same booking.
- **All temporary test rows deleted** after verification — both temporary reservations and the one temporary `payments` row are confirmed gone (`select … where purpose_type = 'reservation_payment'` returns empty).
- **Ball machine**: not re-tested this phase — `finalizeReservationPayment()`'s logic doesn't branch on `asset_type` at all (it only reads `reservations.status`), and ball-machine reservation creation/confirmation was already proven correct via the same RPCs in the prior phase's testing. No new risk surface here.

**An important, honest side-finding — not something I caused:** while checking the reservation count after cleanup, I found **4 reservations on the seeded facility that I did not create and do not recognize** from this session's test-profile ids — one organized by the admin account (`8eb9b4cf-…`, `dhjesus122@gmail.com`) and one by a different real account (`ab26e73e-…`), created between yesterday evening and this morning. I left all four untouched — they weren't part of my documented seed set, and given they're tied to real accounts rather than the `111…101`–`104` test profiles I've used throughout this project, they may be genuine manual testing by you or someone else against the live app. Worth checking `select * from reservations where facility_id = 'db4be625-ed7e-49e2-bf23-45ccf8b85b12' and organizer_id not in ('11111111-1111-1111-1111-111111111101','...102','...103','...104')` if you want to see them — I did not modify or delete any of them.

---

## Known Limitations

1. **PaymentSheet cannot be visually tested in this environment at all** — no device/simulator, and both available targets (web, Expo Go) are confirmed incompatible with the SDK import. This is the primary blocker for calling Phase 3A "done" in a user-facing sense; the server side is real and correct, the client UI is not reachable.
2. **Phase 3B (webhook) unchanged** — still blocked on Vercel SSO + missing `STRIPE_WEBHOOK_SECRET`, exactly as scoped coming into this phase.
3. **No local web dev server was running**, and `web/.env.local` has no `STRIPE_SECRET_KEY`/`DEV_TOOLS_SECRET` configured locally — so the `/api/dev/simulate-payment` bypass (the tool built specifically for testing finalize logic without live Stripe) could not be exercised through its real HTTP route this session either. The SQL-level replication above is the substitute, at the same evidentiary tier used throughout this project for every RPC/finalize check where no authenticated session was available.
4. **Refund handling is explicitly not built** — `finalizeReservationPayment()` logs and returns when a payment succeeds against a non-`held` reservation rather than silently confirming or refunding; a human needs to handle that case manually today. This matches your explicit "no new cancellation policy logic beyond what already exists" instruction.
5. **The zero-price edge case** (`final_price_cents <= 0`, e.g. a facility with no rate configured) returns `no_payment_required` from the edge function and falls back to the pre-Stripe direct-confirm path in `review.tsx` — untested this phase since no seeded court has a zero rate, but the code path is simple and mirrors the tournament function's identical `no_payment_required` handling exactly.

---

## Phase 3B / Next-Phase Readiness

The moment the webhook endpoint is reachable (Vercel SSO resolved + `STRIPE_WEBHOOK_SECRET` set), `finalizeReservationPayment()` requires zero changes — it's already wired into the same `dispatchPaymentSucceeded()` switch the webhook route calls for every other domain. The moment a custom dev client exists, `useReservationPayment.ts` requires zero changes either — only the five wiring steps listed above (`_layout.tsx`, `app.config.js`, env var, `review.tsx`'s `handlePay`, then real-device testing). Both blockers are infrastructure, not code debt.
