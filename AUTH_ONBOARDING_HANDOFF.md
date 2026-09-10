# Auth & Onboarding — Handoff

**Session:** 2026-09-09 evening → 2026-09-10 morning
**Branch:** `feature/marketplace-map`
**Status:** signup / confirmation / onboarding **and password reset** all verified working end to end on device. No known broken auth path.

---

## 1. Password reset — FIXED and verified (2026-09-10)

Done in `20324e1`, on production, verified on device at 09:25. Kept here
because the failure mode is subtle and the *verification* method is the
reusable part.

### What was wrong

`requestPasswordReset()` sent `makeRedirectUri({ path: 'reset-password' })`,
which in a standalone build is `pickleballapp://reset-password`. Mail clients
will not linkify or even render a non-`http(s)` scheme, so the email shipped
with **no link in it at all** — the same failure that killed the custom-scheme
attempt at signup confirmation (`b16ad44`).

### The fix — four coupled changes

1. `requestPasswordReset()` sends `` `${APP_LINK_ORIGIN}/auth/reset` ``.
2. `'/auth/reset'` added to `PATHS` in the AASA route — exact path, never
   `/auth/*`, because `/auth/callback` is the web OAuth handler.
3. `app/reset-password.tsx` moved to `app/auth/reset.tsx` so a route exists at
   the claimed path. Same commit as (2), deliberately.
4. `completePasswordRecovery()` now handles all four GoTrue link shapes; the
   missing `?code` (PKCE) branch is the one that becomes reachable the moment a
   real universal link starts arriving. Its `token_hash` branch also no longer
   requires `type=recovery` to be *present*, only that it not contradict.

Also updated: the support-widget visibility rule in `supportContext.ts` matched
`/^\/reset-password$/` and would have silently started showing the widget on
the reset screen after the rename.

### How to verify a link fix like this — read this before debugging the next one

**Three test cycles were lost to device-side theories because the origin was
checked and Apple's CDN was not.** iOS does **not** read the AASA from
`pickleballapp.app`. It reads:

```
curl https://app-site-association.cdn-apple.com/a/v1/pickleballapp.app
```

That is the only copy the phone ever sees, and it can lag a promote by up to an
hour. A claimed path missing there opens in Safari, and **no reinstall can fix
it** — the reinstall faithfully re-fetches the stale file. Check the `Age`
header to predict the wait: `3600 - Age` seconds. (Item 3 below reduced the
`max-age` to 300 so this is minutes, not an hour.)

**A reinstall is never one step.** A fresh install boots the build's EMBEDDED JS
bundle, reverting any OTA. expo-updates downloads on first launch but applies on
the NEXT one. So: delete, reinstall, launch, wait ~20s, force-quit, relaunch —
*then* test. One cycle here produced a linkless email that looked exactly like
the original bug because the app had silently reverted to old code.

The two requirements pull against each other, which is what made this confusing:
the reinstall is needed for the AASA, and it is also what undoes the OTA.

**`auth_logs` settles it without guessing.** The successful run:

```
09:25:30  POST /recover   referer=https://pickleballapp.app/auth/reset   200
09:25:47  POST /verify    referer=https://pickleballapp.app             200
09:26:05  PUT  /user      referer=https://pickleballapp.app             200
```

- `/recover`'s `referer` is the `redirect_to` GoTrue was handed — it proves
  which JS the device is running (`pickleballapp://…` means the OTA has not
  applied).
- `/verify`'s `referer` **without** a trailing slash is the native app; **with**
  one is the phone's browser. That single character is what distinguishes
  "opened in the app" from "opened in Safari".
- `PUT /user` (not `GET`) is the password actually being written. Every failed
  attempt managed only a `GET`.
- `POST /verify` rather than `GET` also proved the emailed link points straight
  at `pickleballapp.app`, not through `supabase.co/auth/v1/verify` — which ruled
  out an email-template theory without touching the dashboard.

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
| `20324e1` | password reset sent a `pickleballapp://` link | reset email had no link; reset impossible on mobile |

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

- **All work pushed to `origin/feature/marketplace-map`** (through `20324e1`). Working tree clean.
- Web changes: one file — the AASA route. Deployed and promoted; production is
  `dpl_GHhizcDps6CmLwMrBcnx`. Remember production is a **promoted preview**, so a
  push alone deploys nothing, and promoting before your commit has finished
  building promotes the *previous* commit — that happened once tonight.
- OTA live on `preview`: update group `42bad065-c518-4f52-b362-27595aeee59a`,
  runtime `9e5109d0…` (unchanged, so no rebuild was needed).
- OTA publishing: `cd apps/mobile && node ./scripts/publish-update.js preview --message "..." --non-interactive`. **Never a bare `eas update`** — it loses `EXPO_PUBLIC_APP_ENV`. Confirm `EXPO_PUBLIC_APP_ENV` appears in the CLI's "loaded from" line, and never pipe that output through `tail`.
- Production writes via MCP are refused by a permission classifier. Migrations must be run by Nate in the Supabase SQL editor:
  `https://supabase.com/dashboard/project/fbzetvkbhneptvfruilw/sql/new`
- `db push` is unusable on this repo — 32 remote-only migration versions vs ~30 local-only, all the same migrations under different version numbers. **Never run the CLI's suggested `migration repair --status reverted` fix**; it would try to re-apply ~30 live migrations. See the `project-mcp-migration-gap` memory.
