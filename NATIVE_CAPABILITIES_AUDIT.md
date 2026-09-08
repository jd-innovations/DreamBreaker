# NATIVE CAPABILITIES AUDIT

Status: Audit-only, no implementation  
Date: 2026-08-11  
Scope: DreamBreaker / pickleballapp native iOS readiness, Expo/EAS config, Supabase/server support, and mobile app usage

## Overall Native Readiness

Overall assessment: **PARTIAL**

The repo has a strong Expo/EAS base and several native modules are already installed and used: location, haptics, secure storage, image picker/media, document picker, native share, file sharing, Google Maps through `react-native-maps`, and Stripe React Native as an installed dependency. The main production gaps are push notification client registration/routing, mounted Stripe PaymentSheet, Apple Sign-In client support, Apple Maps/MapKit presentation for Book a Court, QR scanning, calendar integration, native app icon badges, and production crash/analytics.

Important audit boundary: this document reports repository facts and follow-up recommendations only. No packages, migrations, EAS config, Apple config, or app code were changed.

| Capability | Status | Existing Infrastructure | Missing | Expo Go Blocker Resolved? | Native Rebuild Needed? | Recommended Priority |
| ---------- | ------ | ----------------------- | ------- | ------------------------- | ---------------------- | -------------------- |
| Push notifications | PARTIALLY IMPLEMENTED | `push_tokens`, in-app `notifications`, message trigger, `send-message-push` Edge Function | `expo-notifications`, permission flow, token upsert, notification listeners/routing, APNs/EAS credential verification, invalid-token cleanup | Yes, with EAS dev build | Yes | P0 |
| Google OAuth | NEEDS VERIFICATION | Browser OAuth through Supabase, Expo AuthSession/WebBrowser, scheme `dreambreaker`, SecureStore session | Production redirect allow-list, iOS client IDs, real-device callback validation | Mostly yes | Usually no unless scheme/associated domains change | P0 |
| Stripe PaymentSheet | PARTIALLY IMPLEMENTED | SDK installed, server PaymentIntent functions, webhook finalizer, reservation hook | StripeProvider/plugin mounted, merchant id, review screen wiring, real-device PaymentSheet test, booking function config entry | Yes, with custom dev client | Yes | P0 |
| Apple Maps / Book a Court | PARTIALLY IMPLEMENTED | Booking engine, facility search, coordinates, availability, `react-native-maps` Google map | Apple Maps/MapKit presentation layer and bottom sheet integration | Yes | Yes if adding `expo-maps`/MapKit | P1 |
| Haptics | READY TO TEST | `expo-haptics` installed and used in onboarding/auth/celebrations | Central utility and consistent taxonomy | Yes | No if current dev client includes module | P2 |
| Deep links / Universal Links | PARTIALLY IMPLEMENTED | Expo Router, scheme `dreambreaker`, OAuth/reset handling, share links | Associated Domains, apple-app-site-association, notification tap router, production URLs | Yes | Yes for Associated Domains | P1 |
| QR / camera | PARTIALLY IMPLEMENTED | Camera via `expo-image-picker`, wallet/coach/check-in placeholders, server voucher/check-in primitives | QR scanner package/API, permission copy, QR payload model, validation RPC/function | Yes | Yes if adding `expo-camera` | P1 |
| Calendar | NOT IMPLEMENTED | Date/time domain data exists | `expo-calendar`, ICS utilities, add-to-calendar UX | Yes | Yes if adding native calendar package | P2 |
| Apple Sign-In | PARTIALLY IMPLEMENTED | Supabase Apple provider enabled in config | Client package/UI, nonce/id token flow, entitlement/capability validation | Yes | Yes | P1 |
| Native Share | READY TO TEST | React Native `Share.share`, `expo-sharing`, custom share URLs | Unified share URL/domain strategy | Yes | No | P2 |
| Photos / media | PARTIALLY IMPLEMENTED | `expo-image-picker`, `expo-image-manipulator`, `expo-document-picker`, `expo-file-system`, `ImagePipeline` | Broader permission descriptions, disabled pipeline categories finished | Yes | No if current modules are in dev client | P1 |
| Location | READY TO TEST | Foreground `expo-location`, user settings, nearby/facility/booking use | Precise/approximate testing matrix; no background location | Yes | No for foreground | P1 |
| Lifecycle / offline | PARTIALLY IMPLEMENTED | AppState auth refresh, SecureStore/local cache, payment polling | NetInfo/offline state, resume handlers, interrupted booking recovery | Yes | Maybe, if adding NetInfo | P2 |
| Crash / analytics | NOT IMPLEMENTED | Support diagnostics and dev-only support analytics seam | Production crash/error/perf analytics | Yes | Depends on vendor SDK | P2 |
| Badges / in-app notifications | PARTIALLY IMPLEMENTED | Notification center and unread counters | Native app icon badge and persisted notification preferences | Yes | Yes for native badge via notifications | P1 |
| Account/security native | PARTIALLY IMPLEMENTED | SecureStore auth/session persistence | Biometrics, device/session management, push token cleanup on logout | Yes | Yes for biometrics | P2 |
| Accessibility | NEEDS VERIFICATION | Some `hitSlop`, default RN text scaling | Systematic VoiceOver labels, reduced motion, contrast/touch audit | Yes | No | P2 |
| Live Activities / HealthKit | NOT IMPLEMENTED | Domain models could support future status/session data | Native modules, entitlements, data model approvals | Yes | Yes | Later |

## Apple / EAS Configuration Facts

Repository facts:

- `apps/mobile/eas.json` defines `development` with `developmentClient: true` and `distribution: internal`; preview and production profiles exist.
- `apps/mobile/app.json` sets bundle/package `com.dreambreakerpb.app`, scheme `dreambreaker`, and EAS project id under `extra.eas.projectId`.
- `apps/mobile/app.config.js` adds Google Maps API keys from `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`.
- Config plugins currently include `expo-router`, `expo-splash-screen`, `@react-native-community/datetimepicker`, `expo-font`, `expo-web-browser`, `expo-secure-store`, `expo-asset`, `expo-location`, `expo-image-picker`, and `expo-dev-client`.
- `app.config.js` explicitly comments that the `@stripe/stripe-react-native` config plugin was removed because importing/mounting it broke web and Expo Go; the comment says to re-add it with a real `merchantIdentifier` once using a custom Expo dev client.
- No Associated Domains, Apple Sign-In entitlement, APNs credential file, notification config plugin, or `expo-notifications` plugin is visible in the repo.
- `supabase/config.toml` enables Google and Apple auth providers with env-backed values, and declares tournament/coach payment intent functions. It does not currently show a `[functions.create-booking-payment-intent]` entry even though that Edge Function exists.

Recommendations:

- Treat the next native build as the place to bundle `expo-notifications`, Stripe plugin/merchant identifier, Apple Sign-In client entitlement/package, QR scanner package if approved, and Associated Domains if Universal Links are ready.
- Do not change `app.config.js` until the implementation phase. It is the authoritative dynamic config file for native plugin decisions.

## Dependency Audit

| Capability | Package | Installed | Configured | Used | Tested in Dev Build | Action |
| ---------- | ------- | --------: | ---------: | ---: | ------------------: | ------ |
| Push notifications | `expo-notifications` | No | No | No | No | Add in push implementation phase |
| Stripe PaymentSheet | `@stripe/stripe-react-native` | Yes | No | Partially | No | Re-add plugin/provider in native build phase |
| Google OAuth | `expo-auth-session`, `expo-web-browser` | Yes | Yes | Yes | Needs verification | Real-device OAuth test |
| Native Google Sign-In | Native Google package | No | No | No | No | Not needed unless browser OAuth is rejected |
| Location | `expo-location` | Yes | Yes | Yes | Needs verification | Real-device permission/map tests |
| Maps | `react-native-maps` | Yes | Google keys configured | Yes | Needs verification | Keep for existing map; add Apple layer later |
| Apple Maps / MapKit | `expo-maps` or native MapKit wrapper | No | No | No | No | Add only for Book a Court Apple map phase |
| Haptics | `expo-haptics` | Yes | Plugin not required | Yes | Needs verification | Add central utility later |
| Media/photos | `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, `expo-document-picker` | Yes | Yes | Yes | Needs verification | Preserve ImagePipeline |
| Native sharing | React Native `Share`, `expo-sharing` | Yes | Plugin not required | Yes | Needs verification | Consolidate share URL strategy later |
| QR scanning | `expo-camera` | No | No | No | No | Add only in QR phase |
| Calendar | `expo-calendar` | No | No | No | No | Add only in calendar phase |
| Apple Sign-In | `expo-apple-authentication` | No | No | No | No | Add client flow and entitlement later |
| Secure storage | `expo-secure-store` | Yes | Yes | Yes | Needs verification | Keep current auth/local prefs architecture |
| Biometrics | `expo-local-authentication` | No | No | No | No | Future security phase |
| Crash/analytics | Sentry/PostHog/etc. | No | No | Dev-only seam | No | Choose vendor later |
| Network/offline | `@react-native-community/netinfo` | No | No | No | No | Consider later for offline UX |

## Priority 1: Push Notifications

Repository facts:

- `expo-notifications` is not present in `apps/mobile/package.json`; no notification plugin is present in `apps/mobile/app.config.js` or `apps/mobile/app.json`.
- `apps/mobile/src/app/onboarding/enable-notifications.tsx` is a UI-only preference screen with local `useState`; it does not request native notification permission or register a token.
- `apps/mobile/src/app/notifications-settings.tsx` uses local `useState` toggles for push, email, SMS, quiet hours, and badges; these are not persisted and are not wired into dispatch.
- `apps/mobile/src/lib/profileSetup.ts` already checks `push_tokens` with `hasRegisteredPushToken(userId)` and uses that to mark the "Enable push notifications" setup task complete.
- `supabase/migrations/20260725000000_baseline_from_prod.sql` includes `public.push_tokens` with primary key `(user_id, expo_push_token)`, platform check (`ios`, `android`, `unknown`), owner RLS policies, and index `idx_push_tokens_user`.
- `supabase/migrations_legacy/20260708010000_push_notifications.sql` documents that the server/DB half exists and client-side `expo-notifications` registration was deferred.
- `public.notifications` exists with fields used by the app (`id`, `user_id`, `type`, `title`, `body`, `link`, `read_at`, `created_at`) plus an idempotency index in the baseline.
- `apps/mobile/src/lib/supabase/notifications.ts` reads and marks in-app notifications.
- `apps/mobile/src/hooks/useUnreadCounts.ts` counts unread messages and unread notifications, subscribes to Realtime inserts/updates on `notifications`, and excludes muted/archived chat threads.
- `apps/mobile/src/components/AppHeader.tsx` and `apps/mobile/src/components/SlideMenu/SlideMenuProvider.tsx` render notification badges from `useUnreadCounts`.
- `public.notify_new_message()` exists in the baseline and legacy migration. It gathers push tokens for conversation recipients, respects `conversation_participant_settings.muted_until`, excludes the sender, and calls `/functions/v1/send-message-push` through `pg_net`.
- `supabase/functions/send-message-push/index.ts` relays Expo push payloads to `https://exp.host/--/api/v2/push/send`, validates token shape, and sends title/body/data.
- The push relay currently has no Expo ticket receipt polling, invalid-token cleanup, batching, user preference evaluation, or database writes.
- The migration includes a bearer credential literal for the Edge Function call. This audit intentionally does not reproduce it. It should be reviewed and rotated externally during implementation.
- No client notification listeners were found for foreground handling, background tap routing, notification response handling, or badge synchronization.
- No logout/device cleanup exists in `apps/mobile/src/lib/auth.ts`; `signOut()` only calls `supabase.auth.signOut()`.

Flow capability assessment:

| Step | Current State |
| ---- | ------------- |
| iPhone permission request | Missing |
| Expo/APNs token generated | Missing |
| Token associated with authenticated user/device | Table exists; client upsert missing |
| Backend event occurs | Existing message insert trigger path |
| Push generated server-side | Existing message trigger plus `send-message-push` |
| Notification delivered | Not testable until token registration and credentials are configured |
| User taps notification | Missing client listener/router |
| App opens correct destination | Missing notification response mapping |

Recommendations:

- Reuse `push_tokens`, `notifications`, `useUnreadCounts`, `conversation_participant_settings`, `notify_new_message()`, and `send-message-push`.
- Implement first push phase as the smallest end-to-end test: permission request, Expo push token registration/upsert, foreground/tap handlers, logout cleanup, and one message-received test.
- Keep preferences minimal in phase 1. Respect existing chat mute rules first; defer category preferences, quiet hours, digesting, and marketing notifications.

## Priority 2: Google OAuth

Repository facts:

- `apps/mobile/src/lib/auth.ts` implements Google auth through Supabase `signInWithOAuth({ provider: 'google' })`, `expo-auth-session` `makeRedirectUri()`, and `expo-web-browser` `openAuthSessionAsync`.
- The callback parses Supabase session params through `expo-auth-session/build/QueryParams` and calls `supabase.auth.setSession`.
- `apps/mobile/src/app/sign-in.tsx` calls `signInWithGoogle()`.
- `apps/mobile/src/lib/supabase.ts` persists Supabase auth using `expo-secure-store` on native and localStorage on web. It disables URL session detection with `detectSessionInUrl: false`, appropriate for this mobile callback pattern.
- `apps/mobile/app.json` sets scheme `dreambreaker`.
- `supabase/config.toml` enables Google provider with env-backed client ID and secret.
- Local Supabase redirect config only visibly includes localhost web callback entries; production mobile redirect allow-list and Supabase Dashboard config need external verification.
- No native Google Sign-In SDK is installed or used.

Recommendations:

- Do not redesign auth unless browser OAuth fails product requirements.
- Real-device test matrix should include fresh sign-in, canceled browser session, already-authorized Google account, sign-out/sign-in, password reset deep link, cold-start callback, and expired-token refresh.
- Externally verify Supabase Dashboard redirect URLs, Google OAuth client IDs for iOS/web as used by Supabase, and the production domain callback list.

## Priority 3: Stripe

Repository facts:

- `@stripe/stripe-react-native` is installed in `apps/mobile/package.json`.
- `apps/mobile/src/app/_layout.tsx` intentionally does not mount `StripeProvider`. The comment says mounting/importing Stripe under `src/app` broke web and Expo Go, and that mobile-side payment code is ready pending custom dev client.
- `apps/mobile/app.config.js` has the Stripe plugin commented out/removed pending a real merchant identifier and custom dev client.
- `apps/mobile/src/lib/payments/stripeConfig.ts` reads `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- `apps/mobile/src/lib/payments/useReservationPayment.ts` is a PaymentSheet hook using `useStripe`, `initPaymentSheet`, and `presentPaymentSheet`.
- `apps/mobile/src/lib/payments/reservationPaymentIntent.ts` invokes Supabase Edge Function `create-booking-payment-intent`, polls reservation status, and states that the client never declares payment success.
- `apps/mobile/src/lib/payments/useTournamentEntryPayment.ts` is intentionally stubbed and avoids importing Stripe; comments defer PaymentSheet wiring.
- `supabase/functions/_shared/payments.ts` creates Stripe PaymentIntents using `STRIPE_SECRET_KEY`, inserts `payments`, uses idempotency keys, and cancels the PaymentIntent if the DB insert fails.
- `supabase/functions/create-booking-payment-intent/index.ts`, `create-tournament-entry-payment-intent/index.ts`, and `create-coach-offer-purchase-payment-intent/index.ts` are thin domain-specific consumers of the shared payment primitive.
- `web/src/app/api/stripe/webhooks/route.ts` verifies `STRIPE_WEBHOOK_SECRET`, dedupes events through `stripe_webhook_events`, and handles `payment_intent.succeeded`, failures, cancellations, refunds, and Connect `account.updated`.
- `web/src/lib/payments/finalizePayment.ts` is the single finalizer for successful payments. It handles tournament registration, coach offer purchase finalization/voucher issuance, and reservation held-to-confirmed transition.
- `web/src/app/api/dev/simulate-payment/route.ts` is a non-production, secret-guarded dev simulator that calls the same finalizer without Stripe connectivity.
- `supabase/config.toml` declares tournament and coach payment intent functions with `verify_jwt = true`, but not `create-booking-payment-intent`.

Recommendations:

- Use the EAS development build to validate Stripe imports, provider mounting, Apple Pay merchant configuration, and PaymentSheet on a device/simulator.
- Add the missing booking Edge Function config entry in the implementation phase if deployment requires it.
- Keep finalization server-authoritative. Do not add a client-side "mark paid" path.
- Consider upgrading Stripe API/SDK only as a separate change; current repo uses `2026-05-27.dahlia` while current Stripe guidance seen by the installed Stripe skill references newer versions.

## Priority 4: Apple Maps / Book a Court

Repository facts:

- Booking screens exist: `apps/mobile/src/app/booking/index.tsx`, `booking/results.tsx`, `booking/choose-time.tsx`, `booking/players.tsx`, `booking/review.tsx`, `booking/confirmation.tsx`, and `booking/game-status.tsx`.
- `apps/mobile/src/lib/bookingStore.ts` holds session-local wizard state. Server-side state begins once a reservation hold exists.
- `apps/mobile/src/lib/supabase/facilities.ts` uses RPC `search_facilities_nearby` for proximity facility discovery and fetches facility/photos/details.
- `apps/mobile/src/lib/supabase/reservations.ts` wraps `create_reservation`, `join_reservation`, `cancel_reservation`, and `reservation_occupancy_for_asset`.
- Courts and ball machines are separate inventory services in `apps/mobile/src/lib/supabase/courts.ts` and `apps/mobile/src/lib/supabase/ballMachines.ts`.
- Flash Deals are represented in Supabase services and booking UI.
- `apps/mobile/src/components/ExploreMap.native.tsx` uses `react-native-maps` with `PROVIDER_GOOGLE`, custom markers, user location, and uncontrolled camera behavior.
- `apps/mobile/src/components/ExploreMap.web.tsx` is a web stub because `react-native-maps` has no web support.
- Several details/confirmation screens open external Apple Maps URLs with Google Maps fallback via `Linking.openURL`.
- `expo-maps` is not installed and no MapKit implementation was found.

Recommendations:

- Introduce Apple Maps strictly as a presentation layer over existing search and booking services. Do not rewrite booking business logic.
- Best integration point: `Book a Court` -> Apple map screen fed by `fetchFacilities({ bookableOnly: true, lat, lng, radiusMiles })` -> bookable facility pins -> preview/bottom sheet -> "View Times" -> existing `/facility/[id]` or `/booking/choose-time` flow.
- Keep Google Places/facility discovery as the source of facility identity and enrichment.

## Priority 5: Haptics

Repository facts:

- `expo-haptics` is installed.
- Existing calls appear in onboarding helpers (`apps/mobile/src/lib/onboarding/components.tsx`), auth screens (`sign-in.tsx`, `sign-up.tsx`), celebration components, marketplace purchase paths, slide menu interactions, and onboarding completion.
- Haptic calls are duplicated at call sites rather than centralized.

Recommendations:

- Add a small utility later, e.g. `selection`, `light`, `medium`, `success`, `warning`, and `error`.
- Candidate flows: push permission accepted, booking hold created, payment success/failure, QR scan success/error, calendar add success, share completed, and marketplace purchase success.
- Do not make haptics the only feedback path; accessibility still needs visual/text state.

## Priority 6: Deep Links / Universal Links

Repository facts:

- Expo Router is the app navigation framework, with many file-based routes declared in `apps/mobile/src/app/_layout.tsx`.
- `apps/mobile/app.json` defines scheme `dreambreaker`.
- Auth uses `makeRedirectUri()` and reset-password uses `expo-linking` `useLinkingURL()`.
- Share links include custom scheme examples such as `dreambreaker://groups/${id}`.
- Claim links exist via route `apps/mobile/src/app/claim/[token].tsx`.
- There is no Associated Domains config in app config, and no Universal Link association file was verified in this repo.
- Notification tap routing is not implemented.

Recommendations:

- Keep the custom scheme for dev/testing.
- Add Universal Links later using Associated Domains and a web-hosted `apple-app-site-association`.
- Define one route mapping table for notification data, share URLs, claim links, booking links, tournament links, marketplace links, coach offers, groups, and conversations.

## Priority 7: QR / Camera

Repository facts:

- `expo-camera` is not installed.
- Camera access is currently through `expo-image-picker` for photo capture in chat, support, groups, quick games, round robins, mini tournaments, clinics, and related flows.
- `apps/mobile/src/lib/attachmentPicker.ts` handles camera, media library, and document attachment picking for support/chat.
- Wallet and coach voucher UI has redemption placeholders. `apps/mobile/src/components/wallet/WalletCard.tsx` and `apps/mobile/src/app/wallet/[id].tsx` disable redemption action as "Coming Soon".
- `apps/mobile/src/app/coach/index.tsx` advertises "Redeem with a QR scan" as a capability placeholder.
- Tournament check-in exists manually in `apps/mobile/src/app/tournament/[id]/check-in.tsx` and uses `checkInPlayer` from `apps/mobile/src/lib/supabase/registrations.ts`.
- Database support for wallet redemptions exists, but comments describe it as future-facing/no client-facing redemption flow.

Recommendations:

- Separate QR work into four parts: QR generation, QR scanning, server validation, and redemption/check-in business logic.
- Use server-generated, short-lived, signed/opaque QR payloads for voucher redemption and check-in; do not encode privileged business facts directly in client-readable QR content.
- Add scanner only after deciding whether first QR use case is tournament check-in, court booking check-in, or coach voucher redemption.

## Priority 8: Calendar

Repository facts:

- `expo-calendar` is not installed.
- No native calendar APIs, ICS generation utilities, `.ics` files, or Add to Calendar helpers were found in the mobile app.
- Candidate date/time sources already exist in reservations, tournaments, community games, round robins, mini tournaments, and coach lessons/offers.

Recommendations:

- Use cases: court reservation, tournament registration, community game, round robin, mini tournament, and coach lesson/voucher scheduling.
- If native calendar is selected, this is a native change requiring a rebuilt dev client.
- Consider ICS/share as a JS/server alternative for some flows if native calendar permissions feel too heavy.

## Priority 9: Apple Sign-In

Repository facts:

- `supabase/config.toml` enables `[auth.external.apple]` with env-backed client ID/secret.
- No `expo-apple-authentication` dependency was found.
- No Apple Sign-In UI, nonce generation, identity-token handling, native entitlement, or Apple-specific account linking code was found.
- No Apple Sign-In testing evidence was found.

Recommendations:

- Treat Supabase Apple provider config as server-side readiness only.
- Add native client support and entitlement in a dedicated phase.
- Externally verify Apple Services ID, bundle ID, redirect URL, Supabase Dashboard provider settings, and account-linking policy.

## Priority 10: Native Share

Repository facts:

- React Native `Share.share` is widely used for stats, marketplace, wallet, players, groups, quick games, round robins, mini tournaments, tournament results, and other flows.
- `apps/mobile/src/lib/tournamentReport.ts` uses `expo-sharing` and `expo-file-system` to export/share tournament roster CSVs.
- Some share messages use custom scheme links such as `dreambreaker://groups/${id}`; other flows use plain text only.
- Web has a separate share button implementation in `web/src/components/shared/share-button.tsx`.

Recommendations:

- Share is ready for real-device testing.
- Later, standardize canonical URLs and fallback web routes so shared links work for both installed and non-installed users.
- Candidate improvements: booking confirmation share, coach offer share, marketplace listing share, profile/group invite links, and tournament deep links.

## Priority 11: Photos / Media

Repository facts:

- Native media packages installed: `expo-image-picker`, `expo-image-manipulator`, `expo-document-picker`, and `expo-file-system`.
- `apps/mobile/app.config.js` configures image picker permission descriptions, currently framed around sending chat photos.
- `apps/mobile/src/lib/media/imagePipeline.ts` is the central validate/transform/compress/upload entry point.
- `apps/mobile/src/lib/media/imageStandards.ts` defines standards for avatar, chat, tournament cover, facility, facility asset, marketplace, coach offer, and story images.
- Implemented pipeline categories include `avatar`, `facilityAsset`, `marketplace`, and `coachOffer`; several other categories are declared but intentionally disabled.
- `apps/mobile/src/lib/attachmentPicker.ts` separately supports chat/support attachments through ImagePicker and DocumentPicker.

Recommendations:

- Preserve ImagePipeline as the architecture for uploads. Do not create new ad hoc upload paths.
- Broaden iOS permission copy before production because camera/photos are used beyond chat: support attachments, profile avatars, marketplace listings, coach offers, facility assets, groups, and event images.
- Finish disabled categories through the pipeline rather than bypassing it.

## Priority 12: Location

Repository facts:

- `expo-location` is installed and configured with `locationWhenInUsePermission`.
- `apps/mobile/src/lib/location.ts` requests foreground permissions, uses last known/current balanced accuracy, and falls back to Lakewood Ranch coordinates.
- `apps/mobile/src/hooks/useLocationSettings.ts` stores location/discovery preferences in Supabase `location_settings` with SecureStore cache and default fallback.
- Location supports facility discovery, nearby games, booking search, Partner Finder-like radius preferences, onboarding, and location settings.
- No background location permission or task manager usage was found.

Recommendations:

- Do not enable background location for current features.
- Real-device testing should cover permission granted, denied, approximate location, precise location, cold start, location disabled at OS level, and fallback behavior.
- Future fitness/geofencing would require a separate background-location review and App Store purpose justification.

## Priority 13: App Lifecycle / Offline Behavior

Repository facts:

- `apps/mobile/src/lib/supabase.ts` uses `AppState` to start auth auto-refresh in foreground and stop it in background on native.
- Auth/session data is stored in SecureStore on native.
- `apps/mobile/src/hooks/useLocationSettings.ts` uses SecureStore cache and Supabase write-through, providing some offline resilience for preferences.
- Payment flows rely on server-authoritative webhook finalization and client polling for confirmation.
- Booking wizard state in `apps/mobile/src/lib/bookingStore.ts` is session-local; durable state starts after reservation creation.
- No NetInfo dependency or global offline queue was found.

Recommendations:

- Add real-device tests for app background/resume during OAuth, during PaymentSheet, after creating a reservation hold, and while network is unavailable.
- Consider adding network state only when designing offline UX; do not add it just for the audit.
- For booking, future implementation should recover existing held reservations from Supabase when a payment or app session is interrupted.

## Priority 14: Crash Reporting / Analytics

Repository facts:

- No Sentry, PostHog, Crashlytics, Segment, or similar production analytics/crash package was found in `apps/mobile/package.json`.
- `apps/mobile/src/lib/support/supportAnalytics.ts` explicitly says no analytics SDK exists and logs only in `__DEV__`.
- `apps/mobile/src/lib/support/supportDiagnostics.ts` collects app version, build number, platform, OS version, device model, recent route history, and last support error for explicit support ticket submission.
- Console logging is used in several services for warnings/errors.

Recommendations:

- Current telemetry is development/support-oriented, not production crash reporting.
- Choose one production vendor later and wire it through existing support analytics/diagnostics seams.
- Avoid capturing message bodies, private profile data, or payment details in analytics/error payloads.

## Priority 15: Notification Badges / In-App Notifications

Repository facts:

- In-app notification center exists at `apps/mobile/src/app/invites.tsx`, backed by `apps/mobile/src/lib/supabase/notifications.ts`.
- Header and slide menu show unread notification/message badges from `apps/mobile/src/hooks/useUnreadCounts.ts`.
- Chat mute/archive state is stored in `conversation_participant_settings` and used by unread count logic.
- `apps/mobile/src/app/notifications-settings.tsx` displays badge preferences but does not persist or apply them.
- No native app icon badge API usage was found.

Recommendations:

- Push should complement the current in-app notification table and unread counters, not create a parallel notification store.
- First push phase should deliver a message push and rely on existing in-app unread state for the visible app UI.
- Native badge count can wait until the `expo-notifications` implementation is stable.

## Priority 16: Account & Security Native Features

Repository facts:

- `expo-secure-store` is installed and configured.
- `apps/mobile/src/lib/supabase.ts` stores Supabase auth through SecureStore on native and localStorage on web.
- `apps/mobile/src/lib/localPrefs.ts` uses SecureStore for local preferences on native.
- No `expo-local-authentication` or biometrics code was found.
- Logout only calls `supabase.auth.signOut()`; it does not clean up device push tokens because client push registration is not implemented yet.

Recommendations:

- Keep SecureStore as the current token/session storage.
- Add push token cleanup on logout when push registration is implemented.
- Treat Face ID/biometric lock as a separate product/security decision, not a prerequisite for launch.

## Priority 17: Accessibility

Repository facts:

- Some screens use `hitSlop` for small controls, but accessibility labels/roles are not consistently present across icon-only buttons.
- No systematic reduced-motion handling was found for animations/haptics.
- React Native text generally supports font scaling by default unless disabled, but no full Dynamic Type audit was performed.

Recommendations:

- Major first-pass fixes later: add `accessibilityLabel` and `accessibilityRole` to icon-only controls, verify 44x44 touch targets, test VoiceOver on auth/onboarding/booking/payment/chat, and provide reduced-motion fallbacks for decorative animations.
- Do not rely on haptic feedback as the only success/error confirmation.

## Priority 18: Future Native Capabilities

Live Activities:

- No ActivityKit/Live Activities integration was found.
- Future fit: upcoming court booking status, tournament status, active match/game information.
- Current reservation/tournament/match domain models look directionally compatible, but Live Activities require native modules/entitlements and a strict update model.

HealthKit:

- No HealthKit integration was found.
- Future fit: pickleball session tracking, fitness metrics, activity integration, and possibly PAR-related context if the product spec approves such data.
- No current architecture blocker was found, but HealthKit should wait until My Stats/PAR specifications explicitly approve the data use.

## Build Impact

JS-only or likely no native rebuild:

- Central haptic utility using already-installed `expo-haptics`.
- Share message/URL improvements using existing `Share.share` and `expo-sharing`.
- Notification data routing table after `expo-notifications` is already in the dev client.
- Notification preference persistence if implemented only in Supabase/JS.
- Accessibility labels, roles, touch targets, and reduced-motion settings.
- OAuth test/fix work that does not change scheme, plugins, or entitlements.

Native change requiring a new EAS development build:

- Add `expo-notifications` and notification plugin/config.
- Add or re-enable Stripe plugin and Apple Pay merchant identifier.
- Add Apple Sign-In package/entitlement.
- Add Associated Domains for Universal Links.
- Add `expo-camera` for QR scanning.
- Add `expo-calendar` for native calendar access.
- Add biometrics through `expo-local-authentication`.
- Add production crash/analytics SDK if the chosen vendor requires native config.
- Add Apple Maps/MapKit through `expo-maps` or another native package.

Recommended bundle for the next native build:

- `expo-notifications`.
- Stripe plugin with real merchant identifier.
- Apple Sign-In package/entitlement if sign-in is part of the same test push.
- Associated Domains only if Universal Links are ready to verify.
- Avoid bundling QR/calendar/biometrics unless those phases are ready; each adds permission/config surface.

## Push Notification Implementation Readiness

1. What already exists?

- `public.push_tokens` table with multi-device primary key and owner RLS.
- `public.notifications` in-app notification table and mobile fetch/mark-read service.
- `useUnreadCounts` Realtime unread counters for messages and notifications.
- `notify_new_message()` trigger that resolves recipients, respects chat mute state, and calls `send-message-push`.
- `supabase/functions/send-message-push/index.ts` Expo push relay.
- Setup task logic that already treats a registered push token as the completion signal.

2. What is missing?

- `expo-notifications` dependency/config/plugin.
- Native permission request flow.
- Expo push token retrieval.
- Client upsert/delete for `push_tokens`.
- Foreground notification presentation policy.
- Background/tap notification listener.
- Route mapping from notification data to app screens.
- APNs/EAS push credential verification.
- Invalid token cleanup and receipt handling.
- Logout/device token cleanup.
- Persisted notification preferences beyond chat mute.

3. What database/server infrastructure should be reused?

- Reuse `push_tokens`, `notifications`, `conversation_participant_settings`, `notify_new_message()`, and `send-message-push`.
- Reuse `useUnreadCounts` and `fetchNotifications` for in-app state.
- Reuse existing conversation IDs/message IDs in push payload data.

4. Is an APNs/Expo push credential already configured?

- **NEEDS EXTERNAL VERIFICATION.** No APNs key/certificate or EAS credentials are visible in the repo. That is expected because credentials are normally stored in Apple/EAS, not committed.

5. Is a notification/device-token table needed, or does an equivalent already exist?

- An equivalent already exists: `public.push_tokens`.
- It supports multiple devices per user via `(user_id, expo_push_token)`.

6. What is the smallest safe schema change, if any?

- Likely none for the first delivery test.
- A later cleanup phase may add optional device metadata (`device_id`, app version, last_seen_at, disabled_at, receipt error) but the first test can use the existing table.

7. What is the smallest client implementation?

- Add `expo-notifications`.
- On signed-in native devices, request permission, get Expo push token, and upsert into `push_tokens` with platform.
- Register foreground and response listeners.
- On notification tap with `conversationId`, navigate to `/conversation/[id]`.
- Delete the current token on logout if known.

8. What is the smallest server implementation?

- Reuse existing message trigger and `send-message-push`.
- Only adjust server code if testing shows current relay authentication/config or payload shape is broken.
- Defer receipt polling/cleanup until the first delivery path is proven.

9. What is the easiest notification event for the first real-device test?

- **Message received** is the best first transactional test because the server trigger and relay already exist.
- Test with two signed-in users/devices: user A sends user B a conversation message; B receives push.

10. Will implementing push notifications require a new EAS development build?

- Yes. Adding `expo-notifications` and native notification config requires rebuilding the development client.

11. What exact test proves push works end-to-end?

- Build/install the new EAS development client on an iPhone.
- Sign in as user B and accept notification permission.
- Verify `push_tokens` contains B's Expo push token.
- Sign in as user A on another device/session and send B a conversation message.
- Confirm `notify_new_message()` calls `send-message-push` and Expo accepts the payload.
- Confirm B receives the notification while app is backgrounded.
- Tap the notification.
- Confirm the app opens and routes to the correct conversation.
- Confirm unread counts/in-app notification state remain consistent with the existing app UI.

12. What should explicitly NOT be built in the first push-notification phase?

- Do not build a second notification table.
- Do not replace the in-app notification center.
- Do not implement marketing/bulk notifications.
- Do not implement quiet hours/category preferences before basic delivery works.
- Do not add background location.
- Do not add native app icon badges until basic push routing is stable.
- Do not build a separate server dispatcher unless `send-message-push` cannot support the first message test.
- Do not encode or print secrets in repo files.
