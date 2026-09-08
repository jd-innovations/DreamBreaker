# CALENDAR_INTEGRATION_PHASE6.md

> Status: Implemented, verified by `tsc`/`eslint`, and physically tested on a real iPhone via a new EAS iOS development build. User-confirmed: "calendar works and maps work." A real runtime bug (`withLink` undefined at runtime — see "Runtime Bug Found & Fixed During Physical Testing") and an unrelated pre-existing Google Maps iOS crash were found and fixed during this pass; see that section and "Physical iPhone Tests" for exactly what was and wasn't individually verified.
> Module: Native Capabilities Phase 6 — Native Calendar Integration ("Add to Calendar")
> Date: 2026-08-14 (implementation) / 2026-08-14–15 (EAS build + physical-device validation + fixes)

## Audit

Read first: `NATIVE_CAPABILITIES_AUDIT.md`, `QR_CAMERA_PHASE5.md`, `TOURNAMENT_QR_CHECKIN_PHASE5_1.md`, `apps/mobile/app.config.js`, `apps/mobile/package.json`, `apps/mobile/src/lib/haptics.ts`, `apps/mobile/src/lib/appLinks.ts`. Confirmed via repo-wide search (no `expo-calendar`, `Calendar.`, `addToCalendar`, `.ics`, `createEventAsync`/`createEventInCalendarAsync` anywhere in `apps/mobile`, `web`, or `supabase`) that no calendar integration existed before this phase — `NATIVE_CAPABILITIES_AUDIT.md` and `BOOKING_ENGINE_PHASE2_REPORT.md` both independently confirm the same gap. Nothing here duplicates an existing system.

| Domain | Status | Reasoning |
| ------ | ------ | --------- |
| **Court Booking** (`reservations`) | **READY** | `reservations.time_range` (`supabase/migrations/20260809162811_booking_engine_phase2_reservation_core.sql:112`) is a real `tstzrange` — an absolute UTC instant pair, not a naive date/time. `parseTstzrange()` (`apps/mobile/src/lib/supabase/reservations.ts:67`) already extracts it. `facilities` has full street address (`address`, `address_line_2`, `city`, `state`, `postal_code`). `reservations.status` (`held/confirmed/cancelled/expired`) is authoritative for gating. **Gap**: `appLinks.booking(id)` (`apps/mobile/src/lib/appLinks.ts:30`) has no matching route — there is no `apps/mobile/src/app/booking/[id].tsx`; the booking flow reads an in-memory `bookingStore` instead of a URL param. The canonical Universal Link is therefore **not wired** for this domain — omitted rather than shipped broken (see "Event Data Mapping"). |
| **Tournament** | **READY (as an all-day event)** | `tournaments.event_date` (`supabase/migrations/20260725000000_baseline_from_prod.sql:4427`) is a plain SQL `date` — no time-of-day, no timezone column anywhere on `tournaments` or `facilities`. Rather than guess a start time, the tournament is represented as a single-day all-day calendar event, which requires no invented time or timezone (Step 6). `venue_name`/`venue_address`/`city`/`state`/`zip_code` are real columns on `tournaments` (address previously unselected by the mobile fetch — added to the `select()`/type for this feature only, no fabricated data). `appLinks.tournament(id)` is genuinely wired to `apps/mobile/src/app/tournament/[id].tsx`. |
| **Quick Game / Round Robin / Mini Tournament** (`play_events`) | **READY** | All three are `event_type` values on one shared table (`supabase/migrations/20260725000000_baseline_from_prod.sql:4129`), rendered by one shared detail screen (`apps/mobile/src/app/community/[id].tsx`) — implemented once, covers all three. Has real `event_date` + `start_time` + nullable `duration_minutes`. No timezone column exists (confirmed via full-migration grep) — treated as venue-local wall-clock time, identical to the assumption this screen's own `fmtLongDate`/`fmtTime`/`computeEndTime` helpers already make (not a new guess introduced by this phase). `status` enum (`open/full/in_progress/completed/cancelled`) gates offering the CTA. `appLinks.communityEvent(id)` is genuinely wired and type-agnostic across all three activity kinds. |
| **Coach Lesson** | **NOT READY** | `coach_offers` (`supabase/migrations/20260809160000_coach_marketplace_phase2_offers.sql:27`) has a `duration_minutes` *template* field but **no scheduled start date/time column of any kind** — it is a purchasable offer/package (private lesson, clinic, camp, multi-lesson package), not a scheduled instance. Actual lesson timing is negotiated out-of-band (chat) after purchase; there is no "this lesson happens at X" row anywhere in the schema. Building Add to Calendar here would require inventing a schedule the product doesn't have yet. Correctly deferred. |

## Native Approach

- **Package**: `expo-calendar@~15.0.8`, installed via `npx expo install expo-calendar` (SDK-resolved for this project's Expo SDK 54.0.0, not hand-pinned).
- **API**: `Calendar.createEventInCalendarAsync()` exclusively — never `Calendar.createEventAsync()`, `requestCalendarPermissionsAsync()`, or `getCalendarPermissionsAsync()`. This launches the OS's own event editor (`EKEventEditViewController` on iOS; a Calendar app intent on Android) pre-filled with the supplied event data. The user reviews and explicitly saves (or cancels) inside that native UI — pickleballapp never reads, writes, or enumerates calendar data directly.
- **Why**: per expo-calendar's own documentation, this specific function needs **no calendar permission at all** on either platform when used this way — "if you only intend to create events using system-provided calendar UI... you don't need to request permissions." This is the least-privileged path that satisfies the product goal (Step 2/3), and it's exactly the same category of choice this repo already made for QR scanning's permission copy — deliberate, not default.
- **Permission model**: **None requested.** No permission prompt of any kind appears at any point in this feature. The interaction is entirely user-initiated (tapping "Add to Calendar" opens the OS editor; nothing happens on screen load, app launch, or navigation).

## Files Changed

**New:**
- `apps/mobile/src/lib/calendarEvents.types.ts` — `CalendarEventInput` / `AddToCalendarResult` / `AddToCalendarOutcome` types.
- `apps/mobile/src/lib/calendarEvents.native.ts` — the real `addToCalendar()` implementation (`Calendar.createEventInCalendarAsync`, outcome normalization).
- `apps/mobile/src/lib/calendarEvents.web.ts` — web stub, never imports `expo-calendar`, always returns `{ outcome: 'unsupported' }`.
- `apps/mobile/src/lib/calendarEvents.ts` — Metro platform-extension type-resolution fallback (mirrors `QRScanner.tsx`/`ExploreMap.tsx`), plus the shared `withLink()` notes/URL helper.
- `apps/mobile/src/components/AddToCalendarButton.tsx` — the reusable CTA (press/loading/result state, haptics, `button`/`icon` variants).

**Modified:**
- `apps/mobile/package.json` / `package-lock.json` — added `expo-calendar` (via `npx expo install`).
- `apps/mobile/app.config.js` — added a documenting comment only; the `expo-calendar` **config plugin is deliberately NOT registered** (see "Native Configuration").
- `apps/mobile/src/components/index.ts` — exported `AddToCalendarButton`.
- `apps/mobile/src/lib/tournamentTypes.ts` — added `venueAddress`/`zipCode` optional fields to `Tournament` (real DB columns, previously unselected — needed for calendar location).
- `apps/mobile/src/lib/supabase/tournaments.ts` — `fetchTournamentById()` now selects `venue_address`/`zip_code` and maps them.
- `apps/mobile/src/app/booking/confirmation.tsx` — added the Add to Calendar CTA + event builder.
- `apps/mobile/src/app/tournament/[id].tsx` — added the Add to Calendar icon CTA + event builder.
- `apps/mobile/src/app/community/[id].tsx` — added the Add to Calendar icon CTA + event builder (covers Quick Game/Round Robin/Mini Tournament).
- `apps/mobile/src/app/tournament/[id]/register.tsx` — passes `eventDate`/`venueAddress`/`zipCode` (from the already-loaded `fetchedTournament`) through to `registration-success.tsx` so it can build a calendar event without a second fetch. Added after physical testing surfaced that the user expected an Add to Calendar CTA immediately after confirming registration, not only on the tournament detail screen.
- `apps/mobile/src/app/tournament/[id]/registration-success.tsx` — added the Add to Calendar CTA + event builder (same all-day-event design as the tournament detail screen).

**Also fixed this pass, discovered via physical testing but unrelated to calendar work** (see "Related Fix" below):
- `apps/mobile/src/components/ExploreMap.native.tsx` / `VenueMapCard.native.tsx` — iOS now uses Apple's `PROVIDER_DEFAULT` map provider instead of `PROVIDER_GOOGLE` (Android unchanged).

No other files were touched. `expo-camera`, push notification routing, the Universal Link resolver, and every unrelated business screen were not modified.

## Native Configuration

**`expo-calendar`'s config plugin (`node_modules/expo-calendar/plugin/src/withCalendar.ts`) is intentionally NOT added to `app.config.js`'s `plugins` array.** Its source shows it would:
- Add iOS `NSCalendarsUsageDescription`/`NSCalendarsFullAccessUsageDescription` (and reminders equivalents) with a default English string unless explicitly suppressed.
- **Unconditionally** add Android `READ_CALENDAR`/`WRITE_CALENDAR` manifest permissions — not gated by any option at all.

Since this app only ever calls `createEventInCalendarAsync()` and never requests calendar permission, registering the plugin would declare access the app never uses — a direct violation of least privilege (Step 3: "Do not request more access than needed"). `expo-calendar`'s native module still autolinks correctly without the plugin entry (autolinking scans `package.json` dependencies independently of the `plugins` array; the array only controls Info.plist/AndroidManifest mutations). This is documented inline in `app.config.js` next to the `expo-notifications` entry.

## EAS Build Impact

**REQUIRED — built and tested this pass.** `expo-calendar` is a native module; a new EAS iOS development build containing it was built (`eas build --profile development --platform ios`) and installed on a physical iPhone. The initial build attempt failed at the `Install dependencies` phase with the same recurring `@emnapi/*` lockfile-drift issue documented in `QR_CAMERA_PHASE5.md` and `TOURNAMENT_QR_CHECKIN_PHASE5_1.md` (`npm ci` rejecting an out-of-sync `package-lock.json`) — fixed the same way, a full `node_modules`/lockfile regeneration, verified locally with `npm ci --dry-run` before rebuilding. The second build succeeded and installed on-device.

## Central Calendar Architecture

`CalendarEventInput` (`apps/mobile/src/lib/calendarEvents.types.ts`):
```ts
{
  title: string;
  startDate: Date;
  endDate?: Date;       // omitted when no reliable end exists -- see "Event Data Mapping"
  allDay?: boolean;
  location?: string;
  notes?: string;
}
```

`apps/mobile/src/lib/calendarEvents.ts` exports `addToCalendar(input): Promise<AddToCalendarResult>` (platform-dispatched via Metro's `.native`/`.web` extension resolution, the same pattern already used for `QRScanner`/`ExploreMap`) and `withLink(notes, url)`, a small pure helper that folds a canonical pickleballapp link into the notes string. This exists because `expo-calendar`'s dedicated `url` field is **iOS-only** — folding the link into `notes` instead is what makes "tap the link in the calendar app to return to pickleballapp" work on Android too, not just iOS.

The utility owns: platform dispatch, the `createEventInCalendarAsync` call, and outcome normalization (`saved`/`canceled`/`unknown`/`unsupported`/`error`). Business screens own only: building a `CalendarEventInput` from their own already-loaded domain data, and gating whether the CTA is shown at all (status checks). No permission handling exists anywhere in this feature because none is needed.

`AddToCalendarButton` (`apps/mobile/src/components/AddToCalendarButton.tsx`) is the one reusable CTA, used by all three integrated screens: it owns press/loading/"Added" state and haptics, exposes a `button` variant (wraps the existing `SecondaryButton`, used on Booking Confirmation) and an `icon` variant (matches the existing circular hero-icon pattern already used for Share/Bookmark, used on Tournament and Community Play detail). Returns `null` outright on web (Step 19) rather than rendering a CTA that can only ever no-op.

## Implemented Domains

- Court Booking (`apps/mobile/src/app/booking/confirmation.tsx`)
- Tournament (`apps/mobile/src/app/tournament/[id].tsx` detail screen, **and** `apps/mobile/src/app/tournament/[id]/registration-success.tsx` — added after physical testing showed the registration-confirmation CTA, one of Step 12's own suggested locations, was expected there too)
- Quick Game / Round Robin / Mini Tournament (`apps/mobile/src/app/community/[id].tsx`, one implementation covers all three `event_type` values)

Coach Lesson was not wired — see "Audit" (NOT READY, no scheduled-instance data exists).

## Runtime Bug Found & Fixed During Physical Testing

**Symptom:** `_libCalendarEvents.withLink is not a function (it is undefined)` — a render error on the tournament detail screen, first hit during physical testing.

**Root cause:** `withLink()` was originally defined directly inside `calendarEvents.ts` — the plain type-resolution fallback file. But Metro's platform-extension resolution means `import ... from '@/lib/calendarEvents'` **never actually loads `calendarEvents.ts` at runtime** on device — it resolves straight to `calendarEvents.native.ts` (or `.web.ts`), the same way `QRScanner`/`ExploreMap` imports resolve straight to their `.native`/`.web` files. `calendarEvents.ts` only exists so `tsc` (which doesn't understand Metro's platform-extension trick) can find the import — which is exactly why `tsc --noEmit` stayed clean the whole time even though the function was genuinely missing at runtime. This is a real gap in what `tsc` alone can catch for this platform-split pattern.

**Fix:** moved `withLink()` into `calendarEvents.types.ts` (the one file in this group with no `.native`/`.web` twin, so Metro always resolves it consistently) and re-exported it from `calendarEvents.native.ts`, `calendarEvents.web.ts`, and `calendarEvents.ts` alike, so it's present no matter which file Metro or `tsc` actually resolves to.

**Verification:** `tsc --noEmit` and `eslint` clean after the fix; confirmed working via Fast Refresh on the physical device, then via the full "calendar works" confirmation below.

## Related Fix: Google Maps iOS Crash (Pre-existing, Unrelated to Calendar)

Physical testing on the tournament detail screen (which renders `VenueMapCard` for the facility location) surfaced `react-native-maps: AirGoogleMaps dir must be added to your xcode project to support GoogleMaps on iOS.` — a pre-existing gap already flagged in `NATIVE_CAPABILITIES_AUDIT.md` (Apple Maps/Book a Court, P1, "Apple Maps/MapKit presentation layer" missing), not something this phase introduced.

**Fix:** `apps/mobile/src/components/ExploreMap.native.tsx` and `VenueMapCard.native.tsx` now use `Platform.OS === 'ios' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE` instead of hardcoding `PROVIDER_GOOGLE`. Apple's MapKit provider needs no native SDK pod (unlike Google Maps on iOS, which needs `AirGoogleMaps` wired into the Xcode project — the actual missing piece), so this requires no new EAS build and took effect via Fast Refresh immediately. Android is unchanged (still `PROVIDER_GOOGLE`, already correctly configured via `android.config.googleMaps.apiKey` in `app.config.js`). Facility search/data is unaffected — this only changes which renderer draws the map tiles/markers on iOS.

### Follow-up: latent MapKit crash exposed by the provider fix (2026-08-16)

**Symptom:** after the provider change, tapping "View Details" on the Explore/Nearby facility bottom sheet hard-crashed the app (full quit to home screen, no redbox) on **every** facility. Reaching the *same* facility detail screen from a tournament's facility card did **not** crash.

**Root cause:** the provider fix did not introduce this bug — it made it reachable. Under `PROVIDER_GOOGLE` on iOS, react-native-maps' `decorateMapComponent` hit `createNotSupportedComponent`, which logged the "AirGoogleMaps" error and rendered **no native view at all**. Once the provider switched to Apple's, a real `MKMapView` with live custom marker views existed for the first time, and two pre-existing defects became fatal:

1. `apps/mobile/src/app/(tabs)/nearby.tsx`'s facility-sheet CTA ran `onDismiss(); router.push(...)`. `onDismiss()` clears `selectedId`, re-rendering every custom `<Marker>` on the live map at the exact instant the screen was covered by the push. The decisive evidence was an asymmetry already in the file: `PinSheet`'s equivalent CTA navigates *without* dismissing and never crashed — only the one path that mutated marker state during navigation did.
2. `ExploreMap.native.tsx` used `tracksViewChanges={selectedId === pin.id}`, which left the selected marker re-rasterizing **permanently**, every frame, for as long as it stayed selected. Tearing down a continuously-updating native marker view is what actually crashes MapKit.

**Fix:** the facility CTA now navigates without dismissing (matching `PinSheet`; the sheet stays open behind the pushed screen, preserving context on return), and markers were extracted into a `MapMarker` component that tracks view changes only for a short window (`MARKER_TRACK_WINDOW_MS = 600`) after a pin's visual state changes, then stops. The second change also removes a real per-frame battery/CPU drain that existed independently of the crash. Both are JS-only — no rebuild required. `tsc`/`eslint` clean; user-confirmed fixed on the physical device.

**Ruled out along the way** (recorded so this isn't re-investigated): the facility detail screen mounts no map at all — `mapSheetOpen` initializes `false` and RN's `Modal` returns `null` when hidden — and the facility's own coordinates/fields were verified valid in production. `VenueMapCard` is immune to this class of bug because it renders a plain `<Marker>` with no custom child view.

## Event Data Mapping

**Court Booking** (`booking/confirmation.tsx`):
- Title: `Pickleball Court — {facility name}` (or `Pickleball — {facility name}` for a ball machine reservation).
- Start/End: `parseTstzrange(reservation.time_range)` — real absolute UTC instants from the reservation row itself (not the session-local `bookingStore` selection the rest of this screen displays, which may be empty if the user returns later — this is a strictly more reliable source for the calendar event specifically).
- Timezone: not set explicitly; unnecessary — `time_range` is already an absolute instant, so the OS displays it correctly in whatever timezone the viewer is in.
- Location: `{facility.address}\n{facility.address_line_2}\n{facility.city}, {facility.state} {facility.postal_code}` (blank lines skipped).
- Notes: `{Court/Ball Machine name}. Booking details available in pickleballapp.`
- Canonical URL: **omitted** — `appLinks.booking(id)` has no matching route (see "Audit"). Not included rather than shipped as a link that opens nothing.
- Gate: only offered when `reservation.status` is `held` or `confirmed`.

**Tournament** (`tournament/[id].tsx`):
- Title: `{tournament.name}`.
- Start/End: `tournament.eventDate` parsed as a local calendar date, `allDay: true`, start === end (single day). No time-of-day or timezone is set — none exists in the data.
- Location: `{venue_name}\n{venue_address}\n{city}, {state} {zip_code}` (blank lines skipped; `venue_address`/`zip_code` newly selected for this feature, real columns, not fabricated).
- Notes: the canonical Universal Link only (via `withLink`).
- Canonical URL: `appLinks.tournament(id)` — confirmed genuinely wired to a real route.
- Gate: only offered when `tournament.status` is `open`, `filling_fast`, or `full` — excludes `draft`/`pending_approval` (not yet public), `cancelled`, and `completed`.

**Tournament Registration Confirmation** (`tournament/[id]/registration-success.tsx`) — same mapping as Tournament above (title, all-day event, location, `Division: {name}` + canonical link in notes), fed via extra params (`eventDate`, `venueAddress`, `zipCode`) threaded from `register.tsx`'s already-loaded `fetchedTournament` rather than a second fetch. No extra gating needed — you can't reach this screen for a tournament that wasn't open for registration. If `fetchedTournament` somehow hadn't loaded before submit, `eventDate` param is empty and the CTA is silently omitted rather than guessing.

**Quick Game / Round Robin / Mini Tournament** (`community/[id].tsx`):
- Title: `Pickleball — {event type label}{ at venue name, if known}` (e.g. "Pickleball — Open Play at Lakewood Ranch Courts", "Pickleball — Round Robin").
- Start: `event_date` + `start_time` combined as a local `Date` when `start_time` is present; if `start_time` is null (legacy rows only — the create screens always collect a duration/time today), falls back to an all-day event on `event_date` rather than inventing a time.
- End: `start + duration_minutes` when `duration_minutes` is present; when absent, `endDate` is left **unset** entirely so the native OS editor applies its own standard default (not an app-invented number — Step 7 explicitly forbids that).
- Timezone: not set; treated as venue-local wall-clock time, matching this screen's own existing display-formatting assumption (documented, not silently new).
- Location: `{venue_name/location}\n{facility.address}\n{facility.address_line_2}\n{facility.city}, {facility.state} {facility.postal_code}` when a linked facility exists, else just the freeform venue/location text.
- Notes: event type label + the canonical Universal Link (via `withLink`).
- Canonical URL: `appLinks.communityEvent(id)` — confirmed genuinely wired and shared across all three activity kinds.
- Gate: only offered when the event is not past/cancelled/completed (`!isPastEvent`, the same flag this screen already uses to disable "Invite Players").

## Privacy

No calendar data is read, enumerated, or uploaded anywhere in this feature. `createEventInCalendarAsync()` is one-directional (app → OS editor, user decides whether to save) — there is no corresponding "read the calendar" call anywhere in the new code, and no calendar content is ever sent to Supabase or any server. Notes fields contain only: activity type, venue/court name, and the canonical pickleballapp link — never payment details, QR credentials, Supabase row IDs, or any other internal metadata (verified by inspecting every `notes:`/`location:` construction above).

## Duplicate Strategy

**Strategy A — native event editor, user controls it.** Every tap of "Add to Calendar" opens the OS editor pre-filled with the same event data; nothing is created silently. If the user taps again (e.g. after already saving once), the editor opens again and the user explicitly decides whether to save a second event. No calendar event identifiers are persisted anywhere (not in Supabase — "Do NOT add a server database table merely to track device calendar IDs" — and not in local device storage either, since it isn't needed for this strategy). The `AddToCalendarButton`'s "Added to Calendar" label is transient, in-memory, session-only UI state; it does not block or hide the button from being pressed again.

Android's `createEventInCalendarAsync` result is always reported as `'done'` regardless of outcome (expo-calendar cannot distinguish saved/canceled/deleted there) — `calendarEvents.native.ts` maps this to `outcome: 'unknown'` rather than `'saved'`, so the button does **not** show a false "Added to Calendar" state or fire `haptics.success()` on Android; it simply reverts to idle without claiming an unconfirmed outcome as fact.

## Synchronization Limitations

Phase 6 is explicitly **not** two-way sync. Once a user saves an event via the native editor, pickleballapp has no further relationship to that device-calendar entry — it cannot detect it, update it, or delete it. **pickleballapp remains the authoritative source for the activity.** If a tournament/game/booking changes or is cancelled after being added to a calendar, the device calendar entry is not touched automatically; the canonical pickleballapp link embedded in the event's notes (where a working route exists — Tournament and Community Play, not Court Booking per the audit gap above) is the user's route back to current details.

## Physical iPhone Tests

Tested on a physical iPhone via the new EAS iOS development build. The device owner ran the tests directly (this session doesn't have hands-on-device visibility) and reported "calendar works and maps work" plus specific confirmation that tournament registration completed successfully — these results are the device owner's report, not something independently observed here, noted the same way prior phase reports attribute physical-device confirmation. Granular per-scenario detail (cancel-without-saving, duplicate-tap behavior, tapping the notes link, exact timezone comparison, cancelled-activity gating) was **not individually itemized** in that report, so those rows are left NOT TESTED rather than inferred.

| Test | Status |
| ---- | ------ |
| Test 1 — Add Event (native calendar interaction opens/creates correctly) | **PASS** — user-confirmed ("calendar works") |
| Test 2 — Event Content (title/date/time/location/notes match pickleballapp) | **PASS** — user-confirmed |
| Test 3 — Save (event appears in iPhone Calendar) | **PASS** — user-confirmed |
| Test 4 — Universal Link (tapping the link in the saved event opens the correct activity) | NOT TESTED (not individually reported) |
| Test 5 — Cancel Native Editor (no false success, no crash, no event created) | NOT TESTED (not individually reported) |
| Test 6 — Duplicate Attempt (matches the documented Strategy A behavior) | NOT TESTED (not individually reported) |
| Test 7 — Permission Denied | **NOT APPLICABLE** — least-privileged native editor path used; no permission is ever requested by this feature. |
| Test 8 — Timezone (calendar time exactly matches pickleballapp) | NOT TESTED (not individually reported) |
| Test 9 — Cancelled/Ineligible Activity (CTA correctly withheld) | NOT TESTED (not individually reported) |
| Test 10 — Regression | **PASS for tournament registration specifically** — independently verified server-side this session (not just claimed): a real registration payment was traced end-to-end through Stripe (PaymentIntent `succeeded`), the `payments` table (`status: succeeded`, `confirmed_at` set), and a genuine new `registrations` row (`status: registered`, correct `entry_fee_paid_cents`). Tournament QR check-in, booking flow, and haptics elsewhere were not specifically re-exercised this pass. |

### Still outstanding

- Universal Link tap-through from a saved calendar event (Test 4).
- Explicit cancel-without-saving behavior (Test 5).
- Duplicate "Add to Calendar" tap behavior (Test 6).
- Exact timezone match on a known Quick Game/Round Robin/Mini Tournament event (Test 8).
- Confirming the CTA is correctly withheld for a cancelled/completed activity (Test 9).
- Court Booking and Community Play "Add to Calendar" specifically (only Tournament flows were explicitly mentioned in device-owner feedback this pass — Court Booking and Community Play use the same central utility and were covered by `tsc`/`eslint`, but weren't separately called out as tested on-device).

## Regression Tests

- `npx tsc --noEmit`: clean (0 errors) in `apps/mobile`, both at implementation time and again after the `withLink` and maps-provider fixes.
- `npx eslint` on every new/changed file: 0 errors, 0 warnings introduced, both passes. Two pre-existing `react/no-unescaped-entities` errors and several pre-existing unused-variable warnings were found in `community/[id].tsx`, `tournament/[id].tsx`, and `registration-success.tsx` during these runs — confirmed via inspection to be unrelated to this phase's edits (apostrophes in unrelated copy strings; unused imports/vars pre-dating this change) and left untouched per scope.
- Web `tsc`/`eslint` not run — no file under `web/` was touched this phase.
- No changes were made to `expo-camera`, QR check-in, push notifications, Universal Link resolution (`externalRouting.ts`), or any RLS/migration.
- **Also found and fixed this session, unrelated to calendar work**: a production Stripe webhook bug (the endpoint URL pointed at `www.pickleballapp.app`, which now 308-redirects to the apex domain — Stripe doesn't follow redirects for webhook delivery, so `payment_intent.succeeded` events never reached the server, leaving `payments` rows stuck at `requires_confirmation` and no `registrations` row ever created despite the card being charged). Fixed by correcting the webhook endpoint URL in Stripe's dashboard to the non-redirecting apex domain; verified end-to-end afterward (webhook `200`, `payments.status = succeeded`, real `registrations` row created). This was infrastructure/config, not application code, and is unrelated to the calendar feature itself — noted here only because it blocked testing Tournament Registration Confirmation's calendar CTA until fixed.

## Deferred Work

- Coach Lesson Add to Calendar — blocked on a real scheduled-lesson-instance data model that doesn't exist yet (see "Audit"). Not something to invent in this phase.
- A working canonical Universal Link for Court Booking (`appLinks.booking(id)` / `apps/mobile/src/app/booking/[id].tsx`) — a pre-existing architecture gap discovered during this audit, not created by it. Once a real booking detail route exists, the omitted `url`/notes-link in the booking calendar event should be added.
- Granular physical re-test of Tests 4–6, 8, 9 (Universal Link tap-through, cancel, duplicate, timezone, cancelled-activity gating) and explicit on-device confirmation for Court Booking / Community Play specifically (see "Still outstanding" above).
- Android physical validation — deferred per Step 18; no Android test device/build available. The `unknown`-outcome handling for Android's ambiguous `createEventInCalendarAsync` result is implemented and reasoned about above, but not physically exercised.
- Reconciling the two pre-fix orphaned Stripe test payments (charged successfully but never confirmed server-side, from before the webhook URL fix) — explicitly left alone per the user's decision ("we will keep this in test mode"), not a real-money issue.
- Proper Google Maps iOS SDK wiring (`AirGoogleMaps`) if Google's map styling/tiles are ever wanted back on iOS specifically — Apple's MapKit provider is the working fix in place now, matching `NATIVE_CAPABILITIES_AUDIT.md`'s own recommended direction.
