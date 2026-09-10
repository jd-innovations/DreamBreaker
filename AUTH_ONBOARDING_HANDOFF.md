# Auth & Onboarding — Handoff

**Session:** 2026-09-09 evening → 2026-09-10 early hours
**Branch:** `feature/marketplace-map`
**Status:** signup / confirmation / onboarding verified working end to end. **Password reset is broken — that is the next job.**

---

## 1. Start here: password reset is broken

Confirmed broken by Nate. The diagnosis is already done and the fix is a known shape — the *same* shape as the email-confirmation fix completed at the end of this session.

### The bug

`apps/mobile/src/lib/auth.ts` → `requestPasswordReset()`:

```ts
const redirectTo = makeRedirectUri({ path: 'reset-password' });
await supabase.auth.resetPasswordForEmail(email, { redirectTo });
```

In a standalone build `makeRedirectUri()` resolves to **`pickleballapp://reset-password`** — a custom URL scheme.

**A custom scheme cannot be used in an email.** Mail clients will not linkify, and often will not render, a non-`http(s)` scheme. We proved this earlier in the session: pointing signup confirmation at `pickleballapp://confirm-email` shipped a confirmation email **with no link in it at all**. Gmail dropped it silently, the tap produced no request, and `email_confirmed_at` stayed null. Reverted in `b16ad44`.

The comment above that function is wrong and should be deleted with the fix — it claims "expo-router opens [it] automatically via the app's custom scheme when the user taps the emailed link". There is no link to tap.

### The fix (mirror `446801b` + `a256a20`)

Four steps. All of the hard thinking is already done.

1. **Point at HTTPS.** In `requestPasswordReset()`, replace `makeRedirectUri(...)` with `` `${APP_LINK_ORIGIN}/auth/reset` `` (import `APP_LINK_ORIGIN` from `@/lib/appLinks`). The web page **already exists** at `web/src/app/auth/reset/page.tsx` and already redeems recovery links, so anyone without the app installed keeps working.
2. **Claim the path.** Add `'/auth/reset'` to `PATHS` in
   `web/src/app/.well-known/apple-app-site-association/route.ts`.
   Use the exact path, never `/auth/*` — `/auth/callback` is the web OAuth handler and **must** stay with the browser.
3. **Give the app a route at that exact path.** Today the screen is `apps/mobile/src/app/reset-password.tsx`. Move it to `apps/mobile/src/app/auth/reset.tsx` and update the `<Stack.Screen name="reset-password">` registration in `_layout.tsx` to `name="auth/reset"`. **This must land in the same change as step 2** — that AASA file's own history records that a claimed path with no matching app screen strands users on a blank branded page with force-quit as the only exit.
4. **Handle all four link shapes.** `completePasswordRecovery()` in `lib/auth.ts` currently handles only two (`access_token`/`refresh_token`, and `token_hash` with `type: 'recovery'`). It needs the `?code` (PKCE) branch too — that is exactly what broke the confirm screen after the universal link started working. Copy the structure of `completeEmailConfirmation()` in the same file, which now handles all four and is commented with the reasoning.

### Then

- **Deploy web** (step 2 is served by Next) and **promote the preview** — production is a promoted preview of the feature branch, not a push to `main`.
- Verify: `curl https://pickleballapp.app/.well-known/apple-app-site-association` should list `/auth/reset`. The route sets `Cache-Control: max-age=3600`, so a stale read right after deploying is expected — check `X-Vercel-Cache` / `Age`.
- **Reinstall the app on the device.** iOS caches the association file at install time; an OTA will not refresh it.
- Also confirm `https://pickleballapp.app/auth/reset` is on the Supabase redirect allow-list (Authentication → URL Configuration). `pickleballapp://reset-password` is already there and can stay — it becomes inert.

---

## 2. What was fixed this session

All live on the `preview` channel, runtime `9e5109d0…`. Verified end to end on `dhjesus122+demo12@gmail.com`: signup → confirmation **in the app** (15.9s) → onboarding → complete profile.

| Commit | Bug | Effect |
|---|---|---|
| `120a904` | `play_style` text vs `text[]` in `fn_handle_new_user` | **every** signup 500'd for 14 days |
| `f541d0e` | `signUp()` sent no `emailRedirectTo` | mobile accounts could never be confirmed |
| `7f00ad6` | `finalize` called `signUp()` blindly | silently **replaced the account password** |
| `dd0e93d` | area screen used ipapi.co | carrier POP city (Orlando/Miami) persisted to every profile |
| `a048e52` | onboarding offered no `play_style` keys | `play_style` null for every user, ever |
| `ed214c6` | trigger omitted 3 columns | `preferred_formats`, `play_intensity`, `self_rating` silently dropped |
| `425bf39` | "Create one" → `/sign-up` | name asked twice |
| `10b7f55` | welcome screen / name step | "Sign In" shown to signed-in users; known name re-asked |
| `446801b` | `/auth/confirm` not claimed | confirmation opened Safari instead of the app |
| `a256a20` | only 2 of 4 link shapes handled | confirmation opened the app, then failed to redeem |

### Two migrations — applied, but NOT recorded in history

- `supabase/migrations/20260909235500_fix_new_user_play_style_array.sql`
- `supabase/migrations/20260910010000_new_user_play_profile_columns.sql`

Both are live on production (applied via the SQL editor). To record them:

```powershell
cd C:\Users\dhjes\DreamBreaker
npx supabase migration repair --status applied 20260909235500
npx supabase migration repair --status applied 20260910010000
```

Bookkeeping only — the fixes are already in effect.

---

## 3. Facts worth not rediscovering

**Nothing failed loudly.** Six of these eight bugs produced no error, no log, and correct-looking code, and each only became findable once the one above it was fixed. `splitPlayingStyle()` looked perfect for weeks while producing nothing, because it was correctly sorting a list that contained no style keys.

**`auth_logs` is the best tool by a distance.** `query_logs` with `source = 'auth_logs'` names the failing column outright, gives `error_code` (`invalid_credentials` vs `email_not_confirmed`), and `referer` distinguishes the native app (`https://pickleballapp.app`, no path) from the phone's browser (trailing slash or a path).

**Check the request timeline before theorising.** Three exchanges were lost to password theories when a gap in the logs showed the credentials under test had never reached the server at all.

**Prove a write landed by reading the `profiles` row, not `auth.users`.** The auth row is created either way; its presence proves nothing.

**GoTrue sends four link shapes** — documented in `web/src/lib/auth/redeem-url.ts`: implicit `#access_token`, `?token_hash`, `?code` (PKCE), `?error`. Mobile must handle all four. `?code` is the shape a *native app is best placed to redeem*, since the PKCE verifier lives in whichever client started the flow.

**`fn_handle_new_user` hand-writes a ~23-column INSERT.** Add or reshape a `profiles` column and it silently stops being written on the signup path. A type mismatch fails at PLAN time, so "that key isn't even sent" is not a defence.

**Onboarding writes profiles two different ways.** With a session → `updateProfile()` (writes everything). Without → signUp metadata → the trigger (writes only its column list). That difference is what exposed the three missing columns.

**Email confirmation was switched on in production between 21:25 and 21:39 on 2026-08-26.** That single dashboard change is upstream of most of these bugs — several were harmless while signup was instant.

---

## 4. Still open

- **Home screen is mock data** — "24 players here / 5 games now" on a brand-new account. Violates `AGENTS.md` ("Do not hard-code mock statistics in production paths"). **Nate is handling this separately.**
- **`preferred_formats` and `play_intensity` have no edit-profile UI.** Collected only at onboarding, unchangeable afterwards. `edit-profile.tsx` covers `play_style` only.
- **`enable-location.tsx` is unreachable** — nothing routes to `date-of-birth`, its only entry point. The location prompt now surfaces on the area screen instead.
- **Unexplained:** a signed-in user with a *complete* profile was bounced to `/onboarding/welcome` (observed 19:47). No reproduction since.
- **`sign-up.tsx` still exists**, used only by `claim/[token]` for the fast three-field guest-invite path (Nate wants that kept). Those users are asked their name again on their next cold open — the accepted cost of the fast path.

---

## 5. Repo state

- **13 commits ahead of `origin/feature/marketplace-map`.** Working tree clean. `git push` when ready.
- Web change in those commits: one file — the AASA route (already deployed and verified live).
- OTA publishing: `cd apps/mobile && node ./scripts/publish-update.js preview --message "..." --non-interactive`. **Never a bare `eas update`** — it loses `EXPO_PUBLIC_APP_ENV`. Confirm `EXPO_PUBLIC_APP_ENV` appears in the CLI's "loaded from" line, and never pipe that output through `tail`.
- Production writes via MCP are refused by a permission classifier. Migrations must be run by Nate in the Supabase SQL editor:
  `https://supabase.com/dashboard/project/fbzetvkbhneptvfruilw/sql/new`
- `db push` is unusable on this repo — 32 remote-only migration versions vs ~30 local-only, all the same migrations under different version numbers. **Never run the CLI's suggested `migration repair --status reverted` fix**; it would try to re-apply ~30 live migrations. See the `project-mcp-migration-gap` memory.
