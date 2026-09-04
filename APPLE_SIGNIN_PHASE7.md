# APPLE_SIGNIN_PHASE7.md

> Status: **Implemented and working on a physical iPhone.** EAS iOS development build succeeded with the Apple entitlement embedded; native Apple sign-in completed end-to-end and was independently verified server-side (a real `auth.identities` row with `provider = 'apple'` exists, with a populated profile name). Several granular scenarios (cancel, Hide My Email, sign-out/re-login, Google/email regression, cold start) were **not** individually exercised — see "Physical iPhone Tests" for exactly what was and wasn't confirmed.
> Module: Native Capabilities Phase 7 — Sign in with Apple
> Date: 2026-08-15 (implementation) / 2026-08-15–16 (EAS build + physical-device validation)

## Audit

Confirmed the `NATIVE_CAPABILITIES_AUDIT.md` finding exactly: `supabase/config.toml`'s `[auth.external.apple]` block (`enabled = true`, env-backed `client_id`/`secret`) is server-side-only readiness — no `expo-apple-authentication` dependency, no Apple Sign-In UI, no nonce generation, no native entitlement, and no account-linking code existed anywhere in the repo before this phase (confirmed via search — zero matches for `AppleAuthentication`, `signInWithIdToken`, `applesignin`, or `expo-apple-authentication` outside `node_modules`).

Repository facts gathered before writing any code:
- **`apps/mobile/src/lib/auth.ts`**: the single auth service module. Exports `signIn`, `signUp`, `signInWithGoogle`, `requestPasswordReset`, `completePasswordRecovery`, `updatePassword`, `signOut`, `getSession`, `getUser`. `signInWithGoogle()` is the closest precedent — browser-redirect OAuth via `expo-auth-session`/`expo-web-browser`, returns `Session | null` (`null` = user cancelled the browser sheet), throws on real errors.
- **`apps/mobile/src/app/sign-in.tsx` / `sign-up.tsx`**: near-identical screens, each with an email/password form plus one `TouchableOpacity` "Continue with Google" button calling `signInWithGoogle()`/wiring into the same `router.replace(returnTo ?? '/(tabs)/profile')` post-auth destination.
- **`apps/mobile/app.json`**: `ios.bundleIdentifier: "com.dreambreakerpb.app"` (confirmed, used as-is — not changed).
- **`apps/mobile/app.config.js`**: dynamic config layering `app.json`, with `plugins` array (`expo-router`, `expo-splash-screen`, `expo-location`, `expo-image-picker`, `expo-camera`, `expo-notifications`, `@stripe/stripe-react-native`, `expo-dev-client`, etc.) — no Apple-related entry existed.
- **`supabase/migrations/20260725000000_baseline_from_prod.sql`**: `fn_handle_new_user()` trigger (fires on any `auth.users` insert, any provider) creates the matching `profiles` row: `full_name` = `coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))`. This runs identically regardless of which provider created the `auth.users` row — no Apple-specific server code needed or added.
- **`apps/mobile/src/hooks/useSession.ts`**: one app-lifetime `supabase.auth.onAuthStateChange` subscription backing `useSession()` everywhere. Apple sign-in needs no changes here — a session established via `signInWithIdToken()` fires the same `SIGNED_IN` event as password/Google sign-in.
- **`apps/mobile/src/app/(tabs)/profile.tsx`**: the existing onboarding-completeness gate (routes incomplete profiles into `/onboarding`). Both `signIn.tsx` and `sign-up.tsx` already route to `/(tabs)/profile` (or `returnTo`) after successful auth and let this screen decide whether onboarding is needed — Apple sign-in reuses this exact same post-auth destination, no special-casing.
- **`apps/mobile/src/lib/services/profile.ts`**: `updateProfile(userId, { full_name, ... })` already exists and is reused as-is for the one-time Apple name backfill — no new profile-write path created.

No repository facts differed from the audit's prior findings; nothing needed correcting before implementation.

## Existing Auth Architecture Reused

- **Supabase Auth**: `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })` — the same `supabase` client instance (`apps/mobile/src/lib/supabase.ts`) used by every other auth method. No second client, no second session object.
- **SecureStore**: session persistence is Supabase's own (`supabase.ts` configures `expo-secure-store` as the auth storage adapter on native). Apple sign-in writes nothing to SecureStore itself — `signInWithIdToken()`'s returned session is persisted by the exact same mechanism as a password or Google session.
- **Onboarding**: no changes to `apps/mobile/src/app/onboarding/**` or the `(tabs)/profile.tsx` completeness gate. Apple sign-in routes to `router.replace(returnTo ?? '/(tabs)/profile')` (sign-in) / `router.replace('/(tabs)/profile')` (sign-up) — identical to the existing Google handlers.
- **Sign-out**: `signOut()` in `auth.ts` was **not modified** — still calls `deleteCurrentDevicePushToken(user.id)` before `supabase.auth.signOut()`, regardless of which provider the session came from. Sign in with Apple has no separate "sign out of Apple" call anywhere (Step 19 — not implemented, intentionally).
- **Google/email auth**: `signIn()`, `signUp()`, `signInWithGoogle()`, and their call sites were not touched beyond adding new, separate code paths alongside them.

## Files Changed

**New:** none (no new files — everything is an addition to existing files, per Step 6's "do not place the entire flow inside sign-in.tsx" being satisfied by extending the existing `auth.ts` service rather than creating a new module).

**Modified:**
- `apps/mobile/package.json` / `package-lock.json` — added `expo-apple-authentication` (via `npx expo install`). Also proactively fixed the same recurring `@emnapi/*` lockfile-drift issue documented in Phases 5/6 (full `node_modules`/lockfile regeneration, verified with `npm ci --dry-run`) before it could break a future EAS build.
- `apps/mobile/app.config.js` — added `'expo-apple-authentication'` to the `plugins` array (see "Apple Native Configuration"). No other plugin entries, Associated Domains, or existing config changed.
- `apps/mobile/src/lib/auth.ts` — added `signInWithApple()`.
- `apps/mobile/src/app/sign-in.tsx` — added the native Apple button, `handleAppleSignIn()`, and an availability check.
- `apps/mobile/src/app/sign-up.tsx` — added the native Apple button, `handleAppleSignUp()`, and an availability check.

**Follow-up pass (onboarding wiring — see "Onboarding Apple Path" below):**
- `apps/mobile/src/app/onboarding/create-account.tsx` — the Apple button now actually authenticates; Apple/Google share one branch; button hidden when Apple auth is unavailable; success/error haptics added.
- `apps/mobile/src/lib/onboarding/finalize.ts` — stale "Apple Sign-In isn't available yet" guard repurposed into a genuine session-loss message covering both OAuth providers.
- `apps/mobile/src/lib/onboarding/components.tsx` — restored haptics dropped during the Phase 3 migration, and made option selection fire only on an actual change.

No other files were touched. `expo-calendar`, `expo-camera`, push notification routing, Stripe, and every unrelated screen were not modified.

## Native Dependency

`expo-apple-authentication@~8.0.8`, installed via `npx expo install expo-apple-authentication` (SDK-resolved for this project's Expo SDK 54.0.0, not hand-pinned).

The package's JS API (`isAvailableAsync`, `signInAsync`, `AppleAuthenticationButton`, etc.) is safe to import unconditionally on every platform — verified by reading `expo-apple-authentication/build/AppleAuthentication.js`: `isAvailableAsync()` returns `false` (not a throw) when the native binding is absent (Android/web), and `signInAsync()` only throws `UnavailabilityError` if actually *called* on an unsupported platform. Because `auth.ts`, `sign-in.tsx`, and `sign-up.tsx` all gate on `isAvailableAsync()`/an `appleAvailable` state before ever calling `signInAsync()` or rendering `AppleAuthenticationButton`, no `.native`/`.web` platform-split file (the pattern used for `expo-calendar`/`expo-camera`) was needed here — a plain cross-platform import is sufficient and simpler.

## Apple Native Configuration

- **Bundle ID**: `com.dreambreakerpb.app` (`apps/mobile/app.json`, unchanged — used as-is per Step 3's instruction).
- **Entitlement**: `expo-apple-authentication`'s config plugin (`node_modules/expo-apple-authentication/plugin/src/withAppleAuthIOS.ts`) adds `com.apple.developer.applesignin = ['Default']` to the generated iOS entitlements file, plus `CFBundleAllowMixedLocalizations = true` (needed for the native button's localized text). Registered by adding `'expo-apple-authentication'` to `app.config.js`'s `plugins` array — confirmed by reading the plugin source directly rather than assuming; this is a required **capability declaration**, not an OS permission prompt, so (unlike `expo-calendar` in Phase 6) it is registered unconditionally.
- **`app.config.js` diff**: one new array entry (`'expo-apple-authentication'`, with an inline comment explaining the entitlement and why it's unconditional) placed after the existing `@stripe/stripe-react-native` entry, before `expo-dev-client`. Associated Domains, push notification config, camera, calendar, Google Maps keys, and Stripe config are all byte-for-byte unchanged.

## Apple Developer Status

**CONFIRMED.**

Originally reported as NEEDS MANUAL VERIFICATION (this session has no Apple Developer Portal access). Now resolved by two pieces of hard evidence rather than assumption:

1. The EAS iOS build's Xcode log shows the entitlement actually embedded in the signed artifact:
   ```
   "application-identifier" = "<TEAM_ID>.com.dreambreakerpb.app";
   "com.apple.developer.applesignin" = ( Default );
   "com.apple.developer.associated-domains" = ( "applinks:pickleballapp.app" );
   ```
   A provisioning profile that lacked the Sign in with Apple capability would have failed `ProcessProductPackaging` outright, not signed successfully.
2. Native Apple sign-in then completed on the physical device and produced a real Supabase session — which cannot happen if the capability is absent.

EAS's automatic credential management evidently synced the capability to the App ID when it detected the entitlement in `app.config.js`; no separate manual portal step was needed for this build. Associated Domains survived the change unchanged, as intended.

## Supabase Apple Provider

Current status, without exposing any secret values:

- `supabase/config.toml`'s `[auth.external.apple]` block: `enabled = true`, `client_id` and `secret` both sourced from environment variables (`SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`) — **not recreated, not modified, no values read or printed.**
- This `client_id`/`secret` pair is Apple's **Services ID + private-key-signed JWT** configuration, the credential shape needed for the **browser-redirect OAuth flow** (`supabase.auth.signInWithOAuth({ provider: 'apple' })` — the same pattern this app already uses for Google). This phase does **not** use that flow.
- **This phase uses `supabase.auth.signInWithIdToken()` instead** — Supabase validates the native Apple identity token directly. For that path to succeed, the Supabase Dashboard's Apple provider settings need the app's **bundle identifier** (`com.dreambreakerpb.app`) present in the provider's separate "Authorized Client ID(s)" field (a native-token-audience allowlist, distinct from the web `client_id`/Services ID above). This is a Supabase **Dashboard-only setting** — not exposed in `config.toml`, and no available Supabase MCP tool reads Auth provider configuration.
- **Status: CONFIRMED WORKING (inferred from behavior, not from reading the setting).** Originally flagged NEEDS MANUAL VERIFICATION. `signInWithIdToken()` succeeded on the physical device and produced a real session — Supabase rejects the token outright if the bundle identifier is not in the Authorized Client IDs allowlist, so this setting is necessarily correct in the Dashboard today. The setting itself still cannot be *read* from this session; if the native flow ever breaks after a Dashboard change, this is the first field to re-check.
- No credentials were committed, printed, or logged at any point in this phase.

## Authentication Flow

```
User taps native "Sign in with Apple" / "Sign up with Apple" button
  -> AppleAuthentication.isAvailableAsync() already confirmed true (button only renders when so)
  -> signInWithApple() [apps/mobile/src/lib/auth.ts]
     -> generate rawNonce (Crypto.randomUUID()) + hashedNonce (SHA256 of rawNonce)
     -> AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: hashedNonce })
        -> native Apple sheet opens, user authenticates (or cancels)
     -> credential.identityToken required; throws if absent
     -> supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce })
        -> Supabase verifies the JWT against Apple's public keys, hashes rawNonce and compares
           to the token's nonce claim, creates/restores the auth.users row
     -> fn_handle_new_user() trigger (unchanged, provider-agnostic) creates the profiles row
        on first sign-in, exactly as it does for Google/email
     -> if credential.fullName present (first authorization only): updateProfile(userId, { full_name })
        one-time backfill, non-fatal if it fails
  -> returns the Supabase Session (or null on cancel) to the screen
  -> screen: haptics.success() + router.replace(returnTo ?? '/(tabs)/profile')
     -> existing (tabs)/profile.tsx onboarding-completeness gate takes over normally
```

Apple credential → Supabase remains the only trusted path. No client-side JWT decoding, no custom validation, no separate token storage — matches Step 7 exactly.

## Name / Email Handling

- **First authorization**: if `credential.fullName` is non-null (only true the very first time a given Apple ID authorizes this app), `AppleAuthentication.formatFullName()` renders it to a display string, and `updateProfile(userId, { full_name: displayName })` writes it — reusing the existing profile-update path, not a new one. Guarded with a truthiness check so an all-null `fullName` object (user denied the scope) never writes an empty string.
- **The same name is also mirrored into `auth.users.user_metadata`** (`full_name`, plus `given_name`/`family_name` when Apple supplies them) via `supabase.auth.updateUser()`. Rationale: Apple's identity token carries only `email` — the name exists *solely* on that one-time credential — whereas Google's OAuth flow already deposits those exact keys into `user_metadata`. Without mirroring, anything reading `user_metadata` sees a name for Google users but never for Apple ones. Onboarding's `create-account.tsx` reads precisely those keys to prefill the "Your Name" step, so this makes the Apple path work there with **zero** provider-specific branching in that screen, and makes the name durable in `auth.users` — which matters because Apple never returns it again on subsequent sign-ins. Both writes are non-fatal on failure (the session is already established by that point).
- **Subsequent sign-ins**: `credential.fullName` is `null` — the `if (credential.fullName)` block is skipped entirely, so **nothing is written**. The profile keeps whatever name it already has (either the one-time Apple backfill from before, or `fn_handle_new_user()`'s email-local-part fallback if the backfill never ran or failed). Blank/null is never written over an existing name — satisfies Step 9 exactly.
- **Hide My Email**: handled with zero extra code. Apple's private relay email arrives as `auth.users.email` (from the identity token's `email` claim) the same way any email does; `fn_handle_new_user()` already stores `new.email` verbatim with no validation or transformation that would reject an `@privaterelay.appleid.com` address. No personal Apple email is ever required.

## Account Linking Behavior

**Observed, not invented**: no custom account-linking code exists anywhere in this repository (`supabase/migrations/` and `supabase/migrations_legacy/` contain zero references to `link_identity`, manual identity merging, or any Apple/Google/email collision handling). Account-linking behavior is therefore governed entirely by **Supabase's platform-level setting**, and this phase deliberately builds no client-side merging or collision detection, per Step 14.

**Behavior is now CONFIRMED by direct observation** (originally NEEDS MANUAL VERIFICATION). Querying `auth.identities` for the test account after the physical Apple sign-in returned three identities on a **single** user id:

| provider | created | note |
| --- | --- | --- |
| `email` | 2026-06-13 | original account |
| `google` | 2026-08-02 | linked to the same user |
| `apple` | 2026-08-15 | linked to the same user |

So **automatic identity linking by verified email is enabled on this project**: signing in with Apple using an email that matches an existing account attaches a new identity to that existing user rather than creating a duplicate. No second/duplicate user was created (only one `apple` identity exists project-wide, and it belongs to the pre-existing June account).

Two implications worth being explicit about:

- This is the desirable behavior for the common case (same person, different sign-in button) and satisfies Test 3's "no duplicate user" requirement for the collision path specifically.
- It is also a **security-relevant setting**, not just a convenience one: automatic linking trusts the provider's asserted email. It is safe with Apple and Google (both verify email), but this project should not enable an identity provider that returns unverified emails without revisiting this. Flagged rather than changed — no linking configuration was modified by this phase.

## EAS Build

**PASS.** A new EAS iOS development build (`eas build --profile development --platform ios`) succeeded on the first attempt and installed on the physical iPhone, with `com.apple.developer.applesignin` present in the signed entitlements (see "Apple Developer Status").

Notably, the recurring `@emnapi/*` lockfile-drift failure — which broke the EAS install phase twice in Phase 5 and once in Phase 6 — did **not** recur, because it was pre-empted rather than discovered after the fact: `node_modules`/`package-lock.json` were regenerated and `npm ci --dry-run` (EAS's exact install command) verified clean locally *before* the build was queued. That turned a previously three-attempt failure mode into a first-try success.

## Physical iPhone Tests

Tested on a physical iPhone against the new EAS development build. The device owner reported "phase 7 works"; that general confirmation covers the core flow (Tests 1–2), and the rows below distinguish it from the granular scenarios that were **not** individually exercised. Where possible the result was independently verified server-side this session rather than taken on report alone.

| Test | Status |
| ---- | ------ |
| Test 1 — Apple Button renders correctly | **PASS** — user-confirmed (the flow could not have been reached otherwise) |
| Test 2 — New Apple User (sheet opens, auth succeeds, session exists) | **PASS** — user-confirmed **and independently verified**: an `auth.identities` row with `provider = 'apple'` exists with a matching `last_sign_in_at`, on a user with a non-null email and a populated `profiles.full_name` |
| Test 3 — Returning Apple User (same account reused, no duplicate) | **PARTIAL** — the collision case is confirmed (the Apple identity attached to the pre-existing June account instead of creating a duplicate; only one `apple` identity exists project-wide — see "Account Linking Behavior"). A full sign-out → sign-in-again cycle was not separately reported. |
| Test 4 — Cancel (no account/session created, no scary error) | NOT TESTED (not individually reported) |
| Test 5 — Hide My Email (relay email accepted) | NOT TESTED — **verified server-side that this path was not exercised**: the stored email is not an `@privaterelay.appleid.com` address, so the real Apple email was used |
| Test 6 — Name Handling (first-auth name used, later logins don't erase it) | **PARTIAL** — `profiles.full_name` is populated for the Apple user, so the first-authorization name write worked. The "later login does not blank it" half is untested (it needs a second sign-in, where `credential.fullName` is `null`). |
| Test 7 — Sign Out / Re-login (push-token cleanup still works, Apple re-login succeeds) | NOT TESTED (not individually reported) |
| Test 8 — Google Regression | NOT TESTED this pass (`signInWithGoogle()` and both call sites are byte-for-byte unchanged — see "Regression Tests") |
| Test 9 — Email Regression | NOT TESTED this pass (`signIn()`/`signUp()` unchanged) |
| Test 10 — Cold App Start (session persists) | NOT TESTED (not individually reported) |

### Re-test steps (once a new EAS dev build exists and Apple Developer / Supabase Dashboard items above are confirmed)

1. Build and install: `cd apps/mobile && eas build --profile development --platform ios`, install on device.
2. Open sign-in screen → confirm the native black "Sign in with Apple" button renders below the divider, above "Continue with Google."
3. Tap it with an Apple ID that has never authorized this app (or one whose access was previously reset via Settings → Apple ID → Sign in with Apple → app list → remove) → confirm the native sheet opens, authenticate, confirm you land on `(tabs)/profile` and onboarding begins for a genuinely new account.
4. Sign out (confirm push-token cleanup log/behavior unaffected), sign in with Apple again with the same Apple ID → confirm you land back in the same account, not a new one.
5. Start Apple sign-in, tap Cancel → confirm no alert, no crash, sign-in screen still usable, no haptic fired.
6. If practical, test with "Hide My Email" selected during the *first* authorization → confirm sign-in still succeeds and the account's email is the private relay address.
7. On the first-ever authorization, confirm Apple's provided name appears in the profile; sign out and back in again → confirm the name is still there (not blanked).
8. Verify Google sign-in and email/password sign-in both still work unchanged (Tests 8–9).
9. Force-quit and reopen the app after an Apple sign-in → confirm the session is still active (Test 10).

## Regression Tests

- `npx tsc --noEmit`: clean (0 errors) in `apps/mobile`.
- `npx eslint` on every changed file (`auth.ts`, `sign-in.tsx`, `sign-up.tsx`, `app.config.js`): 0 errors, 0 warnings introduced.
- **Google OAuth**: `signInWithGoogle()` and both call sites (`sign-in.tsx`'s `handleGoogleSignIn`, `sign-up.tsx`'s `handleGoogleSignUp`) are byte-for-byte unchanged — confirmed by diff review, not just assumption.
- **Email auth**: `signIn()`/`signUp()` and their call sites are unchanged.
- **Push-token cleanup**: `signOut()` in `auth.ts` is unchanged.
- **Universal Links / deep links**: no file under `externalRouting.ts`, `appLinks.ts`, or the Associated Domains config was touched.
- Not yet verified on a physical device or a real build — see "Physical iPhone Tests."

## Deferred Work

Resolved since the first draft (kept here so the change in status is traceable): physical validation, the Apple Developer capability, the Supabase Authorized Client IDs, and the identity-linking behavior were all open questions and are now confirmed — see their respective sections.

Genuinely outstanding:

- **The onboarding Apple path needs a device test** now that it's wired (sign up with Apple *through onboarding*, not the standalone sign-in screen). Note this is only fully observable with an Apple ID that has **not** previously authorized the app — Apple returns `fullName` exactly once per Apple ID, so the name-prefill half cannot be re-tested on an already-authorized account without first revoking access in **Settings → Apple ID → Sign in with Apple → DreamBreaker → Stop Using Apple ID**.
- **Granular device scenarios not individually exercised**: cancel (Test 4), Hide My Email (Test 5), the "second login must not blank the name" half of Test 6, sign-out/re-login with push-token cleanup (Test 7), and cold-start session persistence (Test 10).
- **Google/email auth regression not re-run on device** (Tests 8–9). Both code paths are provably unchanged, but they share the auth screens that this phase edited, so a smoke test is still worth doing.
- **Onboarding Apple path — RESOLVED in a follow-up pass** (was: the `create-account.tsx` button never called `signInWithApple()`, so users only discovered the failure at the end of onboarding via `finalize.ts`'s "Apple Sign-In isn't available yet"). Both OAuth providers now authenticate for real on that screen before onboarding advances, and Apple's captured name flows into the "Your Name" prefill through `user_metadata`. **Not yet device-tested** — see the re-test note below.
- **Password-length inconsistency** (pre-existing, noticed during the audit, not introduced here): `sign-up.tsx` validates a 6-character minimum while `supabase/config.toml` sets 8, so a 6–7 character password fails server-side after passing client validation. Not a security hole, just an avoidable error message.
- Android Apple sign-in — explicitly out of scope per Step 20, not implemented.
- Apple web OAuth — explicitly out of scope per Step 20/"Do Not Implement," not implemented; the existing Apple *browser-redirect* OAuth provider config in `supabase/config.toml` remains unused by the client on any platform, exactly as it was before this phase.
