# DEEP_LINKING_PHASE4.md

> Status: PARTIAL — core Universal Link confirmed on physical device; cold-start, background, push-tap, and legacy-scheme tests still require physical-device execution; one invalid-link bug found by code review  
> Module: Native Capabilities Phase 4 - Deep Linking & Universal Links  
> Date: 2026-08-11 (closeout validation pass: 2026-08-13)

## Current-State Findings

- Mobile already used Expo Router with the custom scheme `dreambreaker`.
- Google OAuth and password reset rely on `expo-auth-session` redirect URIs and `expo-linking`; those flows were intentionally left on their existing callback paths.
- Push notification tap handling existed for chat notifications only and routed directly to `/conversation/[id]`.
- Existing share links were mixed: group shares used `dreambreaker://groups/:id`, community shares used `dreambreaker://app...`, some marketplace/tournament shares had no durable app link.
- Web had some matching fallback surfaces, but mobile canonical paths such as `/tournament/:id`, `/groups/:id`, `/conversation/:id`, `/marketplace/:id`, `/claim/:token`, and `/community/:id` were not consistently represented.

## Implemented

- Added canonical production link helpers for `https://pickleballapp.app/...`.
- Preserved legacy `dreambreaker://` support through a centralized inbound resolver.
- Added app-level inbound handling for both Universal Links and legacy scheme links.
- Added auth-aware routing for private deep links, including sign-in return routing.
- Refactored push notification tap routing to use the same destination resolver as deep links.
- Configured iOS Associated Domains with `applinks:pickleballapp.app`.
- Added an AASA endpoint at `/.well-known/apple-app-site-association`.
- Migrated group, group chat, community event, tournament, and marketplace listing shares to canonical HTTPS links.
- Added lightweight web fallback/redirect routes for the first Phase 4 path set.

## Supported Initial Paths

- `/conversation/:id`
- `/groups/:id`
- `/tournament/:id`
- `/community/:id`
- `/marketplace/:id`
- `/booking/:id`
- `/coach/offers/:id`
- `/claim/:token`

## Conflicts And Missing Dependencies

- Apple Team ID has been added locally in `web/.env.local`. Production hosting still needs `APPLE_TEAM_ID` or `APPLE_DEVELOPER_TEAM_ID` set for `pickleballapp.app`.
- Associated Domains require a new EAS iOS build before physical iPhone Universal Links can work.
- `/booking/:id` and `/coach/offers/:id` have fallback and resolver coverage, but the mobile app does not yet have mature public detail screens for every possible booking/coach-offer case.
- OAuth/password-reset callbacks were not moved to Universal Links by design.

## Changed Files

- `apps/mobile/app.config.js`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/app/groups/[id].tsx`
- `apps/mobile/src/app/groups/[id]/chat.tsx`
- `apps/mobile/src/app/marketplace/[id].tsx`
- `apps/mobile/src/app/sign-in.tsx`
- `apps/mobile/src/app/tournament/[id].tsx`
- `apps/mobile/src/hooks/useExternalLinks.ts`
- `apps/mobile/src/lib/appLinks.ts`
- `apps/mobile/src/lib/communityShare.ts`
- `apps/mobile/src/lib/externalRouting.ts`
- `apps/mobile/src/lib/pushNotifications.ts`
- `web/src/app/.well-known/apple-app-site-association/route.ts`
- `web/src/app/booking/[id]/page.tsx`
- `web/src/app/claim/[token]/page.tsx`
- `web/src/app/coach/offers/[id]/page.tsx`
- `web/src/app/community/[id]/page.tsx`
- `web/src/app/conversation/[id]/page.tsx`
- `web/src/app/groups/[id]/page.tsx`
- `web/src/app/marketplace/[id]/page.tsx`
- `web/src/app/tournament/[id]/page.tsx`
- `web/src/components/mobile-link-fallback.tsx`

## Verification Required Before Declaring Phase Complete

- Set `APPLE_TEAM_ID` in production hosting.
- Confirm `https://pickleballapp.app/.well-known/apple-app-site-association` returns HTTP 200 JSON with the correct `TEAM_ID.com.dreambreakerpb.app` app ID.
- Create a new EAS iOS build and install it on a physical iPhone.
- Tap a Universal Link from Messages, Mail, Notes, and Safari and confirm it opens the installed app.
- Confirm legacy `dreambreaker://groups/:id` links still route correctly.
- Re-test Google OAuth and password reset callbacks.
- Re-test chat notification tap routing.

## Verification Run

- `apps/mobile`: `npx tsc --noEmit` passed.
- `apps/mobile`: focused `npx eslint ...` passed with existing unused-import warnings in `groups/[id]/chat.tsx` and `tournament/[id].tsx`.
- `web`: focused `npx eslint ...` passed.
- `web`: `npx tsc --noEmit` passed.

## Closeout Validation — 2026-08-13

Performed by AI agent without physical device access. Results below separate what was directly verified (live endpoint check, code inspection, compiler run) from what genuinely requires a human tapping links on a physical iPhone in specific app states — those are marked NOT TESTED rather than assumed PASS.

| Test | Status | Basis |
| ---- | ------ | ----- |
| Conversation Universal Link | PASS | Already confirmed on physical iPhone (per task input). |
| Cold Start Universal Link | NOT TESTED | Requires fully terminating and relaunching the app on a physical iPhone; no device access available to this validation pass. |
| Background / Warm Start | NOT TESTED | Requires backgrounding the app on a physical iPhone; no device access. Code review of `apps/mobile/src/hooks/useExternalLinks.ts` shows a `handledUrls` dedup guard against duplicate navigation, but this is unverified on-device. |
| Push Notification Regression | NOT TESTED | Requires a real APNs round-trip between two physical devices. Note: `PUSH_NOTIFICATIONS_PHASE1.md`'s test table shows every push test (permission, token registration, delivery, tap routing) as NOT TESTED — there is no prior confirmed pass to regress from, so "regression" is not an accurate frame for this check yet. Code review of `apps/mobile/src/lib/pushNotifications.ts:144-157` shows a `lastHandledResponseKey` guard against double-firing between the live response listener and `getLastNotificationResponseAsync`, which is sound in isolation but unproven end-to-end. |
| Legacy Custom Scheme | NOT TESTED (on device) | `apps/mobile/src/lib/externalRouting.ts:48-52` still parses `dreambreaker://` URLs through the same resolver as HTTPS links, so the code path exists, but no physical-device tap was performed in this pass. |
| Invalid Conversation Link | **FAIL** | Confirmed by code review, not assumed. `apps/mobile/src/app/conversation/[id].tsx:1908-1937`: a conversation id that doesn't match the `tournament-`/`event-`/`dm-` prefixes and isn't a valid UUID (e.g. `/conversation/invalid-id`) falls through to `<DMConversation />`, a hardcoded mock screen with fabricated demo content ("Sarah M."). This is not a safe not-found/error/access-denied state — it silently presents fake conversation data instead. Does not expose real user data, but fails the stated PASS bar. |
| Group Share (optional) | NOT TESTED | Requires physical device. |
| Tournament Share (optional) | NOT TESTED | Requires physical device. |
| Marketplace Share (optional) | NOT TESTED | Requires physical device. |

Additional findings from this pass:

- **Production AASA has a redirect at the declared apex domain.** `curl` against `https://pickleballapp.app/.well-known/apple-app-site-association` (the exact host declared in `apps/mobile/app.config.js:12` as `applinks:pickleballapp.app`) returns **HTTP 308**, redirecting to `https://www.pickleballapp.app/...`, which then returns 200 with correct JSON (`ZSH27U747N.com.dreambreakerpb.app`; all 8 implemented paths present: `/conversation/*`, `/groups/*`, `/tournament/*`, `/booking/*`, `/marketplace/*`, `/coach/offers/*`, `/claim/*`, `/community/*`). The physical-device Universal Link test already passed, so iOS evidently tolerates this redirect in practice, but serving the file directly at the declared apex (no redirect) is the safer, Apple-recommended configuration and removes a known source of intermittent AASA-fetch failures.
- **`npx tsc --noEmit` passed clean in `apps/mobile`** — confirmed via direct run, not assumed. "App compiles cleanly" criterion is genuinely met.
- **Associated Domains config confirmed in source** (`app.config.js:10-12`), and indirectly confirmed live via the passing physical-device Universal Link test — but this pass had no way to independently confirm the entitlement is present in whichever specific build is currently installed on the test iPhone, beyond that inference.

## Phase 4.1 — Remediation — 2026-08-13

### 1. AASA redirect — root cause and required fix

Confirmed the redirect is not application code. Searched `web/next.config.ts` (no `redirects()` entry), `web/` for `middleware.ts` (none exists), and the whole repo for `vercel.json` (none exists). The AASA route handler itself (`web/src/app/.well-known/apple-app-site-association/route.ts`) has no redirect logic. The response signature — `HTTP/1.1 308 Permanent Redirect`, a `Refresh` header, `Server: Vercel`, firing on *every* path at the apex, not just this one — matches Vercel's built-in domain-level redirect (Project Settings → Domains), which is configured outside the repo and applies before any Next.js code runs, including this specific route. No tool available to this session can read or change that setting (Vercel MCP here exposes project/deployment/domain-purchase tools, not domain-redirect configuration), and it is a live production-domain change, so it needs to be done manually.

**Manual action required (Vercel dashboard):**

1. Go to the Vercel project serving `pickleballapp.app` → **Settings → Domains**.
2. Currently `pickleballapp.app` (apex) is set to **redirect to** `www.pickleballapp.app`. That's the source of the 308.
3. Since `apps/mobile/app.config.js` declares `applinks:pickleballapp.app` (apex) as the Universal Link domain — and per instruction this should not be changed to `www` without a documented reason — flip which domain is primary: set **`pickleballapp.app` as the primary/production domain** (serves directly, no redirect), and set **`www.pickleballapp.app` to redirect to the apex** instead (the reverse of today's config). This preserves a single canonical public-site domain, just swaps which one it is, and requires no code or DNS changes if both domains are already attached to the project.
4. Verify after the change: `curl -I https://pickleballapp.app/.well-known/apple-app-site-association` should return `HTTP/1.1 200` directly, with `Content-Type: application/json`, no `Location`/`Refresh` header.

This was not attempted automatically — it's a live, outward-facing production domain change outside repo code, and outside what any available tool can safely perform.

### 2. Invalid conversation route — fixed

`apps/mobile/src/app/conversation/[id].tsx`:

- Root router (`ConversationScreen`): the final fallback for any id that doesn't match `tournament-`/`event-`/`dm-` prefixes or the UUID pattern now renders `<ConversationUnavailable />` instead of `<DMConversation />`.
- `RealDMScreen` (the real Supabase-backed 1:1 conversation screen, reached for any syntactically valid UUID): added a `notFound` state. The existing conversation-row lookup now treats a missing/inaccessible row as not-found instead of silently leaving the screen in an empty state; when set, the screen renders `<ConversationUnavailable />` instead of the chat UI.
- Deliberately **do not distinguish** "conversation doesn't exist" from "conversation exists but you're not a participant" — both render the same generic not-found message. Making that distinction visible would itself leak conversation existence to an unauthorized caller, which is exactly what RLS is meant to prevent. RLS itself was not touched.
- Removed `DMConversation` and its exclusively-owned dependencies (`SARAH_PHOTO`, the `Message` type/`MESSAGES` array, `DM_QUICK_ACTIONS`, `TournamentCard`, `MatchBanner`, and their `tc`/`mb` stylesheets) — confirmed via repo-wide grep that none of these were referenced anywhere else. The `event-*`/`dm-*` mock screens used elsewhere for demo/preview purposes (`EVENT_CHATS`, `GENERIC_DMS`) were left untouched; they're reached only by their own explicit keyed ids, not by the catch-all fallback, and removing them wasn't required for this fix.
- No RLS changes. No fabricated conversation data introduced. No UI redesign — same visual language (`rd.centered`/`rd.stateText`, existing icon/color tokens) as the pre-existing error state used elsewhere in this file.

Verification: `npx tsc --noEmit` (apps/mobile) — clean. `npx eslint "src/app/conversation/[id].tsx"` — 0 errors, 2 pre-existing unrelated warnings (unused `router` in `EventGroupChat`, an `array-type` style warning), neither introduced by this change.

### 3. Existing routing architecture

Not touched: `appLinks.ts`, `externalRouting.ts`, `useExternalLinks.ts`, `pushNotifications.ts`'s shared resolver, or legacy `dreambreaker://` handling. Confirmed via `npx eslint` on each — all clean, no changes made.

### 4. Push test history — NOT corrected pending confirmation

This report was asked to state that the Phase 1 push flow (User A message → server push → User B physical iPhone → tap → correct conversation) was "previously confirmed manually," making the remaining push test a regression check rather than a first-time test.

That is not what `PUSH_NOTIFICATIONS_PHASE1.md` says. Its test table marks every row — permission, token generation, token persistence, direct Expo push, database-triggered push, background delivery, notification tap, cold-start routing — as `NOT TESTED`, and its status line reads "real-device completion still requires EAS/APNs verification." No record of that end-to-end flow having been run exists anywhere in the repo. This section intentionally has not been rewritten to assert the confirmation happened, since doing so would record an unverified claim as fact against the only evidence available. If that manual test happened outside the repo (e.g. undocumented at the time), say so with when/how it was run and this section will be corrected and dated accordingly. Until then, the table above continues to describe the upcoming push test as the first real end-to-end test, not a regression check.

### 5. Code verification results

| Check | Result |
| ----- | ------ |
| `apps/mobile`: `npx tsc --noEmit` | Clean, 0 errors |
| `apps/mobile`: `npx eslint` on `conversation/[id].tsx` | 0 errors, 2 pre-existing unrelated warnings |
| `apps/mobile`: `npx eslint` on `appLinks.ts`, `externalRouting.ts`, `useExternalLinks.ts`, `pushNotifications.ts`, `usePushNotifications.ts`, `_layout.tsx` | Clean, 0 errors, 0 warnings |
| `web`: `npx tsc --noEmit` | Clean, 0 errors |
| `web`: `npx eslint` on AASA route + all Phase 4 fallback pages | Clean, 0 errors, 0 warnings |

## Manual Tests Still Required (Device Owner)

None of the following were marked PASS without device confirmation — they still require a physical iPhone:

1. Universal Link with the app fully terminated (cold start).
2. Universal Link with the app backgrounded (warm start), confirming no duplicate navigation.
3. User A → User B message → push delivered → tap → correct conversation opens.
4. A legacy `dreambreaker://` link (e.g. `dreambreaker://groups/:id`).
5. An invalid conversation HTTPS link (e.g. `https://pickleballapp.app/conversation/invalid-id`) — code fix is in place and passes compile/lint, but has not been tapped on a device yet.

## Phase 4 Status After Remediation

**PARTIAL.** The invalid-link bug is fixed and verified by compiler/linter. The AASA redirect has a fully documented, ready-to-apply manual fix but has not been applied (production domain change, outside repo, requires dashboard access this session doesn't have). The five device tests above remain outstanding. Phase 4 can move to COMPLETE once the AASA dashboard change is applied and re-verified, and the five device tests pass.
