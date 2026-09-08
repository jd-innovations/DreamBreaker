# Coach Marketplace V1 — Handoff (as of 2026-08-10, Phase 4 complete)

Read this first if you're picking up Coach Marketplace work in a new conversation. It covers what's built, what's deliberately deferred, and exactly where to resume.

## Source documents

- `COACH_MARKETPLACE_V1_SPEC.md` — the product spec this build follows (not in this repo listing above but referenced throughout; ask the user if it's not present).
- `TODO1.1.md` — repo-wide production-readiness audit (predates this work). Task **C7** ("payment integrity") is the audit finding Phase 0 below closes.
- This file supersedes nothing — it's a status snapshot, not a spec.

## What's been built, in order

### Phase 0 — Shared payment foundation (COMPLETE, internally verified; external Stripe validation deferred)
Domain-neutral, server-authoritative Stripe payment primitive — **not** Coach-specific, shared by the whole app.

- `supabase/functions/_shared/payments.ts` — `createPayment()`, the one place a PaymentIntent + `payments` row gets created.
- `supabase/functions/create-tournament-entry-payment-intent/` — first (and only) real domain consumer; computes the tournament entry fee server-side, never trusts the client.
- `web/src/lib/payments/finalizePayment.ts` — `finalizePaymentSucceeded()`, the **one** place a payment ever transitions to `succeeded` and dispatches domain finalization (currently only `tournament_registration_entry`). Both the real Stripe webhook (`web/src/app/api/stripe/webhooks/route.ts`) and the dev simulator call this same function — no duplicated finalization logic.
- `web/src/app/api/dev/simulate-payment/route.ts` — **development/test only**. Hard 404 in production, second 404 unless `DEV_TOOLS_SECRET` env var is set and echoed in an `x-dev-tools-secret` header. Creates a `payments` row with `provider='dev_test'`, `provider_payment_intent_id` prefixed `dev_test_...` (never confusable with a real Stripe `pi_...` id), then calls the same `finalizePaymentSucceeded()`.
- DB: `payments`, `stripe_webhook_events` tables (migration `20260809140000_shared_payment_foundation.sql`). A trigger (`trg_protect_registration_payment_fields`) closes the exact C7 hole: `registrations.entry_fee_paid_cents`/`hold_fee_paid_cents` can now only be written by the service role.
- Mobile: `@stripe/stripe-react-native` was added, then **deliberately stubbed back out** (see `apps/mobile/src/lib/payments/useTournamentEntryPayment.ts` — it fails closed, never fakes success) because the native module broke Expo Go. `StripeProvider` is not in `_layout.tsx`. This is intentional, not regressed — re-enable only when moving to a custom EAS dev-client build.
- **Known gap, flagged not fixed**: the tournament *hold* flow (`createHold`/`convertHoldToRegistration`/`hold-confirm.tsx`) still writes payment fields directly and will now hard-fail for nonzero hold fees (the new trigger blocks it). Only the direct entry-fee flow was migrated onto the payment primitive.

### Phase 1 — Coach activation + Stripe Connect generalization + platform config (COMPLETE, internally verified)
- `profiles.is_coach` / `profiles.coach_status` (`inactive → onboarding → active/restricted`, plus dev-only `test_ready`). Migration `20260809150000_coach_marketplace_phase1_activation.sql`.
- `trg_protect_coach_status_transitions` — a client can only self-activate (`inactive→onboarding`); everything else requires the service role (real Connect webhook) or the dev fixture route.
- `is_coach_publish_ready(user_id)` — readiness abstraction; true for real `active` or dev `test_ready`. `test_ready` is **structurally unreachable in production** because the only route that sets it (`web/src/app/api/dev/set-coach-test-ready/route.ts`) has the same production/secret gate as the payment simulator.
- `web/src/app/api/stripe/connect/start/route.ts` generalized to take a `role: 'director' | 'coach'` — one Connect account creation path for both, not forked.
- `platform_settings` seeded with all Coach Marketplace business parameters (`coach_marketplace_min_discount_pct` = 20 at time of writing, commission %, settlement hold hours, payout weekday, etc.) — admin-editable, nothing hard-coded.
- Mobile: `apps/mobile/src/app/coach/index.tsx` — Coach Mode activation screen, reachable from Profile.

### Phase 2 — Coach Offers (COMPLETE, internally verified)
- Schema: `coach_offers`, `coach_offer_images` (migration `20260809160000_coach_marketplace_phase2_offers.sql`). `coach_offer_type` enum (private/semi_private/group_clinic/camp/package), `coach_offer_status` enum (draft/active/paused/archived).
- `trg_enforce_coach_offer_publish_rules` — re-checked on **every** transition into `active` (including resume): minimum discount (from `platform_settings`) + `is_coach_publish_ready()`. Drafts are exempt.
- RLS: public read of `active` offers; owner full read/write of their own; no DELETE policy (archive only, so future purchases always have a row to reference); INSERT requires `coach_id = auth.uid() AND is_coach = true`.
- Storage: new `coachOffer` image category added to the shared ImagePipeline (`apps/mobile/src/lib/media/{types,imageStandards}.ts`), bucket `coach-offers`, mirrors the existing `marketplace` category exactly — no second image system.
- Service layer: `apps/mobile/src/lib/coach/offers.ts` (CRUD, publish/pause/resume/duplicate/archive), `apps/mobile/src/lib/coach/offerPhotos.ts`, `apps/mobile/src/lib/coach/constants.ts`.
- Mobile screens:
  - `apps/mobile/src/app/coach/offers/index.tsx` — coach's own "My Offers" list (pause/resume/duplicate)
  - `apps/mobile/src/app/coach/offers/create.tsx` — single-screen create form
  - `apps/mobile/src/app/coach/offers/[id]/edit.tsx` — edit/publish/pause/resume/archive (photo re-management **not** built — known gap)
  - `apps/mobile/src/app/lessons/index.tsx` + `apps/mobile/src/app/lessons/[id].tsx` — minimal **player-facing browse** screens (added after Phase 2 "complete", on request). Read-only, explicit "purchasing isn't available yet" notice, no checkout. Entry point: Profile → "Lesson Marketplace". Not the real Phase 10 discovery UI — just enough to visually review the catalog.

### Dev seed data (loaded on the live project)
- `supabase/seed/coach_marketplace_dev_seed.sql` — 13 coaches (`c0ac0000-0000-0000-0000-0000000000XX`, `@coach.dreambreaker.test`, all `coach_status='test_ready'`) + 30 offers (`33333333-3333-3333-3333-3333333300XX`) across all 5 types, realistic pricing/discounts (all active ones ≥20%), 5 packages, 4 Premium-touching, 27 with a real existing `facility_id`. Idempotent (`ON CONFLICT DO NOTHING`).
- `supabase/seed/coach_marketplace_dev_seed_reset.sql` — companion cleanup script, correct FK-safe delete order.
- **No `coach_offer_images` were seeded** — avoided introducing a second/hotlinked image system. Offers show the app's empty-photo placeholder.
- Coach login for manual testing: `<firstname>.<lastname>@coach.dreambreaker.test` / `Password123!` (see the seed file for the exact 13 names).

### Phase 3 — Coach Purchase + Financial Ledger (COMPLETE, internally verified; Stripe path unexercised)

Read `COACH_MARKETPLACE_V1_SPEC.md` in full for this phase (now present at repo root — it wasn't when Phases 0-2 were built). Full completion report was posted in-session; summary here:

- `supabase/migrations/20260810010000_coach_marketplace_phase3_purchases.sql`, `20260810010100_..._expiration_snapshot.sql` (fixes a spec §24 omission caught on review), `20260810010200_..._fk_indexes.sql` — all applied live to `dreambreaker-pb`.
- `coach_offer_purchases` — one row per purchase, full financial snapshot (price, discount, commission source/pct/amount, boost placeholders, buyer service fee, tax placeholder, coach net proceeds, expiration policy), narrow status enum (`payment_pending`/`finalized`/`failed`/`cancelled`/`refunded`), immutable after creation via `trg_protect_coach_offer_purchase_integrity` (blocks even service_role from rewriting economic terms; only status/paid_at/processing_fee_* may change, and only `payment_pending -> {finalized,failed,cancelled}`).
- `coach_offer_purchase_ledger_events` — append-only financial audit log; `trg_block_ledger_event_mutation` unconditionally rejects UPDATE/DELETE, including for service_role.
- `create_coach_offer_purchase(offer_id, participant_quantity)` — SECURITY DEFINER RPC, the *only* way a purchase row is created. Resolves price, commission (offer override → coach override → platform default), buyer service fee, and expiration entirely server-side from `platform_settings`/`coach_offers`/`profiles`. Enforces inventory (`SELECT...FOR UPDATE` + live aggregate over unexpired `payment_pending` holds — self-healing, no cron needed) and per-customer purchase limits. Rejects self-purchase and `premium_only` offers (no Premium membership infra exists anywhere in the repo — documented limitation, not faked).
- `finalizeCoachOfferPurchase()` added to `web/src/lib/payments/finalizePayment.ts`'s dispatch table — commits the already-locked-in outcome (flip status, decrement `coach_offers.quantity_remaining` exactly once via `finalize_coach_offer_purchase_inventory()`, append one `purchase` ledger event). Never recomputes price/commission.
- `commission_override_pct` added to `coach_offers` (offer-level, admin/RLS-open — flagged not fixed) and `coach_commission_override_pct` added to `profiles` (coach-level, trigger-protected from client writes).
- `supabase/functions/create-coach-offer-purchase-payment-intent/index.ts` written (calls the RPC, then `createPayment()`/Stripe) but **not deployed** — Stripe path deliberately deferred, same status as `create-tournament-entry-payment-intent`. Dev/testing goes through the RPC directly, bypassing this function entirely.
- 20+ scenarios validated via direct SQL against live prod, wrapped in `BEGIN...ROLLBACK` with `SET LOCAL ROLE authenticated` + JWT claim impersonation (same pattern as Phase 0-2) — commission precedence, buyer-service-fee modes, oversell prevention, purchase limits, package/multi-participant snapshots, immutability against both client and service-role mutation, RLS cross-user isolation. Confirmed zero rows/side effects persisted afterward.

### Phase 4 — Wallet Vouchers (COMPLETE, internally verified)

- `supabase/migrations/20260810020000_..._wallet_vouchers.sql`, `20260810020100_..._hero_image_snapshot.sql` (fixes a hero-image gap caught on review) — applied live.
- `wallet_items.type` extended with `'coach_voucher'` (existing generic Wallet infrastructure from `wallet_phase1.sql`, reused not duplicated — same table, same RLS, same idempotent-source unique index `(user_id, source_type, source_id, type)` already built for exactly this cross-domain-issuance case).
- `coach_voucher_entitlements` — new, coach-specific redemption-entitlement table (NOT `wallet_redemptions`, which is a generic attempt-log stub insufficient for N-of-M/per-participant tracking, per explicit instruction). `entitlement_type` = `participant` (one row per participant, `total_redemptions=1` each) or `package` (one decrementing row, `total_redemptions=lessons_included`). Idempotent via two partial unique indexes. Immutable identity/terms via `trg_protect_coach_voucher_entitlement_integrity` (blocks even service_role); `remaining_redemptions`/`status`/`exhausted_at`/`revoked_*` are the only mutable columns, reserved for Phase 5/7.
- `create_coach_voucher_from_finalized_purchase(purchase_id)` — SECURITY DEFINER, idempotent get-or-create, called from `finalizeCoachOfferPurchase()` in `finalizePayment.ts` right after the Phase 3 ledger event. Silently no-ops for any non-`finalized` purchase. Snapshots coach name, facility name, primary offer image URL, price/discount/participant/lessons terms into `wallet_items.metadata` — never re-reads the live `coach_offers` row after purchase.
- Expiration derived once from Phase 3's immutable `expiration_days` snapshot (`paid_at + expiration_days`), never from the current `platform_settings` value — verified live (changing the setting after purchase left the existing voucher's `expires_at` untouched).
- Mobile: `walletTypes.ts` (`coach_voucher` type + `CoachVoucherSnapshot`/`CoachVoucherEntitlementSummary`), `lib/supabase/wallet.ts` (metadata parsing, read-time expiry display-override scoped only to `coach_voucher`, `fetchCoachVoucherEntitlementSummary()` — always a live read, never cached), `walletItemAccent.ts` + `walletItemStatus.ts` (new "My Vouchers" dashboard section per spec §13), `WalletCard.tsx` + `wallet/[id].tsx` (hero image with Ionicons fallback, matching the existing Lesson Marketplace detail screen's placeholder pattern — no second image pipeline). No QR/redemption UI built.
- Dev-seed caveat carried forward: no `coach_offer_images` exist in seed data, so `heroImageUrl` is always `null` today — only the fallback icon path has real seed-data coverage; the custom-image path is code-reviewed but untested against real data this session.

## Explicitly NOT built yet (by design, per user instruction)

- Phase 5 (QR/manual-code redemption), Phase 6 (settlement/payout), Phase 7 (disputes/refunds), Phase 8 (reviews), Phase 9 (boosts/attribution) — none started. `coach_voucher_entitlements` (status `active`) is the authoritative source Phase 5 should validate redemptions against.
- Real Stripe: **PaymentIntent creation is now live and verified** (2026-08-11) — `STRIPE_SECRET_KEY` (test mode) is set as a Supabase Edge Function secret, and both `create-tournament-entry-payment-intent` and `create-coach-offer-purchase-payment-intent` are deployed (they weren't before — verified via `list_edge_functions`, neither had ever actually been pushed). Both were exercised end-to-end with a throwaway auth user + real HTTP calls: each produced a genuine test-mode Stripe PaymentIntent (`pi_...`) and a correctly-populated `payments` row (`status='requires_confirmation'`, as designed). Test artifacts (the two throwaway users, their `payments`/`coach_offer_purchases` rows) were cleaned up afterward; the two test-mode PaymentIntents were left uncancelled in Stripe (harmless, no charge, will auto-expire).
  - **Still NOT verified**: the webhook side. No `STRIPE_WEBHOOK_SECRET` is set anywhere, no Stripe webhook endpoint has been created pointing at `/api/stripe/webhooks`, and the web app's own `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` env vars (Vercel or wherever it's deployed) haven't been confirmed set. So a PaymentIntent can now be *created* for real, but nothing yet flips a `payments` row to `succeeded` outside of the dev simulator — the full real-money round-trip (pay with a real test card → webhook fires → `finalizePaymentSucceeded()` → registration/voucher created) has not been exercised.
  - **Blocker found, work parked (2026-08-11) at user's request**: the web app is deployed on Vercel (project `dream-breaker-fv6x`, team `jdflow`/`team_qrnXXrPSK9jzqiW2wUQGiz1y`, prod domain `dream-breaker-fv6x.vercel.app`). That project has **SSO/Vercel Authentication deployment protection enabled** (`ssoProtection.enabled=true`, `deploymentType="all_except_custom_domains"`), and it has **no custom domain** — only `*.vercel.app` domains. Protection therefore applies to every current URL, meaning Stripe's webhook POSTs would 401 before ever reaching `/api/stripe/webhooks`. Before creating a real Stripe webhook endpoint, this needs one of: (a) Vercel's "Protection Bypass for Automation" secret (set up in the Vercel dashboard, Settings → Deployment Protection — no MCP tool found for this, must be done by a human), (b) a custom domain, or (c) disabling SSO protection project-wide (security tradeoff, needs explicit sign-off). Also note: the project's `latestDeployment` predates this session's Phase 3/4 code changes — a fresh production deploy will be needed before the deployed webhook handler actually contains the coach-purchase finalization dispatch path.
  - No real Stripe Connect onboarding has been exercised.
- EAS build / native Stripe SDK — stubbed, not wired back in.

## How things were validated this session (useful pattern for next time)

Real HTTP testing of the dev routes wasn't possible — no access to `SUPABASE_SERVICE_ROLE_KEY` (deliberately not exposed via the Supabase MCP tools available). Instead: SQL run directly against the live project via the Supabase MCP `execute_sql` tool, wrapped in `BEGIN; ... ROLLBACK;` so nothing persists, with a **critical caveat learned mid-session**: that MCP connection runs as `postgres`, which has `rolbypassrls = true` — it can validate *trigger*-based protections (they fire regardless of role) but **cannot** validate RLS *policies* by default. The fix used: `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role = 'authenticated'; SET LOCAL request.jwt.claim.sub = '<uuid>';` inside the transaction to genuinely exercise RLS as a real user would. Use this pattern for any future RLS validation — a bare `execute_sql` call proves nothing about RLS on its own.

## Live project

Supabase project `dreambreaker-pb`, id `fbzetvkbhneptvfruilw`. Every migration this session was applied directly via MCP `apply_migration` with the user's explicit approval each time (see migrations `20260809140000` through `20260809160100`). `database.types.ts` (both `web/src/lib/supabase/` and `apps/mobile/src/lib/`) is regenerated and current as of the last migration.

## If resuming: recommended first message

"Continue Coach Marketplace V1 from COACH_MARKETPLACE_HANDOFF.md — proceed to Phase 5 (QR/manual-code redemption), building on `coach_voucher_entitlements` as the authoritative entitlement source, following the same dev-simulation-first, Stripe-deferred approach as Phases 0-4." Adjust if priorities have changed.
