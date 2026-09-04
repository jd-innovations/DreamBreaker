# BOOKING_ENGINE_PHASE2_REPORT.md

> Status: Phase 2 complete — player-facing Booking Engine flow, end to end, minus payment/QR/push
> Source of truth: [BOOKING_ENGINE_V1_SPEC.md] (referenced by the audit; not present in the working tree — this report and the audit are the closest available specs), [BOOKING_ENGINE_AUDIT.md](BOOKING_ENGINE_AUDIT.md), [BOOKING_ENGINE_PHASE1_REPORT.md](BOOKING_ENGINE_PHASE1_REPORT.md)
> Applied to: Supabase project `fbzetvkbhneptvfruilw` ("dreambreaker-pb") — same project Phase 1 targeted
> Scope: `apps/mobile` only. No facility-admin UI, no web changes.

---

## Why this report exists now, not incrementally

Phase 1 shipped with a written report. The Phase 2 UI (discovery screens, Choose Time & Court, Find/Invite Players, Review & Pay, Confirmation, My Bookings, Game Status) was built across several sessions in this same working tree, but no report was written until now — which caused a real problem mid-phase: an earlier verification pass concluded "no booking UI exists" by trusting Phase 1's "Known Limitations" section instead of checking the filesystem, when in fact `booking/index.tsx`, `results.tsx`, and an extended `facility/[id].tsx` already existed on disk, uncommitted. See the git note below. This report exists so that mistake doesn't repeat for whoever picks up Phase 3.

**Important standing fact, not unique to this report:** `git ls-files apps/` returns zero tracked files. The entire `apps/mobile` app — every file this report describes — is uncommitted on `feature/expo-mobile-foundation`. If this session's working tree is lost, all of Phase 2 is lost with it. This is worth flagging to the team independent of Booking Engine specifically.

---

## Summary

Built the complete player-facing reservation flow, from search to a live, cancellable booking with realtime roster updates:

**Search → Discovery**
- `booking/index.tsx` — location/date/game-format/group-size search
- `booking/results.tsx` — facility results with Flash Deal badge, court/machine counts, starting price
- `facility/[id].tsx` — extended with a "Book a Court" section: court/ball-machine inventory, Flash Deal pricing, hourly availability summary
- Home quick actions: "Book a Court" (`/booking`) and "My Bookings" (`/booking/my-bookings`) — no new bottom tab added

**Reservation core**
- `booking/choose-time.tsx` — hour-based time-slot picker per court/ball machine, live occupancy (`Starting New Game` / `Need N More Players` / `Game Complete`), Flash Deal pricing, cross-asset-type "Also Available at This Time", wired to `create_reservation()`/`join_reservation()`
- `booking/players.tsx` — Find Players (facility-local `useFacilityFinderCandidates`) + Invite Friends (`fetchFriends`/`searchPlayers`), wired to `reservation_invites`
- `booking/review.tsx` — price breakdown, test-mode payment stub, wired to `confirmReservation()` (the existing `confirm_reservation()` boundary — no Stripe)
- `booking/confirmation.tsx` — booking confirmed, player status, Flash Deal savings, Find/Invite Players, View Game Status, Directions

**Post-booking**
- `booking/my-bookings.tsx` — Upcoming / Past / Cancelled, tap-through to Game Status
- `booking/game-status.tsx` — live roster + occupancy via `useReservation()`'s realtime subscription, Find/Invite Players, Directions, Cancel Reservation (existing `cancel_reservation()` RPC, no new policy)

**Database**
- One new migration this phase: `20260810000000_booking_search_bookable_and_zip.sql` — fixed `search_facilities_nearby()` to filter on `bookable_by_public` (was incorrectly using `public_access`) and to match `postal_code` in text search. Additive-only (`bookable_only` param defaults `false`); every pre-existing caller (`onboarding/area-recommendations.tsx`, `log-session/select-location.tsx`, `select-home-court.tsx`) is unaffected.
- No other schema changes this phase — `reservations`, `reservation_players`, `reservation_invites`, `flash_deals`, and every RPC (`create_reservation`, `join_reservation`, `accept_reservation_invite`, `cancel_reservation`, `confirm_reservation`, `reservation_occupancy`, `reservation_occupancy_for_asset`, `reservation_best_flash_deal`) were already in place from the reservation-core migrations applied earlier this phase and are used as-is.

Explicitly **not** built: real payment capture, QR check-in, push notifications, refunds, any new cancellation policy beyond the existing organizer/manager `cancel_reservation()` gate, and a Facility Admin UI (courts/ball machines/flash deals are still seeded directly — no admin screen exists to create them).

---

## Files Created

**Mobile screens** (`apps/mobile/src/app/booking/`)
- `index.tsx`, `results.tsx` — Search / Results
- `choose-time.tsx` — Choose Time & Court
- `players.tsx` — Find / Invite Players
- `review.tsx` — Review & Pay (stub)
- `confirmation.tsx` — Booking Confirmation
- `my-bookings.tsx` — My Bookings
- `game-status.tsx` — Game Status

**Service/hook layer**
- `apps/mobile/src/lib/bookingStore.ts` — session-lifetime wizard state (search params, facility, selection, `reservationId`, invited-profile-ids), threaded through every screen above instead of route params
- `apps/mobile/src/lib/supabase/reservations.ts` — `createReservation`/`joinReservation`/`cancelReservation`, `fetchReservationById`/`fetchReservationPlayers`/`fetchReservationOccupancy`/`fetchAssetAvailability`, occupancy display helpers (`playersNeeded`, `occupancyStatusLabel`, etc.)
- `apps/mobile/src/lib/supabase/reservationPayment.ts` — the `confirmReservation()` payment boundary (today: no Stripe, just flips held→confirmed)
- `apps/mobile/src/lib/supabase/reservationInvites.ts` — `reservation_invites` CRUD, re-exports `fetchFriends`/`searchPlayers` from `playEventInvites.ts` rather than duplicating them
- `apps/mobile/src/lib/supabase/flashDeals.ts` — `fetchActiveFlashDeal` (mirrors `reservation_best_flash_deal()` server logic for preview pricing), `fetchFlashDealsForFacility`
- `apps/mobile/src/lib/supabase/courts.ts`, `ballMachines.ts`, `operatingHours.ts`, `assetPhotos.ts` — Phase 1 inventory services, consumed as-is
- `apps/mobile/src/lib/useFacilityFinderCandidates.ts` — wraps `useFinderCandidates()` with a facility-coordinate origin override instead of "near me"
- `apps/mobile/src/hooks/useReservation.ts` — live reservation + occupancy, realtime channel on `reservations` UPDATE and `reservation_players` INSERT/DELETE

## Files Modified This Phase

- `apps/mobile/src/lib/supabase/reservations.ts` — added `fetchReservationPlayersWithProfiles()` (joined roster with names/avatars) and exported `parseTstzrange()` for My Bookings' date bucketing
- `apps/mobile/src/lib/supabase/facilities.ts` — `fetchFacilities()` gained `bookableOnly` (separate from the pre-existing `publicOnly`) and expanded its text-search `.or()` to match name/city/state/postal_code/address instead of name only
- `apps/mobile/src/app/facility/[id].tsx` — "Book a Court" section's "Choose Time" CTA now navigates for real (was guarded with a "Coming Soon" alert earlier this phase, before `choose-time.tsx` existed)
- `apps/mobile/src/constants/quickActions.ts` — added the "My Bookings" quick action
- `apps/mobile/src/app/_layout.tsx` — registered all seven new `booking/*` routes

## Database Changes

- `supabase/migrations/20260810000000_booking_search_bookable_and_zip.sql` — see Summary above. Applied via `apply_migration`.

---

## Reused Architecture (per the audit's "do not duplicate" findings)

- **Occupancy math and copy** — `playersNeeded`/`projectedOccupancy`/`occupancyCompletionState`/`occupancyStatusLabel`/`occupancyCountLabel` in `reservations.ts` are the single source for every "Need N More Players"/"Game Complete" string across Choose Time, Players, Review, Confirmation, My Bookings, and Game Status — none of those six screens re-derive this text independently.
- **Invite UI** — `players.tsx`'s Friends/Search tabs are the same row/list component pattern as `community/[id]/invite-players.tsx`, not a rebuild.
- **Directions** — `confirmation.tsx` and `game-status.tsx` both call the identical Apple-Maps-then-Google-Maps-fallback `Linking` pattern already in `facility/[id].tsx`.
- **"Coming Soon" guard pattern** — used consistently at every boundary that isn't built yet (this phase, that meant the Choose Time CTA before `choose-time.tsx` existed, then Players' Continue before `review.tsx` existed, then Confirmation's View Game Status before `game-status.tsx` existed — each guard was removed the moment its real destination shipped). The same pattern remains on `booking/results.tsx`'s Filters/Sort buttons, which are still out of scope.
- **Realtime channel shape** — `useReservation.ts`'s channel-per-mount, `postgres_changes`, `removeChannel`-on-cleanup pattern mirrors `useUnreadCounts.ts` exactly, per its own header comment.
- **Payment boundary isolation** — `reservationPayment.ts` stays a separate file from `reservations.ts` specifically so "payment is a distinct layer" is visible in the file tree; `review.tsx` calls only `confirmReservation()`, never `supabase.rpc('confirm_reservation', ...)` inline.
- **Add to Calendar was deliberately not built** — no calendar package (`expo-calendar` or equivalent) exists anywhere in the app. Rather than fake a dead button, the action was omitted from Confirmation entirely.

---

## Tests Performed

**Static analysis**, every session this phase: `npx tsc --noEmit -p tsconfig.json` and `npx eslint` on every touched file — **0 errors** at each checkpoint. One transient issue: `.expo/types/router.d.ts` (Expo Router's auto-generated route-typing file, gitignored) was found mid-write/corrupted once after adding several route files in quick succession; deleting it and touching a route file to force Metro to regenerate it resolved this — not a source-code issue.

**Live app**, driven headless via Playwright against the actual running Expo web dev server (`localhost:8081`, pointed at the real `fbzetvkbhneptvfruilw` project):
- Search → Results → Facility Detail confirmed working against the seeded Lakewood Ranch Athletic Club facility, including the `bookable_by_public` fix (a facility matching by name/city but `bookable_by_public = false` is correctly excluded from results; a facility not matching by name but matching by city now correctly appears).
- Choose Time & Court: verified all four non-trivial occupancy states against real seeded reservations — **1/4** ("Need 3 More Players"), **2/4 with an active Flash Deal** ("Need 2 More Players", $18→$14), **3/4** ("Need One Player"), **4/4** ("Game Complete", not tappable) — plus the 0/4 "Starting New Game" case on every other open slot. A real bug was caught and fixed here: the default selected hour raced the real `operating_hours` fetch and locked onto a fallback range before the facility's actual opening hour loaded.
- Choose Time's "Choose Time" CTA on the facility page was confirmed to previously 404 on `/booking/choose-time` (an Unmatched Route) before the screen existed, and confirmed fixed once it did.
- Routes for `players`, `review`, `confirmation`, `my-bookings`, `game-status` all confirmed to resolve correctly (render their own empty/error states) rather than hit Expo Router's Unmatched Route screen, both before and after their real destinations existed.

**RPC/data-layer verification** (this session's browser has no authenticated test session — no credentials were available in this non-interactive environment — so every write-path test below was run by impersonating a real seeded profile via `SET LOCAL request.jwt.claims` + `SET LOCAL role authenticated`, calling the exact RPCs the client calls, matching the technique Phase 1's own report used for its RLS tests):
- **`create_reservation()` → `confirmReservation()` (hold→confirmed)**: created a fresh held reservation, confirmed it, verified `status` flipped in place with `confirmed_at` set and `hold_expires_at` cleared. Confirmed **no duplicate row** — reservation count was 4 before, 5 after creating the one test row, still exactly 1 row matching that id after confirming. Re-confirming the same reservation correctly threw `reservation_not_held`, matching `review.tsx`'s client-side guard against double-confirming.
- **Cancellation**: `cancel_reservation()` correctly flips a held/confirmed reservation to `cancelled` with `cancelled_at` set — exercised on a temporary reservation, matching `game-status.tsx`'s Cancel action exactly.
- **Ball machine reservation**: created and confirmed one (`game_format: null`, `max_players: 1`) — confirms the `isBallMachine` branches in `review.tsx`/`confirmation.tsx`/`game-status.tsx` have real data to render against (no player-filling UI, no game format row).
- **Invite → accept → occupancy**: sent an invite (pending, occupancy unchanged at 1/4), accepted it via `accept_reservation_invite()` as the invitee (occupancy correctly became 2/4), then reverted.
- **Over-capacity rejection**: attempting to join the already-4/4 Court A game correctly threw `reservation_full` — the exact code `choose-time.tsx`/`players.tsx` map to a friendly message.
- **Realtime, the mechanism `useReservation()` depends on**: subscribed a plain client (same channel/filter shape as the hook) to a fresh reservation's `reservations` UPDATE event, then confirmed it server-side — **the event was delivered live within seconds**, with the full updated row (`status: confirmed`, `confirmed_at` set, `hold_expires_at` cleared). This is the single most important live-update case for Game Status (status badge, Cancel button visibility) and it's proven to work end-to-end.
- **One real, non-bug finding from the realtime test**: an *unauthenticated* subscriber never receives `reservation_players` INSERT/DELETE events, because that table has no public-read RLS policy — only the organizer, a fellow player, or facility staff can read it, by design (the migration's own comment: roster identity is deliberately not exposed any other way). This means live roster updates in `game-status.tsx` work correctly for the reservation's actual organizer/players once authenticated — which is the only audience that screen is ever shown to — but was not directly observable in this session's unauthenticated test browser. Flagging this so a future session doesn't mistake it for a bug, and doesn't assume it was visually confirmed in-app when it was proven at the RPC/realtime-client layer instead.
- All temporary test reservations, invites, and joins were deleted/reverted after verification — the documented seed set (4 reservations on Court A/B/C/D: 4/4, 1/4, 2/4-with-Flash-Deal, 3/4) is unchanged.

---

## Known Limitations

1. **No authenticated browser session in this environment.** Every screen was verified either via direct Playwright navigation (confirms rendering, routing, and empty/error states) or via RPC-level impersonation (confirms server-side correctness of the exact calls each screen makes) — never both at once for the same action. A live tap-through of "pick a slot → see the success panel → invite a friend → confirm → see Confirmation → cancel from Game Status" has not been visually observed in one continuous session. Recommend a device/EAS-build QA pass with a real signed-in account before this ships.
2. **`review.tsx`'s payment step is a stub by design**, per this phase's explicit scope — it calls `confirm_reservation()` directly with no PaymentIntent, no Apple Pay/Google Pay, no charge. Building real payment capture is explicitly the next phase, not started here.
3. **No Facility Admin UI still.** Courts, ball machines, operating hours, and Flash Deals all still require direct SQL to create (as this and prior sessions' seeding did) — there is no in-app screen for a facility owner/manager to manage their own inventory. This was flagged as a gap in Phase 1 and remains one.
4. **`my-bookings.tsx`'s facility/asset-name enrichment is N ad hoc `.in()` queries**, not a single joined query — fine at seed-data scale, worth revisiting if a user's booking history grows large.
5. **Add to Calendar is not implemented** (see Reused Architecture) — flag to product/eng if this is expected before broader beta.
6. **The entire `apps/mobile` tree remains untracked in git.** Not a Booking Engine issue specifically, but it is the single biggest risk to everything in this report — see the note at the top.

---

## Phase 3 Readiness

Everything a real payment phase needs already exists as a clean seam: `reservationPayment.ts` is the one file to change (add PaymentIntent creation/confirmation before or wrapping the `confirm_reservation()` call), `review.tsx` is the one screen that calls it, and no other screen touches payment at all. QR check-in and push notifications are similarly additive — `game-status.tsx` already has the reservation/roster data a check-in screen would need, and the notification dispatch pattern (`waitlist-sweeper`'s idempotent `notify()` helper) was already identified as reusable in the original audit and untouched by this phase.
