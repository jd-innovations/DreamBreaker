# Google Sign-In — Audit & Implementation Plan

> Last updated: 2026-08-05
> Status: **Google OAuth implemented and wired (steps 1–4, 2026-08-02).
> Onboarding-to-Supabase wiring done (2026-08-05) — both the email and
> Google paths now actually create an account and write the full onboarding
> draft to `profiles`. Apple Sign-In remains an intentional stub (out of
> scope). Real-device testing (step 7) still not done by anyone.

---

## Audit summary (verified against source, not assumed)

| Layer | State | Evidence |
|---|---|---|
| "Continue with Google" button | **UI stub, does nothing real** | `apps/mobile/src/app/onboarding/create-account.tsx:20-42` — `chooseProvider('google')` never calls any OAuth API. It calls `getUser()` (reads whatever session already exists, normally `null`), reads metadata off it, then unconditionally routes to `/onboarding/your-name`. |
| OAuth client libraries | **Not installed** | `apps/mobile/package.json` has no `expo-auth-session`, `@react-native-google-signin/google-signin`, `expo-apple-authentication`, `expo-crypto`. `expo-web-browser` is installed but unused for auth (zero references to `WebBrowser`/`signInWithOAuth` in `src/`). |
| Supabase client config | **Blocks redirect-based OAuth as-is** | `apps/mobile/src/lib/supabase.ts:35` — `detectSessionInUrl: false`. A redirect-based flow needs the callback URL manually caught and exchanged via `supabase.auth.exchangeCodeForSession()`. |
| Auth state listener | **Not present** | No `onAuthStateChange` subscription anywhere in `src/`; routing is done by manual guard checks in `apps/mobile/src/lib/authGuard.ts`. |
| Supabase Auth provider config (local) | **Declared in local dev config** | `supabase/config.toml:46-54` — `[auth.external.google]` and `[auth.external.apple]` both `enabled = true`, referencing env vars `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/`_SECRET`. **Unverified: this is the local `supabase start` config only — not proof the hosted project (`dreambreaker-pb`) has Google enabled in its Auth dashboard with real credentials.** Must be checked/set separately. |
| App scheme / bundle IDs (needed for OAuth client setup) | **Present** | `apps/mobile/app.json` — `scheme: "dreambreaker"`, iOS bundle ID and Android package both `com.dreambreakerpb.app`. |
| New-user DB trigger | **Drops avatar_url; only sets a few fields** | `supabase/migrations/20260725000000_baseline_from_prod.sql:1296-1324`, `fn_handle_new_user()` — inserts only `id, email, full_name, role, is_director, director_status` from `raw_user_meta_data`. No `avatar_url`, no given/family name. |
| Onboarding draft avatar/provider fields | **Defined but dead — never consumed** | `apps/mobile/src/lib/onboarding/state.tsx:14-15,51-52` — `avatarUrl` / `providerSubject` exist on the draft type and are set by the stub, but grepping the rest of `src/lib/onboarding` shows no other read of either field. They go nowhere. |
| Avatar upload pipeline | **Exists, reusable** | `apps/mobile/src/lib/media/` (imagePipeline/upload) + `apps/mobile/src/lib/services/profile.ts:38-58` — manual picker → transform → upload → `update({ avatar_url })`. This is the P0 avatar flow (see project memory); Google sign-in should feed this same column, not build a parallel path. |

**Bottom line:** nothing about Google Sign-In actually works today — it's UI-only. The Supabase backend is *pointed at* Google OAuth in local config, but the client never initiates the flow, the redirect can't be caught as configured, and even if it could, the new-user trigger would silently discard the Google profile photo.

---

## TODO — step by step (dependency order)

### 1. Google Cloud & Supabase provider setup (external, no code) — ✅ DONE 2026-08-02
- [x] Google Cloud OAuth Web client created, redirect URI registered.
- [x] Supabase dashboard (hosted `dreambreaker-pb`) → Authentication → Providers → Google: enabled with real Client ID/Secret.
- [x] **Verified independently** (not just self-reported): `curl https://fbzetvkbhneptvfruilw.supabase.co/auth/v1/settings` → `"external": { "google": true, ... }`. Confirms the provider is enabled with non-empty credentials on the live hosted project — not just local `config.toml` intent.
- Caveat: this confirms *enabled + configured*, not that the Client ID/Secret are valid — that's only fully proven by a real sign-in attempt once step 4's client code exists.
- iOS/Android native OAuth clients in Google Cloud were deliberately deferred — only needed if open question #1 (native SDK vs. browser-redirect) resolves toward native.

### 2. Client dependencies — ✅ DONE 2026-08-02
- [x] Installed via `npx expo install expo-auth-session` → resolved `expo-auth-session@~7.0.11` (SDK 54 compatible). Verified in `apps/mobile/package.json`.
- [x] `expo-web-browser@~15.0.11` and `expo-linking@~8.0.12` already present — no separate add needed.
- [x] `expo-crypto` not required as a direct dependency for this pattern (no PKCE code-exchange step in the verified flow — confirmed not added).
- [x] No Expo config plugin entry required for `expo-auth-session` at v54 (confirmed via docs.expo.dev/versions/v54.0.0/sdk/auth-session).

### 3. Supabase client changes — ✅ DONE 2026-08-02
- [x] **Correction to this doc, made before writing code**: Supabase's official native-mobile-deep-linking guide does NOT use `exchangeCodeForSession`. Verified pattern: `WebBrowser.openAuthSessionAsync(data.url, redirectTo)` → `QueryParams.getQueryParams(url)` (imported from `expo-auth-session/build/QueryParams` — a deep import, confirmed via the guide's verbatim code sample) → `supabase.auth.setSession({ access_token, refresh_token })`.
- [x] **Correction to this doc's audit**: an `onAuthStateChange` listener already existed — `apps/mobile/src/hooks/useSession.ts:41-49`, a single app-lifetime subscription backing a shared session store used by ~50 components. No new listener needed.
- [x] **Verified against real installed library source** (not assumed): `apps/mobile/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2949-2988` — `setSession()` calls `_notifyAllSubscribers('SIGNED_IN', session)` on success, confirming the existing `useSession.ts` listener will pick up the OAuth-created session automatically.
- [x] `detectSessionInUrl: false` left as-is — correct for this pattern, session is set explicitly via `setSession`, not auto-detected from a URL.

### 4. Implement the real sign-in flow — ✅ DONE 2026-08-02
- [x] Added `signInWithGoogle()` in `apps/mobile/src/lib/auth.ts` — `signInWithOAuth({ provider: 'google', skipBrowserRedirect: true })` → `WebBrowser.openAuthSessionAsync` → `QueryParams.getQueryParams` → `setSession`. Returns `null` (not a throw) if the user cancels/dismisses the browser sheet, so callers can distinguish cancellation from a real error.
- [x] Wired `apps/mobile/src/app/onboarding/create-account.tsx`'s `chooseProvider('google')` to call it. On cancel/error, stays on screen (alerts on error) instead of routing forward — the old code always routed forward via `finally`, which was fine for a no-op stub but wrong once failure is possible. `apple`'s branch is untouched, still the same stub as before (deferred — open question #2).
- [x] Added a **"Continue with Google" button to `apps/mobile/src/app/sign-in.tsx`** for returning users (previously email/password only), styled to match `create-account.tsx`'s existing button treatment (same page background color, coincidentally already shared between both screens).
  - Default assumption made and not re-confirmed (low-stakes, reversible): yes, Google should be usable from both onboarding *and* the sign-in screen — a user who signs up with Google must be able to sign back in with Google.
- [x] Verified: `npx tsc --noEmit` → exit 0, no errors. `npx eslint` on all three changed files → exit 0, no errors.

### 5. Database: capture full profile on first sign-in — ✅ DONE 2026-08-05
- [x] Migration `20260805000000_onboarding_profile_fields.sql`: `fn_handle_new_user()` now sets `avatar_url` from `coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture')`. `given_name`/`family_name` not captured as separate columns — `full_name` (first+last, editable during onboarding) already covers this; no profiles columns exist for the split name, and none were added since nothing consumes them separately.
- [ ] **Still not done** — confirming Supabase's Google provider actually populates `avatar_url` vs. `picture` in `raw_user_meta_data` requires a real sign-in test (see step 7). The `coalesce` covers both possibilities but which key actually fires is unverified.
- [x] Decided: store Google's photo URL as-is (`avatar_url` written directly, no re-upload through the media pipeline). Simpler path taken over the doc's original re-upload recommendation — acceptable since Google photo URLs are reasonably stable in practice; revisit if users report broken avatars from expired URLs.

### 6. Onboarding flow correctness — decided 2026-08-05
- [x] Decided (b): onboarding screens still ask, pre-filled from OAuth metadata where available (`your-name.tsx`'s existing empty-check pre-fill), rather than skipping them outright. No skip logic added. `providerSubject`/`avatarUrl` draft fields are no longer fully dead — `avatarUrl` now flows into `profiles.avatar_url` via `finalize.ts`; `providerSubject` is still unused (it's the OAuth user id, already available as `auth.uid()` server-side, so there's no gap here — it just isn't needed).

### 7. Testing
- [ ] Test on a real device (Expo Go can't handle native OAuth redirects reliably — likely needs a dev build; confirm which is required before testing).
- [ ] Verify: new Google sign-in creates a `profiles` row with `email`, `full_name`, and `avatar_url` all populated.
- [ ] Verify: returning Google user signs back in without creating a duplicate profile.
- [ ] Verify: existing email/password users are unaffected.

---

## Open questions to confirm before implementation
1. ~~Native Google Sign-In SDK vs. browser-redirect OAuth~~ — **RESOLVED 2026-08-02: browser-redirect (`expo-auth-session` + `signInWithOAuth`)**. No native iOS/Android OAuth clients or Android SHA-1 fingerprint needed.
2. Should Apple Sign-In be implemented in the same pass (its button has the identical dead-stub problem) or deferred? — **Deferred, out of scope as of 2026-08-05.** Its button in `create-account.tsx` is still a no-op stub. One new wrinkle: since `finalizeOnboarding()` now runs at the end of onboarding, a user who picks "Continue with Apple" and completes onboarding will hit an explicit **"Could not finish setup"** error (no session, no email/password to fall back to) instead of the previous silent no-op. Worth fixing loudly (better error copy) or implementing Apple for real before this ships.
3. ~~Re-host Google's avatar photo through the existing upload pipeline, or store the external URL directly?~~ — **RESOLVED 2026-08-05: store the external URL directly.** No re-upload pipeline integration built.

---

## Onboarding audit — the real prerequisite (added 2026-08-02)

**Finding: the onboarding flow does not talk to Supabase at all, for any auth method — this predates and is broader than the OAuth gap.**

Verified directly (`apps/mobile/src/lib/onboarding/state.tsx:6-8`, its own header comment): *"Local-only onboarding draft. Nothing here is written to Supabase in this pass — see DATA_GAPS.md."* Confirmed no `onboarding/*.tsx` file calls `supabase.auth.signUp` or writes to `profiles`. The flow (`welcome.tsx` → `self-rating.tsx` → `gender.tsx` → `area-recommendations.tsx` → `select-home-court.tsx` → [`review-court.tsx`] → `search-radius.tsx` → `enable-notifications.tsx` → `create-account.tsx` → [`email-account.tsx` | provider stub] → `your-name.tsx` → `brings-you-here.tsx` → `availability.tsx` → `date-of-birth.tsx` → `enable-location.tsx` → `playing-style.tsx` → `all-set.tsx` → `welcome-to-court.tsx`) collects 21 fields into `OnboardingDraft` and ends with a bare `router.replace('/')` — no account is ever created, no profile row is ever written.

**A second, unrelated real signup screen already exists**: `apps/mobile/src/app/sign-up.tsx` (full name/email/password → real `signUp()` → Supabase auth + email confirmation). It is **not reachable from onboarding** — `create-account.tsx`'s "Continue with Email" goes to `onboarding/email-account.tsx` instead, which only stores values in the draft.

**`apps/mobile/src/app/onboarding/DATA_GAPS.md`** (pre-existing, not written by this audit) already scopes most of the missing `profiles` columns: `gender`, `onboarding_intent`, a home-court FK. It does **not** mention `avatar_url` — confirmed via read, that gap was undocumented until this audit.

**Verified safe:** `your-name.tsx`'s pre-fill won't clobber OAuth-sourced names — `create-account.tsx:36-37` only sets `firstName`/`lastName` if currently empty.

**Why this matters for OAuth specifically:** Google/Apple sign-in creates a live Supabase session **immediately** (before onboarding finishes), while the email path currently creates nothing until a signup step that doesn't exist yet either. OAuth isn't slotting into a working submission flow — implementing it exposes that no submission flow exists for *either* path. Both need the same fix.

### TODO — onboarding-to-Supabase wiring (prerequisite to step 4 above) — ✅ DONE 2026-08-05

- [x] **`finalizeOnboarding()`** — `apps/mobile/src/lib/onboarding/finalize.ts`, called from `all-set.tsx`'s "Let's Go!" CTA (the true end of the flow). Checks `getSession()`: OAuth path → authenticated `updateProfile()`; no session (email path) → all fields ride into `signUp()`'s metadata instead of a separate write, since a mid-flow `signUp()` call still wouldn't yield a session under `enable_confirmations = true`. This is a deliberate deviation from the "move signup earlier" idea originally sketched here — one atomic write at the end, for both paths, was simpler than splitting account creation from the profile write.
- [x] **`profiles` columns** — `gender`, `onboarding_intent text[]` added in `20260805000000_onboarding_profile_fields.sql`. Home-court FK turned out to already exist (`home_court_id`) — `DATA_GAPS.md`'s claim otherwise was wrong/stale.
- [x] **`play_style` shape conflict** — resolved: store top-priority style only (see `DATA_GAPS.md`).
- [ ] **Reconcile or retire `apps/mobile/src/app/sign-up.tsx`** — **not done.** Decided to leave both entry points in place for now rather than delete a working screen; still two divergent signup implementations.
- [x] **Screen 7 "Add my court later"** — decided: no `suggestFacility()` call, since that function needs a full facility form onboarding never collects at this step. See `DATA_GAPS.md` for the full reasoning (also notes `suggestFacility()` is unused app-wide, a pre-existing gap).
- [ ] **Retest `your-name.tsx` pre-fill + the whole `finalizeOnboarding()` path against a real OAuth payload** — not done, needs step 7's real-device test.
