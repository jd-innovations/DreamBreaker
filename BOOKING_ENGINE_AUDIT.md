# BOOKING_ENGINE_AUDIT.md

> Status: Complete — Audit Only (no implementation)
> Source of truth: [TODO1.1.md](TODO1.1.md) (`BOOKING_ENGINE_V1_SPEC.md`)
> Repo state audited: branch `feature/expo-mobile-foundation`, commit `94892eb`, 2026-08-08
> Scope: `apps/mobile` (Expo/React Native, primary), `web` (Next.js, director console), `supabase` (schema baseline `20260725000000_baseline_from_prod.sql` + migrations through `20260807050000_marketplace.sql`)

This document audits what exists today against every objective in the Booking Engine V1 spec. **No code, migrations, or files other than this one were created or modified.** Findings are backed by exact file paths, table names, and line numbers gathered via direct inspection of the repository.

---

## How to read this

Every area below is scored:

- **REUSE AS-IS** — directly usable, no changes needed
- **EXTEND** — real functionality exists but needs new columns/props/branches
- **NEW** — must be built from scratch, nothing analogous exists
- **DEFER** — exists in a form that looks related but should *not* be reused (wrong shape/owner/lifecycle)
- **RISK** — using or not using this creates a hazard that needs a decision before implementation

---

## 1. Navigation — **EXTEND**

- Expo Router file-based routing. Tab shell: [apps/mobile/src/app/(tabs)/_layout.tsx](apps/mobile/src/app/(tabs)/_layout.tsx) (tabs: index, landing, finder, nearby, games, marketplace, tournaments, chat, partner, profile, stats). Root stack modals: [apps/mobile/src/app/_layout.tsx](apps/mobile/src/app/_layout.tsx) already defines `presentation: 'modal'` / `'fullScreenModal'` route options — the mechanism for a booking review/payment modal already exists, just needs new route entries.
- Only one facility route exists today: [apps/mobile/src/app/facility/[id].tsx](apps/mobile/src/app/facility/[id].tsx) (529 lines) — a detail screen only. **No `facility/` list/search route, no `booking/`, `court/`, or `reserve*` route group exists anywhere.**
- Bottom-sheet pattern: [apps/mobile/src/components/sheets/DraggableSheet.tsx](apps/mobile/src/components/sheets/DraggableSheet.tsx) — hand-rolled 3-snap-point sheet (no `@gorhom/bottom-sheet` dependency), already used for marketplace filters and the `nearby.tsx` facility bottom sheet. This is the pattern a "Choose Time & Court" or "Flash Deal" sheet should reuse.
- Other reusable sheet/modal components: [AttachmentOptionsSheet.tsx](apps/mobile/src/components/AttachmentOptionsSheet.tsx), [ManageEventSheet.tsx](apps/mobile/src/components/ManageEventSheet.tsx), [support/SupportSheet.tsx](apps/mobile/src/components/support/SupportSheet.tsx), [wallet/WalletRedeemSheet.tsx](apps/mobile/src/components/wallet/WalletRedeemSheet.tsx), [FindGamesFilterModal.tsx](apps/mobile/src/components/FindGamesFilterModal.tsx).

**Gap:** Screens 1–11 of the player flow and all Facility screens (Dashboard, Court Management, Ball Machine Management, Calendar, Flash Deals, Check-In) require new route groups. Recommend `app/booking/` for the player flow and `app/facility-admin/` (or similar) for the facility-management flow, kept separate from the existing single `facility/[id].tsx` public detail screen.

---

## 2. Authentication / Users — **EXTEND (with a required decision)**

- `profiles.role` is a `user_role` enum: `'player' | 'director' | 'player_director' | 'admin'` (baseline schema, `CREATE TYPE` ~line 207; column ~line 4206).
- A parallel, more granular **director** sub-state machine already exists on `profiles`: `is_director boolean`, `director_status` enum (`pending`/`approved`/`suspended`), `director_approved_at`, `director_approved_by`, `director_rating`, `director_events_hosted`. Authorization checks combine both, e.g. `(role = 'director' OR is_director = true) AND director_status = 'approved'` (baseline ~lines 1731-1732, 1762-1763, 2009-2010).
- Reusable SQL helper functions: `is_admin()` (baseline ~1994), `current_user_is_director()` / `current_user_director_status()` (~871-888), `apply_to_be_director()` (~375).
- **No facility-level or court-level role/membership table exists anywhere.** The only per-facility ownership concept is `facilities.owner_user_id` + `facilities.claim_status` (`unclaimed`/`pending`/`claimed`) — single owner, no multi-user roles. Confirmed by direct grep: no `facility_members`, `facility_staff`, or `facility_owner` string appears in any migration.

**Recommended pattern (matches the spec's explicit constraint "No new authentication role shall be introduced" and "Facilities are organizations, not users"):** Do **not** touch `profiles.role`. Add a new junction table `facility_members (facility_id, user_id, role text CHECK (role IN ('owner','manager','staff')), created_at)`, mirroring the exact shape of `group_members` (see below) and `conversation_participants` (`role text DEFAULT 'member'` CHECK pattern, baseline ~3451). This is additive and requires zero changes to the global auth role enum.
- Closest existing analog for a membership-with-roles table: `public.group_members` (baseline, referenced by [groupService.ts](apps/mobile/src/lib/groupService.ts)) — owner/admin/member roles per group, join/leave, approval flow. **This is the template to copy for `facility_members`, not implement from scratch.**

---

## 3. Facilities — **EXTEND**

### Database (`public.facilities`, baseline ~lines 3609-3676)
Already has: `id, name, slug, address, city, state, postal_code, latitude, longitude, coords (PostGIS geography, auto-synced via trigger fn_sync_facility_coords), phone, website, description, court_count, indoor_courts, outdoor_courts, surface_type, lighting, restrooms, water, parking, public_access, membership_required, bookable_by_public, claim_status, owner_user_id, verified, google_place_id, data_source, google_maps_uri, facility_type, address_line_2, country, source_url, pro_shop, lessons_available, open_play_available, reservation_required, booking_url, fee_type, typical_fee, hours_summary (free text), skill_levels[], amenities[], tags[], status, data_confidence, price_level, wheelchair_accessible, google_rating, google_rating_count, google_types[], business_status`.

This is a **very rich, mostly REUSE AS-IS** table for the spec's "Facility Information / Amenities" requirements. Notably `bookable_by_public boolean` already exists — a flag the Booking Engine can filter on immediately.

- `public.facility_photos` (baseline ~3722-3730): `facility_id, url, is_primary, uploaded_by, created_at, google_photo_name`. REUSE AS-IS for hero images / photo galleries.
- 110 curated facilities + 93 photos already seeded via [supabase/migrations/20260805214123_facilities_csv_import.sql](supabase/migrations/20260805214123_facilities_csv_import.sql) — real inventory to search over exists today, not a cold start.
- Service layer: [apps/mobile/src/lib/supabase/facilities.ts](apps/mobile/src/lib/supabase/facilities.ts) (371 lines) — `fetchFacilities(params)`, `fetchFacilityById`, `fetchFacilityPlayEvents`, `fetchFacilityTournaments`, `suggestFacility()`/`claimFacility()`, `fetchFacilityPhotos`/`addFacilityPhoto`. REUSE AS-IS for Screen 2/3 data fetching; will need a new booking-availability query added.
- UI: [FacilityCard.tsx](apps/mobile/src/components/FacilityCard.tsx), [FacilityPicker.tsx](apps/mobile/src/components/FacilityPicker.tsx) — REUSE for Screen 2 search-results cards (extend with Flash Deal badge / starting price / court+machine counts, which aren't in the card today).
- **Hours**: only `hours_summary text` (human-readable free text) exists — **no structured open/close hours table**. This is a real gap for driving actual bookable time slots (see §19 Gaps).
- **Location/Maps**: [apps/mobile/src/lib/location.ts](apps/mobile/src/lib/location.ts) — `useCurrentLocation()` (expo-location, foreground permission, GPS + fallback coordinate). Reverse geocoding lives separately in [location-settings.tsx:176-194](apps/mobile/src/app/location-settings.tsx). Distance calculation (haversine) is **duplicated** in [useFinderCandidates.ts:57-63](apps/mobile/src/lib/useFinderCandidates.ts) and [(tabs)/marketplace.tsx:30-35](apps/mobile/src/app/(tabs)/marketplace.tsx) — no shared util. **No Google Places autocomplete integration anywhere** — only `react-native-maps` (`PROVIDER_GOOGLE` for tiles) via [ExploreMap.tsx](apps/mobile/src/components/ExploreMap.tsx) / [VenueMapCard.tsx](apps/mobile/src/components/VenueMapCard.tsx).
- **Weather**: an edge function `event-weather` exists in `supabase/functions/` — REUSE AS-IS candidate for Screen 3's Weather block; not inspected in depth but confirms weather integration already exists in some form.

### Facility images
[apps/mobile/src/lib/media/imageStandards.ts](apps/mobile/src/lib/media/imageStandards.ts) already defines a `facility` category (`implemented: false`, bucket currently pointed at the shared `group-photos` bucket, no dedicated facility bucket exists in storage yet per [supabase/migrations/20260725000002_storage_companion.sql](supabase/migrations/20260725000002_storage_companion.sql)). Per [[project_image_pipeline]] memory: only the `avatar` category is production-implemented; `marketplace` was implemented 2026-08-07. **Facility image upload must go through the existing `ImagePipeline` ([apps/mobile/src/lib/media/index.ts](apps/mobile/src/lib/media/index.ts)) — do not hand-roll a new upload path.** Turning on the `facility` category (dedicated bucket + `implemented: true`) is a small, well-defined extension, not new architecture.

---

## 4. Courts — **NEW (with a strong existing analog to avoid copying)**

- `public.court_assignments` (baseline ~3487-3501) is **strictly tournament-specific**: `tournament_id NOT NULL`, `match_id`, `court_number`, `status`, `player_a`/`player_b` (denormalized text, not FKs), `round_label`, scores. It is a live-scoreboard table for an in-progress bracket, not a reservation table — **no start/end time, no facility_id, no reserving user_id.** RLS: `court_assignments_public_read` is fully open (`USING (true)`), `court_assignments_director_write` gates writes to the tournament's director.
- `facilities.court_count` / `indoor_courts` / `outdoor_courts` are integer tallies only — **there is no row-per-court table anywhere.** A facility today cannot enumerate its individual courts, name them, or set independent hourly rates/hours per court.
- **No generic asset/resource reservation concept exists in the schema at all** — confirmed by exhaustive grep across every migration for `court`, `booking`, `reservation`, `time_slot`, `resource_hold`: zero hits outside `court_assignments` and free-text email copy.

**Verdict: Court Management (create/edit/delete court, hourly rate, hours, amenities, photos, availability) and the underlying reservation engine (Reservation, Reservation Hold, Availability, Reservation Rules) are entirely new domain objects.** Do not attempt to extend `court_assignments` — its shape (tournament-only, denormalized players, no time-slot fields) is fundamentally the wrong model. Building the Reservation Engine as a new set of tables (`booking_assets`, `reservations`, `availability`) is correct per the spec itself ("Reservable Asset... Future asset types will reuse the same reservation engine").

---

## 5. Ball Machines — **NEW**

Confirmed: no ball-machine-related table, type, service, or screen exists anywhere in the codebase. This is a new domain object, as the spec anticipates. It should be modeled as a second row-type under the same `booking_assets`/reservation engine as Courts (per spec: "V1 supports only two asset types... Future asset types will reuse the same reservation engine"), **not** as a separate bespoke table/screen pair.

---

## 6. Community Play — **DEFER (do not force booking logic into this architecture)**

Two parallel layers exist:

**A. In-memory mock stores** (module-level `let`, reset on reload, no persistence): [quickGameStore.ts](apps/mobile/src/lib/quickGameStore.ts), [quickGameRosterStore.ts](apps/mobile/src/lib/quickGameRosterStore.ts), [roundRobinStore.ts](apps/mobile/src/lib/roundRobinStore.ts), [rrRosterStore.ts](apps/mobile/src/lib/rrRosterStore.ts), [rrScheduleStore.ts](apps/mobile/src/lib/rrScheduleStore.ts), [rrStandings.ts](apps/mobile/src/lib/rrStandings.ts), [miniTournamentStore.ts](apps/mobile/src/lib/miniTournamentStore.ts), [bracketStore.ts](apps/mobile/src/lib/bracketStore.ts). **Not persisted — not usable as a data layer for Booking Engine.**

**B. Real Supabase-backed services**, operating on `play_events` / `play_participants` / `play_matches`: [lib/supabase/roundRobin.ts](apps/mobile/src/lib/supabase/roundRobin.ts), [lib/supabase/miniTournament.ts](apps/mobile/src/lib/supabase/miniTournament.ts), [lib/supabase/matches.ts](apps/mobile/src/lib/supabase/matches.ts).

Schema: `play_events` has `max_players`, `format`, `event_date`+`start_time`+`duration_minutes` (no explicit `end_time`), optional `facility_id` (soft link — comment in schema explicitly says "location/venue_name remain the primary free-text fields," i.e. facility linkage is deliberately not load-bearing today). `play_participants` capacity is enforced by the **`join_play_event()` SQL RPC** (baseline ~2165-2222): row-locks the event `FOR UPDATE`, checks `status='open'`, counts against `max_players`, blocks duplicate email. **This RPC is the single best transaction-safe capacity-enforcement pattern in the codebase and should be the template for `join_reservation()` / court-slot capacity logic** — not reused directly (wrong table), but copied in structure (lock row, check state, check capacity, insert, named exceptions).

**Why this is DEFER, not REUSE/EXTEND:** `play_events` models a single event happening at one place with N total attendees and no per-court reservation concept; a booking is a *paid, time-boxed reservation of one specific physical asset* with hold/expiry/conflict-prevention semantics `play_events` was never built for (no payment columns, no hold-expiry, no overlap constraint, no per-asset FK). Forcing Booking Engine reservations into `play_events` would conflate two different lifecycles (social RSVP vs. paid asset reservation) and risk breaking existing Community Play RLS/queries. The spec's own occupancy examples ("2/4 → Game Complete") **do** map cleanly onto reusing the *display/UI pattern* from Community Play (see below) even though the underlying reservation record must be new.

**What IS reusable from Community Play, as UI/logic patterns (not tables):**
- Occupancy/capacity display strings: [gameEventHelpers.ts:49-52](apps/mobile/src/lib/gameEventHelpers.ts) already formats `"{currentPlayers} / {playersNeeded} Players"`.
- "Looking for N More Players" pattern: [quick-game-created.tsx:353,681-691](apps/mobile/src/app/quick-game-created.tsx), [round-robin-created.tsx:508,728](apps/mobile/src/app/round-robin-created.tsx), [mini-tournament-created.tsx:659,664](apps/mobile/src/app/mini-tournament-created.tsx) — directly analogous to Screen 4's "Need One Player" / "Need Two Players" states.
- "Spots left" pill / progress UI: [round-robin/[id]/roster.tsx:747,799](apps/mobile/src/app/round-robin/[id]/roster.tsx), [community/[id].tsx:967,1168](apps/mobile/src/app/community/[id].tsx).
- Guest-player pattern for "invited but unclaimed" players: `play_participants.claimed_by` (nullable — a row exists with a name/email before the person has an account) is a good precedent for how a booking reservation could hold a "need players" seat.

Recommend: build a **new** `booking_reservation_players` (or similar) table with its own capacity RPC modeled on `join_play_event()`, and reuse the *display components/strings* from Community Play screens rather than the underlying stores.

---

## 7. Partner Finder / Social — **EXTEND**

- [partnerLikes.ts](apps/mobile/src/lib/partnerLikes.ts) — real, Supabase-backed (`partner_likes`, `partner_matches` tables). REUSE AS-IS as an *invite-a-specific-person* channel.
- [connectionStore.ts](apps/mobile/src/lib/connectionStore.ts) — **in-memory mock only**, seeded with hardcoded people. DEFER — do not build on this.
- [useFinderCandidates.ts](apps/mobile/src/lib/useFinderCandidates.ts) — real candidate-discovery hook with haversine distance filtering. REUSE for "Invite Friends" nearby-player suggestions.
- Note: baseline schema also has a `matchmaking_swipes` table with a `v_mutual_matches` view that appears to be a newer/parallel implementation to `partner_likes`/`partner_matches` — **flag for product decision** (§ Items Requiring Product Decision) rather than assuming which is canonical before building "Invite Friends."
- **Verdict for "Help Me Find Players" / "Need N more players":** the existing `community/[id]/invite-players.tsx` screen + `play_event_invites` table (pending/accepted/declined/cancelled, no-self-invite CHECK) is the closest full pattern (invite a specific known contact to fill an open slot) and should be extended with a `related_reservation_id`-style column rather than rebuilt.

---

## 8. Messaging — **EXTEND**

- `conversations` table already supports **contextual, non-1:1 threads**: `conversation_type` CHECK enum (`direct|play_event|tournament|team|group|announcement`), `related_play_event_id`, `related_tournament_id`, backed by a `conversation_participants` join table with `role` (owner/admin/member). REUSE AS-IS pattern: add `'booking'` (or `'reservation'`) to the `conversation_type` CHECK and a `related_reservation_id` column — mirrors exactly how `group` (`groupService.ts:117`) and `support` (`supportTicketService.ts:54`) conversation types were added.
- Reusable "get-or-create scoped conversation" pattern already exists: `getOrCreatePlayEventConversation()` / `getOrCreateTournamentConversation()` in [conversationService.ts](apps/mobile/src/lib/conversationService.ts) — same shape needed for a booking/game chat.
- Unread counts: [useUnreadCounts.ts](apps/mobile/src/hooks/useUnreadCounts.ts) — REUSE AS-IS, already generic across `messages`/`notifications`.
- **RISK:** the **web** messaging panel ([web/src/components/messaging/panel.tsx](web/src/components/messaging/panel.tsx), 858 lines) only models `participant_a`/`participant_b` direct conversations — it has **no `conversation_type` awareness**. If Booking Engine chat needs to surface on the facility-management web console, the web panel needs a parallel extension or booking chat will be mobile-only.

---

## 9. Payments — **NEW (Stripe Connect payout plumbing is the only reusable piece)**

- **What's production-ready:** Stripe Connect **onboarding only**, web-side: [web/src/lib/stripe.ts](web/src/lib/stripe.ts) (singleton client), [web/src/app/api/stripe/connect/start/route.ts](web/src/app/api/stripe/connect/start/route.ts) (creates Express connected account, generates onboarding link), [web/src/app/api/stripe/connect/return/route.ts](web/src/app/api/stripe/connect/return/route.ts) (stamps `stripe_connect_onboarded_at` when `charges_enabled && details_submitted`), [web/src/app/api/stripe/webhooks/route.ts](web/src/app/api/stripe/webhooks/route.ts) (verifies signature, handles **only** `account.updated`). DB: `profiles.stripe_connect_account_id`, `profiles.stripe_connect_onboarded_at`. **This is exactly the payout-destination mechanism a Facility Owner needs to receive reservation payments** — REUSE AS-IS for facility payout setup.
- **What's incomplete/absent:** **No `payment_intent.*`, `checkout.session.*`, or `charge.refunded` webhook handling exists anywhere.** No payment-intent creation code. No checkout flow. No Stripe SDK usage on mobile at all — [payments-settings.tsx](apps/mobile/src/app/payments-settings.tsx) is a static mock UI with hardcoded card art and local-only toggles, not wired to any backend.
- `transactions` table (`registration_id, player_id, tournament_id, type, amount_cents, stripe_id (unique), status, failure_reason`) is **tightly coupled to tournament registrations** (no `facility_id`/`booking_id` column) — cannot be reused as-is; needs either a nullable `booking_id` column + relaxed FK coupling, or a parallel table.
- `registrations` table's hold pattern (`stripe_hold_intent_id`, `stripe_entry_intent_id`, `status` enum including `held`) is the closest existing precedent for the spec's "Reservation Hold" concept — **copy the pattern, don't reuse the table** (registrations is tournament-specific).
- Marketplace (built 2026-08-07, [[project_marketplace_v1]]) has **zero payment integration** — `offers.ts` just opens a chat conversation with a canned offer message; do not treat marketplace as a payment analog.

**Verdict:** the entire Reserve→Pay flow (payment intent creation, Apple Pay/Google Pay/card capture, reservation hold-then-capture, webhook-driven confirmation, refunds/cancellations) must be built new on both mobile and the reservation-hold DB layer. Only the Connect *payout* side is reusable.

---

## 10. Calendar — **NEW**

No `expo-calendar` package in `apps/mobile/package.json`. No "add to calendar" feature anywhere. No date/time utility library installed (no dayjs/date-fns/luxon/moment) and no shared `lib/date*.ts`/`time*.ts`/`timezone*.ts` file — every screen (`create-mini-tournament.tsx`, `create-round-robin.tsx`, `director/create-tournament.tsx`) uses `@react-native-community/datetimepicker` directly and handles Date objects locally. [director/create-tournament.tsx:~348](apps/mobile/src/app/director/create-tournament.tsx) has an inline comment noting a timezone-related date-shift bug worked around ad hoc — **RISK**: there is no shared timezone-safe date utility to build the booking time-slot picker on top of; expect the same class of bug to recur unless a shared util is introduced.

---

## 11. Notifications — **EXTEND**

- Client-side push registration is **not implemented**: [enable-notifications.tsx](apps/mobile/src/app/onboarding/enable-notifications.tsx) and [notifications-settings.tsx](apps/mobile/src/app/notifications-settings.tsx) are local-state-only toggle UIs; no `expo-notifications` calls, no token registration found in `apps/mobile/src/lib`. `push_tokens` table exists in the DB (baseline ~4313) but its own schema comment notes client registration "not yet built" as of baseline.
- **Idempotent notification pattern already exists and is directly reusable**: `supabase/functions/waitlist-sweeper/index.ts`'s `notify()` helper takes an `idempotencyKey` (e.g. `` `hold-expired/${reg.id}` ``), inserts into `notifications` (which has an `idempotency_key` column), and optionally emails via `send-transactional-email`. **REUSE AS-IS as the template for** booking confirmation / reminder / cancellation / player-joined / game-full / flash-deal notifications — just needs new call sites with booking-specific idempotency keys.
- `supabase/functions/send-message-push/index.ts` — dumb relay to Expo push API; REUSE AS-IS as the delivery mechanism once token registration is built.
- **Gap requiring product/eng decision**: push token registration on the client must be built before any booking push notification can actually reach a device — this is a prerequisite, not a Booking Engine feature per se, but Booking Engine's notification requirements depend on it.

---

## 12. QR / Check-In — **NEW (QR) / EXTEND (check-in concept)**

- **No QR/barcode code exists anywhere** — no QR-generation or camera-scanning package in `package.json`, no scanner/generator files. This is entirely new.
- Check-in **does** exist, but manual/list-based, tournament-only: [tournament/[id]/check-in.tsx](apps/mobile/src/app/tournament/[id]/check-in.tsx) + [lib/supabase/registrations.ts](apps/mobile/src/lib/supabase/registrations.ts) `checkInPlayer()`/`undoCheckIn()`, backed by `registrations.checked_in_at`/`checked_in_by` columns. This is a good reference for the *state machine* (checked_in status + timestamp + who-checked-in) but there is no QR code involved and no community-play/facility check-in exists at all.
- **Verdict:** the check-in *status model* is reusable in shape; the actual QR generation/scanning UI and library integration must be built new (e.g. `react-native-qrcode-svg` for generation + `expo-camera`/`expo-barcode-scanner` for scanning — neither installed today).

---

## 13. Flash Deals — **NEW**

No discount/coupon/promo pricing calculation exists in application code anywhere. `wallet_items`/`wallet_activity`/`wallet_partners` (baseline ~4571-4662) and [lib/supabase/wallet.ts](apps/mobile/src/lib/supabase/wallet.ts) are **read-only display logic for a partner-rewards wallet** — redemption happens on an **external partner site** via [WalletRedeemSheet.tsx](apps/mobile/src/components/wallet/WalletRedeemSheet.tsx) ("You'll be taken to [partner]... discount applied at checkout"), not computed in-app. No `applyDiscount()`/`calculateDiscountedPrice()` function exists anywhere in the codebase. Flash Deals pricing math (asset + date range + discount % → preview price) must be built from scratch; the `wallet_items` schema/UI can serve only as a distant visual reference for "offer" cards, not as pricing logic to extend.

---

## 14. Image Pipeline — **REUSE AS-IS (mechanism) / EXTEND (facility category)**

Per [MEDIA_DEVELOPMENT_STANDARD.md](MEDIA_DEVELOPMENT_STANDARD.md) and [[project_image_pipeline]]: all uploads must go through `ImagePipeline` ([apps/mobile/src/lib/media/](apps/mobile/src/lib/media/) — `imagePipeline.ts` orchestrator, `imageStandards.ts` single source of truth per category, `steps/validate.ts` / `steps/transform.ts` / `steps/upload.ts`). Never upload directly to Supabase Storage; never hardcode buckets; never compress in-screen.

- `avatar` category: `implemented: true` (production). `marketplace`: `implemented: true` (shipped 2026-08-07). `facility`: `implemented: false` — currently points at the shared `group-photos` bucket as a placeholder, no dedicated `facility` storage bucket row exists yet in [20260725000002_storage_companion.sql](supabase/migrations/20260725000002_storage_companion.sql).
- **REUSE AS-IS the pipeline mechanism.** **EXTEND**: flip `facility.implemented` to `true`, add a dedicated `facility` storage bucket (folder-per-facility policy, mirroring the marketplace bucket's folder-per-user RLS pattern added in [20260807050000_marketplace.sql](supabase/migrations/20260807050000_marketplace.sql)), and add a new `court`/`asset` image category for court/ball-machine photos (spec requires "Photos" field on Court Management).

---

## 15. Design System — **REUSE AS-IS**

- Tokens: [apps/mobile/src/theme/spacing.ts](apps/mobile/src/theme/spacing.ts) (4pt scale), [radius.ts](apps/mobile/src/theme/radius.ts) (button 14 / card 16 / chip 20), [typography.ts](apps/mobile/src/theme/typography.ts), documented in [DESIGN_TOKENS.md](DESIGN_TOKENS.md).
- Primitives available: [PrimaryButton.tsx](apps/mobile/src/components/PrimaryButton.tsx)/[SecondaryButton.tsx](apps/mobile/src/components/SecondaryButton.tsx), [SectionCard.tsx](apps/mobile/src/components/SectionCard.tsx)/[FacilityCard.tsx](apps/mobile/src/components/FacilityCard.tsx), [StatusChip.tsx](apps/mobile/src/components/StatusChip.tsx)/[ReactionPills.tsx](apps/mobile/src/components/ReactionPills.tsx), [FindGamesFilterModal.tsx](apps/mobile/src/components/FindGamesFilterModal.tsx)/[FacilityPicker.tsx](apps/mobile/src/components/FacilityPicker.tsx), [SettingsRow.tsx](apps/mobile/src/components/SettingsRow.tsx), maps ([ExploreMap.tsx](apps/mobile/src/components/ExploreMap.tsx), [VenueMapCard.tsx](apps/mobile/src/components/VenueMapCard.tsx)), sheets (§1).
- **RISK — flagged, not blocking:** two parallel color systems exist — `apps/mobile/src/theme/colors.ts` (canonical, light-mode only) and `apps/mobile/src/constants/Colors.ts` (a separate dark-themed `C` export). **No explicit light/dark mode switching logic was found in either** — both are static single-palette exports. The spec requires "Support Light Mode / Support Dark Mode," which is **not currently true of the design system as a whole**, not just Booking Engine. This should be flagged to the team before Booking Engine screens are built to that requirement, since Booking Engine cannot deliver dark mode support that the base design system doesn't yet provide.
- Empty/loading/skeleton states exist only inside the wallet feature ([WalletEmptyState.tsx](apps/mobile/src/components/wallet/WalletEmptyState.tsx), [WalletSkeleton.tsx](apps/mobile/src/components/wallet/WalletSkeleton.tsx)) — no app-wide generic empty/loading primitive exists; Booking Engine will either reuse the wallet ones directly or (if renamed generically) promote them to shared components — flag as a minor product/eng decision, not a blocker.

---

## 16. Existing Services / Hooks / Utilities — **REUSE AS-IS**

Directly reusable without modification: [lib/supabase/facilities.ts](apps/mobile/src/lib/supabase/facilities.ts), [lib/location.ts](apps/mobile/src/lib/location.ts) (`useCurrentLocation`), [hooks/useUnreadCounts.ts](apps/mobile/src/hooks/useUnreadCounts.ts), [lib/conversationService.ts](apps/mobile/src/lib/conversationService.ts), [lib/partnerLikes.ts](apps/mobile/src/lib/partnerLikes.ts), [lib/useFinderCandidates.ts](apps/mobile/src/lib/useFinderCandidates.ts), [lib/media/](apps/mobile/src/lib/media/) (ImagePipeline), [lib/marketplace/constants.ts](apps/mobile/src/lib/marketplace/constants.ts) (`formatPriceCents` — directly reusable for booking price formatting).

**Gap:** no shared distance/haversine utility (duplicated in 2+ places — worth consolidating, low risk, small effort), no shared date/timezone utility (§10, higher risk).

---

## 17. Database (summary — see §2–13 above for detail) — **Mixed**

The current schema is comprehensive for social/tournament/community features but has **zero** tables for: per-court inventory, ball machines, time-slot reservations, reservation holds, availability windows, discounts/flash-deal pricing, or facility membership/roles. RLS conventions worth copying exactly: public-read + owner/admin-write policy triples (see `facilities`, `marketplace_listings`), `SECURITY DEFINER` helper functions for ownership checks (`is_admin()`, `is_listing_owner()` — copy this pattern for a future `is_facility_member()`), and `FOR UPDATE` row-locking inside SECURITY DEFINER RPCs for capacity-safe writes (`join_play_event()`).

---

## 18. Facility Membership Model — **NEW TABLE, NO NEW AUTH ROLE (feasible)**

Directly evaluated per the spec's explicit instruction: **the existing architecture can support `facilities → facility_members → OWNER/MANAGER/STAFF` without any new global authentication role.**

- `facilities.owner_user_id` + `claim_status` already models a *single* owner — this becomes the seed row of `facility_members` (the claiming user becomes the first `owner` row) rather than being replaced.
- `group_members` (role: owner/admin/member, via [groupService.ts](apps/mobile/src/lib/groupService.ts)) and `conversation_participants` (role: owner/admin/member) are both existing, working examples of exactly this junction-table-with-role pattern in this codebase — **copy their shape**, don't invent a new one.
- `profiles.role` (global enum) and `is_director`/`director_status` (global sub-state) are both orthogonal to facility membership and should **not** be touched. A user's global `role` stays `'player'` while they hold `'owner'` in `facility_members` for a specific facility — this matches the spec's "A user may belong to zero, one, or many facilities" requirement directly.

**Recommendation:** `CREATE TABLE facility_members (facility_id uuid REFERENCES facilities, user_id uuid REFERENCES profiles, role text CHECK (role IN ('owner','manager','staff')), created_at, PRIMARY KEY (facility_id, user_id))`, with RLS following the `is_admin()`/`is_listing_owner()` SECURITY DEFINER pattern for an `is_facility_member(facility_id, user_id, min_role)` helper.

---

## 19. Booking Engine Gaps (must be built)

- Per-court inventory table (row-per-court under a facility, replacing the current integer-tally-only model)
- Ball machine inventory table
- Generic reservable-asset / reservation engine (Reservation, Reservation Hold, Availability, time-slot conflict prevention)
- Structured facility operating hours (today only free-text `hours_summary`)
- `facility_members` junction table + roles (§18)
- Payment-intent creation, Apple Pay/Google Pay/card capture, hold-then-capture flow, refunds, and `payment_intent.*`/`checkout.session.*` webhook handling (Connect *payout* plumbing already exists and is reusable)
- Flash Deal discount calculation logic (asset + time range + % → preview/discounted price)
- QR code generation and camera scanning (no package installed, no code exists)
- Client-side push notification token registration (server-side dispatch + idempotency pattern already exist and are reusable)
- Shared timezone-safe date/time utility (no date library installed at all)
- Shared distance/geo utility (currently duplicated ad hoc)
- Google Places / location-search autocomplete (only static map tiles + reverse-geocoding exist today)
- Facility Dashboard UI (mobile has no facility-admin screens at all today; only the web director console is a structural analog)

---

## 20. Risks

- **Duplicate architecture risk (HIGH):** the single biggest risk in this audit is building booking reservations on top of `play_events`/`play_participants` because it "looks similar" (has `max_players`, has `facility_id`). Per §6, this is explicitly the wrong model — do not do it.
- **Schema conflict risk (MEDIUM):** `transactions` is FK-coupled to tournaments only; adding booking payments to it either requires loosening that coupling (relax NOT NULL/FK assumptions elsewhere that may assume tournament-only rows) or a parallel table — needs a product/eng decision, not a default assumption.
- **Concurrency risk (HIGH):** court/ball-machine reservations have real double-booking risk under concurrent requests. `join_play_event()`'s `SELECT ... FOR UPDATE` pattern is the correct template (row-lock the asset/time-slot before checking availability and inserting) — any implementation that checks-then-inserts without a lock or an exclusion constraint will have race conditions.
- **Timezone risk (MEDIUM-HIGH):** no shared date/timezone utility exists; an existing tournament-creation screen already has a known ad hoc timezone bug workaround. Booking time-slot logic (start time + duration, "no overlapping reservations") is timezone-sensitive by nature — building it without first introducing a shared, tested date utility is likely to reproduce the same class of bug across every booking screen.
- **Payment race conditions (HIGH):** no payment-intent/webhook infrastructure of any kind exists yet (§9) — the "Reservation Hold → Payment Success → Confirmation" flow described in the spec (Screen 7) must correctly sequence hold-creation, payment-intent capture, and webhook-confirmed state transition, or a paid-but-unconfirmed / confirmed-but-unpaid split-brain state becomes possible. This is new-build risk, not a migration risk, but is the highest-stakes new code in the whole project.
- **Reservation overlap risk:** directly related to concurrency risk above — recommend a DB-level exclusion constraint (e.g. Postgres `EXCLUDE USING gist` on `(asset_id, tstzrange(start_time, end_time))`) in addition to application-level locking, so overlap prevention doesn't rely on application code alone.
- **RLS/security risk (LOW-MEDIUM):** `facilities: authenticated claim` policy currently lets any authenticated user move an unclaimed facility to `pending` claim status — fine today (claims still require admin/owner approval flow elsewhere), but once `facility_members` exists, claim-approval and membership-grant need to be reconciled so a claimed facility's `owner_user_id` and its `facility_members` `owner` row don't drift out of sync.
- **Performance risk (LOW):** none identified that's specific to Booking Engine beyond the general note that `facilities` table already has 100+ rows with geospatial (`coords` PostGIS) indexing in place — should be fine for V1 search volumes.
- **Migration risk (LOW):** the migrations directory was recently reconciled/squashed into a single baseline ([[project_facilities_csv_import]] context, commit `94892eb`) — new Booking Engine migrations should be added as new dated files after `20260807050000_marketplace.sql`, not by editing the baseline.

---

## Recommended Implementation Order

Phased so each phase is independently testable, per the spec's "Implementation Rules." **No implementation should begin on any phase until this audit and the phase's data model are reviewed and approved.**

1. **Foundation — schema only:** `facility_members` (+ RLS), structured facility hours, `court` image category, per-court and ball-machine inventory tables, generic `booking_assets`/`reservations`/`availability` tables with the overlap-exclusion constraint. No UI yet.
2. **Facility Admin — Court & Ball Machine Management:** CRUD screens for facility staff (create/edit/delete court + ball machine, using the reusable ImagePipeline for photos). Requires phase 1 + `facility_members` role checks.
3. **Player Search & Discovery:** Screens 1–3 (Search, Results, Facility Detail) — reuses existing `facilities.ts` service, `FacilityCard`, maps components; extend facility search to also return court/ball-machine availability summaries.
4. **Reservation Core (no payment):** Screens 4–5 (Choose Time & Court, Reservation) — the reservation-hold engine, occupancy/completion-status logic (reusing Community Play's UI/text patterns), concurrency-safe hold creation.
5. **Payments:** Screens 6–8 (Review, Payment, Confirmation) — payment-intent creation, Apple Pay/Google Pay/card, webhook-driven confirmation, refund/cancellation. Highest-risk phase; build and test in isolation with Stripe test mode before wiring to reservation state.
6. **My Bookings / Game Status / Invite Players:** Screens 9–10 — reuse `play_event_invites`/partner-finder invite patterns extended with a `related_reservation_id`.
7. **QR Check-In:** Screen 11 + Facility Check-In screen — new QR generation/scanning packages, reusing the tournament check-in state-machine shape.
8. **Facility Dashboard, Calendar, Flash Deals:** the aggregate/reporting views and discount-pricing engine, built last since they depend on real reservation data existing.
9. **Notifications wiring:** booking confirmation/reminder/cancellation/player-joined/game-full/flash-deal notifications via the existing idempotent `notify()` pattern — can be layered in incrementally as each earlier phase's trigger points go live, rather than as one big-bang phase.

---

## Files Likely To Be Modified

- [apps/mobile/src/lib/media/imageStandards.ts](apps/mobile/src/lib/media/imageStandards.ts) — flip `facility.implemented`, add `court`/`asset` category
- [apps/mobile/src/lib/supabase/facilities.ts](apps/mobile/src/lib/supabase/facilities.ts) — add availability-aware search
- [apps/mobile/src/components/FacilityCard.tsx](apps/mobile/src/components/FacilityCard.tsx) — add Flash Deal badge, starting price, court/machine counts
- [apps/mobile/src/lib/conversationService.ts](apps/mobile/src/lib/conversationService.ts) — add `'booking'` conversation_type + get-or-create helper
- [apps/mobile/src/hooks/useUnreadCounts.ts](apps/mobile/src/hooks/useUnreadCounts.ts) — likely no change, verify booking messages flow through existing `messages` table query
- [web/src/components/messaging/panel.tsx](web/src/components/messaging/panel.tsx) — only if booking chat must surface on web (open decision, see below)
- [apps/mobile/src/app/payments-settings.tsx](apps/mobile/src/app/payments-settings.tsx) — currently mock; needs real Stripe wiring if payment methods are managed there

## New Files Likely Required

- `apps/mobile/src/app/booking/` route group (Screens 1–11)
- `apps/mobile/src/app/facility-admin/` (or similar) route group (Facility screens)
- `apps/mobile/src/lib/supabase/reservations.ts`, `courts.ts`, `ballMachines.ts`, `flashDeals.ts`, `bookingAvailability.ts` (service layer)
- `apps/mobile/src/lib/date.ts` / `time.ts` (shared timezone-safe date utility — cross-cutting prerequisite)
- `apps/mobile/src/lib/geo.ts` (consolidated haversine/distance util)
- Mobile Stripe payment module (payment-intent client calls, Apple Pay/Google Pay wiring)
- QR generation/scanning components + screens

## Database Changes Likely Required

- `facility_members` (facility_id, user_id, role)
- `courts` (facility_id, name, indoor/outdoor, hourly_rate, hours, amenities, photos)
- `ball_machines` (facility_id, name, hourly_rate, hours, description)
- `booking_assets` or asset-type-polymorphic linkage tying courts/ball machines into one reservation engine, per spec
- `reservations`, `reservation_players`, `reservation_holds`, `availability` (or equivalent) with an overlap-exclusion constraint
- `flash_deals` (asset, date, start/end time, discount %)
- `check_ins` (booking-specific; likely can share shape with `registrations.checked_in_at`/`checked_in_by` convention)
- New `payments` rows or a relaxed/parallel `transactions` table for booking payments
- New `facility` storage bucket + RLS policy (mirroring the marketplace bucket's folder-per-owner pattern)
- Structured `facility_hours` (replacing/augmenting free-text `hours_summary`)

## Items Requiring Product Decision

1. **`transactions` table**: extend with a nullable `booking_id` (loosening its tournament coupling) vs. a new parallel payments table for bookings.
2. **`partner_likes`/`partner_matches` vs. `matchmaking_swipes`**: two apparently-parallel implementations exist in the schema; confirm which is canonical before extending either for "Invite Friends."
3. **Web messaging surface**: does Facility staff need booking chat inside the web director console, given [web/src/components/messaging/panel.tsx](web/src/components/messaging/panel.tsx) doesn't support contextual conversations today? If yes, that's added mobile+web scope.
4. **Design system dark/light mode**: the base app has no working dark/light mode switch today (two static, non-switching palettes). Confirm whether Booking Engine is expected to solve this app-wide, or whether "Support Light Mode / Dark Mode" in the spec is aspirational pending a separate design-system initiative.
5. **Facility claim vs. facility_members reconciliation**: once `facility_members` exists, decide whether `facilities.claim_status`/`owner_user_id` stays as the source of truth (with `facility_members` derived from it) or `facility_members` becomes primary (with the single-owner columns kept only for backward compatibility / display).
6. **Structured hours**: replacing free-text `hours_summary` with a real per-day open/close schedule is a facility-data-migration decision (110 existing seeded facilities only have the free-text field populated).

## Items That Must Not Be Duplicated

- **Do not** build a second image-upload/compression path — extend `apps/mobile/src/lib/media/` categories only ([[project_image_pipeline]]).
- **Do not** build booking reservations on `play_events`/`play_participants` (§6) — wrong lifecycle, wrong constraints.
- **Do not** build a new global auth role for facility permissions — use a `facility_members` junction table (§2, §18), matching `group_members`/`conversation_participants`.
- **Do not** build a second messaging/conversation system for booking chat — extend `conversation_type` on the existing `conversations` table (§8).
- **Do not** build a second distance/geo calculation — consolidate the existing duplicated haversine logic into one util and have Booking Engine use it.
- **Do not** treat Marketplace as a payments analog — it has no payment integration; only its listing/photo/chat-contact UI patterns are reusable.
- **Do not** re-implement admin/ownership RLS checks ad hoc — reuse the `is_admin()` / `is_listing_owner()` `SECURITY DEFINER` helper-function convention for any new `is_facility_member()` check.
