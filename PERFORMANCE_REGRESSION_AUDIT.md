# Performance Regression Audit — Expo Mobile App

**Date:** 2026-09-05
**Scope:** `apps/mobile/src`, `packages/shared/src`
**Mode:** Read-only. No code, dependency, architecture, or database changes were made.

---

## Executive summary

The design-standardization work is **not** the cause of the slowdown, and the evidence is
unambiguous: typography, color, spacing, and radius tokens are resolved inside module-scope
`StyleSheet.create` calls (2,335 token reads, only 15 of them in a JSX `style=` prop) and the
token modules are plain constant objects with no runtime computation. Blur, gradient, shadow,
and animation counts are **byte-identical** before and after the migration.

What the standardization work did do is land **on top of** an already-expensive runtime, and one
of its side effects — merging two Quick Action grids into a single `flexWrap` container — produced
a visible layout blowup that was fixed on the same day (`e2311d0`). That incident is worth naming
because it is the shape of the real problem: the app has a lot of always-mounted visual cost and
focus-triggered refetching, so any change lands in a system with no headroom.

The dominant costs found are, in order: a **profile store that force-refetches and re-renders every
subscriber on every screen focus** (pre-existing, unchanged in the window), **up to 14 simultaneous
live blur surfaces on the home screen** including one animated per-frame (pre-existing), and
**124 `ScrollView`s against 6 virtualized lists** app-wide (pre-existing).

**Important caveat, stated plainly:** no React DevTools / Profiler traces were captured for this
audit. This session has no attached device or Metro instrumentation, so every finding below is
from code tracing and git comparison. Requirement 4 (profiler evidence) and requirement 5
(dev vs production-build attribution) are therefore **not satisfied** and are carried into the
verification checklist as required work, not reported as conclusions.

---

## Is the slowdown confirmed, and where?

**Partially confirmed — by mechanism, not by measurement.**

| Claim | Status |
| --- | --- |
| Specific code paths do redundant work per focus / per frame | **Confirmed** by code tracing (F1, F2, F4) |
| Those paths are on startup, tab navigation, and scroll | **Confirmed** by call-site tracing |
| The design tokens cause it | **Disproven** (see Exonerated) |
| The user-perceived slowdown magnitude | **Not measured** — no traces, no frame timings, no TTI numbers |

I did not reproduce the slowdown on a device this session, so I cannot state how much of the
perceived regression each finding accounts for. Do not treat the rankings below as measured
attribution; they rank *mechanism severity and blast radius*, which is what code evidence supports.

---

## Last known good commit and comparison scope

| | Commit | Date | Note |
| --- | --- | --- | --- |
| **Last known good** | `a8ffd25` | 2026-09-02 | Last commit before theming Phase 1 (`51c5a5c`) |
| Theming machinery lands | `51c5a5c` | 2026-09-02 | light/dark/system provider |
| Standardization begins | `3da9455` | 2026-09-03 | type/space/radius scales from DESIGN_STANDARD |
| **Head** | `e2311d0` | 2026-09-05 | |

Raw diff: **223 files, +14,570 / −12,924**.
Whitespace-ignored diff: **+5,792 / −4,146** — i.e. **~57% of the diff is CRLF/LF churn**, not
content. Verify per file with `git diff -w --numstat a8ffd25 HEAD -- <path>`; e.g.
`round-robin-created.tsx` reports 1615+/1614− raw but only **75+/74−** real.

---

## Exonerated (do not spend time here)

| Hypothesis | Evidence against |
| --- | --- |
| Design tokens cost at runtime | 2,335 `text.*.size` reads; **15** in a JSX `style=` prop. Rest are inside module-scope `StyleSheet.create`, evaluated once at import. |
| Tokens computed per render | `packages/shared/src/tokens.ts` is plain constants; its only functions (`toCss`, `toHex`, `toCssTriplet`) have **zero** mobile call sites — web-only. |
| Standardization added blur/gradient/shadow | Identical counts at `a8ffd25` and `HEAD`: `BlurView` 8→8, `LinearGradient` 32→32, `shadowOpacity` 104→104, `elevation:` 103→103, `Animated.` 272→272, `useNativeDriver` 78→78. |
| Standardization added inline style objects | `style={{` went **468 → 443** (down 25). `style={[` 1479 → 1492 (+13, negligible). |
| Fonts loaded more than once / outside root | One and only one `useFonts` call, in `src/app/_layout.tsx:41`. No `Font.loadAsync` anywhere. |
| Theme context causes broad re-renders | `ThemeProvider` value is `useMemo`'d on `[scheme, setting, setSetting, ready]`; `setSetting` is `useCallback`'d. Only **5 files** consume it, and `THEME_MIGRATION_COMPLETE = false` clamps `system` to light, so the context value is effectively static in production today. |
| `useThemedStyles` rebuilding sheets | All factories checked are module-scope constants, as the hook's own doc requires. No inline-arrow factories found. |
| Excessive logging | 59 `console.*` in `src/`, concentrated in lib modules, none in render paths or list rows. Not a factor. |

---

## Findings

### F1 — Critical: `useProfile` force-refetches and re-renders every subscriber on every screen focus

**Files:** `apps/mobile/src/hooks/useProfile.ts:128-132`

```ts
useFocusEffect(
  useCallback(() => {
    if (currentUserId) loadProfile(currentUserId, true);   // force = true
  }, []),
);
```

**Evidence.**
- `force = true` **deliberately bypasses the in-flight dedupe** (`if (inFlight && !force) return inFlight;`, line 41), so concurrent calls each issue their own network request.
- `loadProfile` calls `emit()` **twice** per invocation — once on `loading` (line 45), once on settle (line 55) — and `emit()` walks every listener in the module-level `listeners` set.
- **17 components call `useProfile()`.** Native-stack keeps previous screens mounted for swipe-back, so several subscribers are mounted simultaneously and each one's `useFocusEffect` fires on focus.
- Net effect per navigation: N forced network fetches → 2N store emits → 2N × (all mounted subscribers) re-renders.

**Root cause vs contributing.** **Root cause** of focus/navigation jank. This is the same mechanism that produced the director-guard flicker chased through `75fb716`, `dc2d819`, `f8c5240`, `6a79e99` this week — those commits each patched a *symptom screen* while leaving the emitter untouched.

**Regression status:** **Pre-existing.** `git diff a8ffd25 HEAD -- apps/mobile/src/hooks/useProfile.ts` is **empty**; last touched `80f50f7` (2026-08-17), before the window. It is not a regression — it is the load-bearing cost the regression work kept colliding with.

**Recommended fix (targeted).** Do not delete the refresh; it exists because stale profile data was a real bug. Instead:
1. Drop `force: true` to `false` so the in-flight dedupe collapses concurrent focus refetches into one request.
2. Add a staleness floor (e.g. skip if the last successful load was < 30s ago) so back-navigation between two screens doesn't refetch.
3. Only `emit()` on the loading transition when there is no cached profile — a background refresh over populated data should not flip 17 components into a loading state.

**Expected impact:** removes the majority of per-navigation re-render work. **Risk: Medium** — this hook gates auth routing (`resolveAuthGate`); the `status` semantics (`idle`/`loading`/`loaded`/`error`) must be preserved exactly. Needs the auth-gate paths re-tested (sign-in, sign-out, token refresh, account switch).

---

### F2 — High: up to 14 live blur surfaces on Home, one with animated `intensity`

**Files:** `apps/mobile/src/components/GlassQuickAction.tsx:17,57,87`, `apps/mobile/src/components/support/FloatingSupportButton.tsx:130`, `apps/mobile/src/constants/quickActions.ts`

**Evidence.**
- `QUICK_ACTIONS` has **13 entries**; Home renders one `GlassQuickAction` per entry, each containing an `AnimatedBlurView`.
- `GlassQuickAction` animates the **blur intensity itself** via `useAnimatedProps(() => ({ intensity: blur.value }))` (38 → 58 on press-in). Animating `intensity` forces the blur to re-composite every frame for the duration — among the most expensive iOS effects available.
- `FloatingSupportButton` adds a **14th, permanently-mounted** `BlurView` + 2 `LinearGradient`s + shadow layer, present on every screen (visible as the `?` button in both user screenshots), and re-renders on every navigation via `usePathname()`.

**Root cause vs contributing.** **Contributing factor**, but the largest steady-state GPU cost in the app and the most likely source of "everything feels heavy."

**Regression status:** **Pre-existing.** `GlassQuickAction` changed only 6 lines in the window (token swap); `FloatingSupportButton` changed 7 lines — the only functional one being `tint="light"` → `tint={scheme === 'dark' ? 'dark' : 'light'}` and an icon color moving to `roles.textPrimary` (`084a149`).

**Recommended fix (targeted, preserves the design).**
1. Stop animating `intensity`. Keep a **static** blur and animate an overlay's `opacity` instead to fake the same darkening on press — visually near-identical, and `opacity` is a compositor-only property.
2. Consider `experimentalBlurMethod`/reduced blur count on Android, where `expo-blur` is materially more expensive.
3. Leave the visual language intact — this is a rendering-technique change, not a design change.

**Expected impact:** large improvement to Home scroll and press latency. **Risk: Low** for (1) — self-contained in one component, visually verifiable side-by-side.

---

### F3 — High: Home runs three independent focus refetches per tab visit, on top of F1

**Files:** `apps/mobile/src/app/(tabs)/index.tsx:609, 709, 726`

**Evidence.** Three separate `useFocusEffect` blocks fire on every focus of the Home tab:
`fetchTournaments()` (deps `[]`), `hasRegisteredPushToken(user.id)` (deps `[user?.id]`), and a
community-cards loader that also awaits `claimGuestParticipants()` before fetching. The third sets
`setCommunityLoading(true)` + `setCommunityError(false)` **before** awaiting, so every focus tears
the populated list back to a loading state. Home also holds ~14 `useState` values and nests four
`ScrollView`s.

Combined with F1, a single tab switch to Home triggers: 3 screen fetches + 1..N forced profile
fetches, and at least 5 state-driven commits over a subtree containing 13 blur surfaces.

**Root cause vs contributing.** **Contributing** — amplifies F1 and F2 on the app's most-visited screen.

**Regression status:** Pre-existing pattern; the file changed 106 real lines in the window (token swaps).

**Recommended fix.** Gate each focus refetch behind a staleness check (same floor as F1) and stop
resetting `communityLoading` to `true` when data is already present — refresh in place instead.
**Risk: Low-Medium** — the comments on these effects document real staleness bugs they fixed; the
fix must keep refetch-on-focus behavior, only skip *redundant* ones.

---

### F4 — Medium: 124 `ScrollView`s vs 6 virtualized lists

**Files (highest `.map()` density inside a `ScrollView`):** `(tabs)/games.tsx` (18), `groups/[id].tsx` (15), `community/[id].tsx` (15), `conversation/[id].tsx` (14), `(tabs)/index.tsx` (14), `booking/choose-time.tsx` (12), `(tabs)/nearby.tsx` (11)

**Evidence.** `grep -rl "<ScrollView" src/app` → **124 files**; `FlatList|FlashList` → **6**. Every
row in a mapped `ScrollView` mounts eagerly and re-renders whenever the parent screen commits —
which, per F1, is on every focus.

**Root cause vs contributing.** **Contributing**, and it is what makes F1's re-render storms expensive
rather than merely wasteful.

**Regression status:** Pre-existing; unchanged by the window.

**Recommended fix.** Do **not** convert 124 screens. Convert only where a list is unbounded and
user-visible as slow — `conversation/[id].tsx` (message history) and `(tabs)/games.tsx` first.
Measure before converting the rest. **Risk: Medium per screen** (scroll position, sticky headers,
nested-scroll behavior all change).

---

### F5 — Medium: Director Hub fan-out fetch per focus

**Files:** `apps/mobile/src/app/director.tsx` (`loadSnapshots`), `apps/mobile/src/lib/supabase/tournaments.ts`

**Evidence.** `loadSnapshots` runs `fetchDivisionsForTournament` + `fetchTournamentRegistrations`
for **every** tournament in a `Promise.all`, and is wired to `useFocusEffect`. `ce32530` (in-window)
substantially reduced this by scoping the fan-out to the status-filtered subset only (default
`open`), but the pattern remains N+1 and still re-runs per focus.

**Root cause vs contributing.** Contributing; **already partially mitigated** in the window.

**Recommended fix.** Fold the counts into a single aggregate query or a view, rather than N+1 per
tournament. **Risk: Medium** — needs a DB-side change, explicitly out of scope for this audit.

---

### F7 — High: no loading-state orchestration — false empty states and staged full-screen paints

**Classification:** perceived-performance / state-management, **separate from F1–F4's frame-rate
and refetch-storm findings.** Not attributable to fonts or design tokens — see Exonerated above;
this is sequencing of fetch/loading state, nothing typographic.

**Evidence scope — read carefully, the two screens are not equally confirmed.** The Build B
recording (interaction 7B) was captured opening a **Quick Game**, which routes to
`community/[id].tsx`. That recording **directly confirms** the loading sequence described below —
false empty state on Events, full-screen loader, staged partial-then-complete paint, and the
weather gap — for `community/[id].tsx`. `tournament/[id].tsx` contains the **identical**
`if (loading || !tournament) return <full-screen loader>` pattern by static code inspection (line
469-475), and is included below because the mechanism is the same, but **the recording does not
show a tournament screen** — its visible behavior (partial-render staging, any tournament-specific
gap analogous to weather) is inferred, not observed. Treat the `tournament/[id].tsx` reference as
"same defect by code shape," not "confirmed by video."

**Files:** `apps/mobile/src/app/(tabs)/games.tsx:553-575` (false empty state, confirmed), `apps/mobile/src/app/community/[id].tsx:376,419-424,551-558,993-997` (full-screen loader + weather gap, confirmed by recording), `apps/mobile/src/app/tournament/[id].tsx:469-475` (same full-screen-loader pattern, static inspection only — not confirmed by recording).

**Observed (Build B recording, 30fps):**
1. Home → Events briefly shows **"No upcoming events"** before real cards render.
2. Opening an event shows a **full-screen dark loader** replacing an already-known screen.
3. The detail screen then renders **partially**.
4. The weather panel sits as an **empty loading panel for ~0.8–0.9s** before populating.
5. Net effect: three staged paints — loader → partial detail → completed detail — instead of one
   coherent transition.
6. Back navigation to Events was smooth (not implicated).

**Evidence in code, matching each observed step:**
- `games.tsx:553` — `const isEmpty = events.length === 0 && tournaments.length === 0;` has **no
  loading gate**. While the initial fetch is in flight, both arrays are legitimately empty, so the
  "No upcoming events" empty state renders first and is then swapped for real cards — a **false
  empty state**, not a slow fetch.
- `community/[id].tsx:551-558` (and the identical pattern at `tournament/[id].tsx:469-475`) —
  `if (pageLoading) return <full-screen ActivityIndicator>`, unconditionally replacing whatever
  was on screen (including the tapped card's already-known title/image) with a blank loader.
- `community/[id].tsx:376,419-424` — `weather` state starts `null`, flips to the literal string
  `'loading'` only after the event record resolves and lat/lng are known, **then** awaits
  `fetchEventWeather`. This is a fetch chained behind another fetch, rendered with no reserved
  layout space until data lands (`weather != null &&` at line 994 mounts nothing at all while
  `null`), which is why the panel appears empty before content pops in rather than smoothly
  transitioning.

**Root cause vs contributing.** **Root cause** of the *perceived* jankiness in this flow — distinct
from F1/F3's *actual* redundant-network-request cost. A user cannot tell "slow" apart from "loads
correctly but paints in three disconnected steps"; this finding is the latter, and it compounds
whatever F1/F3 add in extra round trips.

**Regression status:** Not evaluated against the window — this is existing loading-orchestration
design, not something introduced by the theming/standardization diff. Do not attribute to it.

**Recommended fix (targeted, in the direction requested):**
1. Gate `games.tsx`'s `isEmpty` on `!loading && events.length === 0 && tournaments.length === 0` —
   never show the empty state until the initial fetch has completed.
2. On repeat visits, preserve previously loaded Events data during background refresh instead of
   clearing it (same class of fix as F3's "no loading-flip over populated data").
3. Render the tournament/event detail shell immediately using the data already available from the
   tapped card (title, image, date) instead of a full-screen loader that discards it; fill in the
   rest as it resolves.
4. Give the weather panel an intentional skeleton that reserves its final layout space from the
   moment the section title renders, rather than mounting nothing until `weather != null`.
5. Never replace an already-known screen with a full-screen loader — reserve that treatment for
   truly cold, no-prior-data entry points only.

**Expected impact:** eliminates the loader → partial → complete staged-paint sequence and the false
empty state; should read as one continuous transition. **Risk: Low-Medium** — purely a
render-gating change (loading booleans and initial-data hydration), no data-fetching logic removed.

**Measurement to attach:** tap-to-first-meaningful-content and tap-to-complete-content, before and
after, on the same Build B method used for interaction 7B (screen recording, qualitative timing —
see "Measuring FPS in Build B" above; do not report frame-accurate numbers from it, only elapsed
time between marked events).

---

### F6 — Low: root `screenOptions` object recreated per `RootLayout` render

**Files:** `apps/mobile/src/app/_layout.tsx:78-98`

**Evidence.** The `screenOptions={{...}}` literal is a fresh object each render, and `RootLayout`
re-renders on `useSession()` changes and on theme changes. `RootLayout` re-renders are rare, so this
is genuinely minor — listed only because it is cheap to confirm and would otherwise be
re-discovered.

**Recommended fix.** Hoist to a `useMemo` keyed on `[roles]` **only if** a profiler trace shows
`RootLayout` committing more than a handful of times per session. Otherwise leave it.
**Risk: Low.** **Do not fix speculatively** — this is exactly the kind of change that should wait for
evidence.

---

## Prioritized implementation plan

| Step | Work | Gate before proceeding |
| --- | --- | --- |
| **0** | Capture baseline traces (see checklist). No code changes. | Baseline exists for startup / Home focus / Home scroll |
| **1** | F2.1 — stop animating blur `intensity` on `GlassQuickAction` | Home scroll + press FPS improves vs baseline |
| **2** | F1 — dedupe + staleness floor + no loading-flip on warm refresh in `useProfile` | Auth-gate regression suite green; re-render count on focus drops |
| **3** | F3 — staleness gate on Home's three focus effects | Home focus commit count drops; staleness bugs in the effect comments do not return |
| **3.5** | F7 — loading-state orchestration: no false empty state, no full-screen loader over known data, weather skeleton | Build B recording of interactions 7A–7C shows one continuous transition, not loader → partial → complete |
| **4** | Re-measure. Stop here if the app is acceptable. | — |
| **5** | F4 — virtualize `conversation/[id]` then `(tabs)/games` only | Measured per screen |
| **6** | F5 — aggregate query for Director Hub counts (needs DB work, separate approval) | — |

Steps 1–3.5 are independent and individually revertible. F6 is deliberately not scheduled. F7 is
prioritized alongside F1/F3 because it shares their blast radius (Home → Events → detail, the most
common navigation) but is a distinct defect class (state sequencing, not redundant fetches or
rendering cost) and must not be folded into either.

---

## Production-like verification and benchmark checklist

The audit could not complete requirements 4 and 5. This checklist is how they get done.

**Build discipline**
- [ ] Measure on a **release** build (`eas build --profile preview/production`), never Expo Go or a dev client — dev builds carry the bridge inspector, non-minified React, and `__DEV__` warnings that dominate the numbers.
- [ ] Confirm the runtime fingerprint matches the installed build before OTA-testing a JS-only change (`npx expo-updates fingerprint:generate --platform ios`; current: `9e5109d0ac7a1a802322a68ba5bdc9067525306f`).
- [ ] Record dev-build and release-build numbers **side by side** for the same interaction, so dev-only overhead is quantified rather than assumed.

**Traces to capture (React DevTools Profiler, one per interaction)**
- [ ] **Cold start** → time to first interactive frame on Home; count commits before idle.
- [ ] **Tab navigation** Home ↔ Games ↔ Nearby → commits per switch, and specifically how many components re-render per `useProfile` emit (this is F1's direct measurement).
- [ ] **Scrolling** Home and `conversation/[id]` → dropped frames, JS thread FPS vs UI thread FPS.
- [ ] **Typing** in a `TextInput`-heavy form (`tournament/[id]/edit`) → commit count per keystroke.
- [ ] **Modal open** (`FindGamesFilterModal`) → time to visible, commits during open.
- [ ] **Theme switch** via `dev-theme` → confirm only the 5 theme-consuming files re-render.

**Per-finding acceptance**
- [ ] F1: forced profile fetches per navigation drop from N to ≤1; subscriber re-renders per focus drop measurably; auth gate behavior unchanged across sign-in / sign-out / token refresh / account switch.
- [ ] F2: Home press-in latency and scroll FPS improve; screenshot diff of `GlassQuickAction` press state shows no visible design change.
- [ ] F3: Home focus issues ≤1 network round trip when data is fresh; leaving and rejoining an event still updates the list (the bug the effects' comments document).
- [ ] F4: converted screen holds scroll position and sticky-header behavior; memory and mounted-row count drop on long lists.

**Guardrails**
- [ ] No `React.memo` / `useMemo` / `useCallback` added without a before/after trace attached to the PR.
- [ ] The design system is not modified by any of this work — F2's fix is a rendering technique change only.
- [ ] Re-run this audit's git comparisons after the fixes to confirm no new blur/gradient/shadow/inline-style regressions:
      `for pat in BlurView LinearGradient shadowOpacity "style={{"; do git grep -c "$pat" HEAD -- apps/mobile/src | awk -F: '{s+=$3} END {print s+0}'; done`


---
---

# Phase 0 — Baseline capture and validation

**Status: PARTIALLY COMPLETE — static validation done, device measurement not run.**

## What was and was not done

| Phase 0 requirement | Status |
| --- | --- |
| 1. Two builds on one physical iPhone | **Not done** — no device attached to this session |
| 2. Six DevTools Profiler traces | **Not done** — cannot drive a device or read a profiler from here |
| 3. Dev-only instrumentation | **Done** — harness written, wired, type-checked, uncommitted |
| 4. Validate audit assumptions (6 sub-questions) | **2 of 6 answered statically**; 4 need the device run |
| 5. Instrumentation dev-only + removable | **Done** — `__DEV__`-gated, one grep to find, one command to remove |
| 6. No optimization / refactor / memoization | **Held** — no behavior changed |

Nothing in this section is estimated or inferred from a device. Tables that require
measurement are left as empty templates rather than filled with plausible numbers.

---

## Statically validated (requirement 4, typography sub-questions)

### Typography did NOT inflate content size — **disproven**

Effective `fontSize` across every `.ts/.tsx` in `apps/mobile/src`, resolving
`text.<role>.size` through `packages/shared/src/tokens.ts`:

| | Declarations | Mean size | >=17px |
| --- | --- | --- | --- |
| `a8ffd25` (good) | 2,608 | **14.10px** | 381 |
| `HEAD` | 2,704 | **14.08px** | 444 |

Per-size movement (good -> head): `11px` 294->197 (-97), **`12px` 437->787 (+350)**,
`13px` 456->357 (-99), **`14px` 443->279 (-164)**, `17px` 139->239 (+100),
`18px` 71->7 (-64), `30px` 24->3 (-21).

**Reading:** the mean is flat to two decimals. The largest single movement is
**downward** (14px -> 12px), i.e. body text got *smaller*, which reduces wrapping and
content height. Headings did move up (+63 net at >=17px), so isolated screens may wrap
differently, but there is no systemic type inflation that could explain an app-wide
slowdown.

**Caveat:** this counts style *declarations*, not rendered instances — a style used in a
list row renders many times. Strong proxy, not a measurement; a screen-level layout-pass
count from the device run supersedes it.

### Typography could NOT have enlarged the blur/compositing surfaces — **disproven**

`GlassQuickAction`'s blur is sized by an explicit `size` prop, never by its text:

    75: <View style={[styles.wrap, { width: Math.max(size, 68) }, style]}>
    83:   style={{ width: size, height: size, alignSelf: 'center' }}
    86:   <View style={[styles.clip, { width: size, height: size, ... }]}>

Its only in-window change made the label **smaller** (`fontSize: 11` -> `text.microLabel.size`
= 10) with `lineHeight` pinned at 14. `FloatingSupportButton` is likewise fixed-size
(`SIZE_MINIMIZED = 40`). Font changes cannot have grown either blur surface.

---

## Instrumentation harness (installed, uncommitted)

**New file:** `apps/mobile/src/lib/devPerfTrace.ts`
**Call sites:** 16, all tagged `// PERF-TRACE` — find with `grep -rn "PERF-TRACE" apps/mobile/src`

| File | What it records | Answers |
| --- | --- | --- |
| `hooks/useProfile.ts` | per-instance focus callbacks (`instance#N`); every `loadProfile` classified `forced`/`deduped`/`cached`/`cold`; every `emit` with live `listeners.size`; cumulative hook-body executions | F1 |
| `app/(tabs)/index.tsx` | each of the three focus effects by name; whether `communityCards` held data at the moment loading flipped on | F3 |
| `app/_layout.tsx` | `installNetworkCounter()` — every fetch with path, status, duration | network counts |

Design notes that matter for trusting the numbers:

- The per-instance id uses a `useRef`, **not** `usePathname()` — `usePathname` re-renders on
  every navigation and would contaminate the very render count being measured.
- `communityCardsRef` mirrors state so the loading-flip check reads the current value, not
  the focus callback's stale closure copy.
- Every export no-ops when `__DEV__` is false. Release overhead is one function call per
  event: no logging, no fetch wrapper.

**Removal (single command, after measurement):**

    rm apps/mobile/src/lib/devPerfTrace.ts
    git checkout -- apps/mobile/src/hooks/useProfile.ts       "apps/mobile/src/app/(tabs)/index.tsx" apps/mobile/src/app/_layout.tsx

---

## CORRECTION (2026-09-05): the first Phase 0 build instructions were wrong

The original instructions said to gate instrumentation on `__DEV__` **and** to run Metro with
`--no-dev --minify`. Those contradict each other: `--no-dev` sets `__DEV__ = false`, so the
harness would have produced an empty trace in exactly the build it was meant to measure. The
same instructions also implied React Profiler evidence would be available from a release build,
which it is not.

Corrected below. The harness is now gated on an explicit `EXPO_PUBLIC_PERF_TRACE=1` flag, and
the two build modes are separated with an honest statement of what each can and cannot produce.

---

## Build modes

### Build A - instrumented diagnostic (counts, not timings)

    cd apps/mobile
    EXPO_PUBLIC_PERF_TRACE=1 npx expo start --dev-client --no-dev --minify

Install/run the **development-profile** dev client on the device, then open the app from it.

| Property | Value |
| --- | --- |
| `__DEV__` | **false** (`--no-dev`) |
| `EXPO_PUBLIC_PERF_TRACE` | `1` - set inline on the Metro command above |
| `EXPO_PUBLIC_APP_ENV` | `development` (from the dev-client build) |
| PERF instrumentation | **active** - gated on the flag, not on `__DEV__` |
| React DevTools Profiler | **unavailable** - React runs in production mode with `--no-dev` |
| JS debugger | **must stay closed** - an attached debugger can halve JS throughput |

**What A is for:** exact counts - focus callbacks, `loadProfile` calls and their classification,
store emits, live subscriber counts, subscriber renders, Home focus effects, loading flips, and
network requests. JS speed is close to release, so its *relative* timings are usable; its
absolute timings still are not release numbers (Metro is attached).

### Build A2 - OPTIONAL, only if React commit counts are wanted

    cd apps/mobile
    EXPO_PUBLIC_PERF_TRACE=1 npx expo start --dev-client

| Property | Value |
| --- | --- |
| `__DEV__` | **true** |
| React DevTools Profiler | **available** - this is the only mode that gives commit counts |
| Perf Monitor (JS/UI FPS) | available via the dev menu |
| Timings | **invalid** - dev mode inflates everything; never quote A2 durations |

Run A2 only for interaction #2/#3 if you want React commit counts. Treat every number from it as
*relative*, never as a baseline.

### Build B - production-like (timings and FPS, no instrumentation)

    cd apps/mobile
    eas build --profile preview --platform ios

| Property | Value |
| --- | --- |
| `__DEV__` | **false** |
| `EXPO_PUBLIC_PERF_TRACE` | **unset** - no eas.json profile defines it |
| `EXPO_PUBLIC_APP_ENV` | `internal` |
| PERF instrumentation | **inert** - produces nothing, logs nothing |
| React DevTools Profiler | **unavailable** - do not claim profiler evidence from this build |

**What B is for:** real perceived responsiveness - startup, navigation, scrolling, FPS. No Metro,
no DevTools, no console output.

---

## Retrieving the trace from Build A (on-device viewer)

**Metro's console proved unreliable as the transport** - the first run produced no `[PERF]`
output at all - and the DevTools console cannot be open during a measurement without affecting
it. So the batch is delivered on-device instead. Console logging still happens; it is now a
fallback, not the mechanism.

A small **PERF** badge appears at the bottom-left of every screen when the harness is live.

| Step | Action |
| --- | --- |
| 1 | Launch the app. **The PERF badge is the activation check** - if it is not visible, the flag never reached the bundle and the run is void. |
| 2 | Tap the badge. The sheet must say **"PERF instrumentation ACTIVE"**. |
| 3 | Tap **RESET**, then **CLOSE**. |
| 4 | Perform exactly one scripted interaction. |
| 5 | Stop touching the device for ~2s so the buffer auto-flushes. |
| 6 | Tap the badge again. The completed batch is displayed. |
| 7 | **SHARE** it off-device (AirDrop/Notes/email), or long-press the text to select and copy. |
| 8 | Repeat from step 3 for the next interaction. |

The sheet is static: no animation, no live counter, and it subscribes to flushes only while
open - so it never re-renders as part of the interaction being measured.

Buttons: **RESET** clears the buffer and restarts the clock. **FLUSH** forces a batch immediately
instead of waiting for the quiet period. **SHARE** opens the OS share sheet with the batch text.

Files: `src/components/dev/PerfTraceOverlay.tsx` (viewer), `src/lib/devPerfTrace.ts` (harness).
Both render/return nothing unless `PERF_TRACE_ON`.

---

## Measuring FPS in Build B

The RN Perf Monitor is dev-only and does not exist in Build B. Use one of these instead:

**Instruments is not available on this project's toolchain (Windows host, no Xcode), so the
screen recording is the method - treated as qualitative evidence, never as FPS data.**

1. Install the EAS preview build on the iPhone.
2. Start an iOS screen recording (Control Centre -> Record).
3. Perform the scripted interactions at a deliberate, consistent pace, pausing ~2s between them
   so each is separable on the timeline.
4. Note where you see: obvious freezes, taps that respond late, loading flashes over content that
   was already on screen, uneven or stuttering scrolling.
5. Send the recording back alongside the Build A `[PERF]` summaries.

The recording answers **yes/no and where**, not how many frames. Any claim phrased as an FPS
number from this method is not supportable and must not enter the audit.

If Xcode ever becomes available, Instruments -> **Animation Hitches** would give a real hitch
time ratio and supersede this. Not required to complete Phase 0.

---

## Which results may be compared between builds

| Comparison | Legitimate? | Why |
| --- | --- | --- |
| A counts vs B counts | **Yes, by inference** | Same code paths run in both; B just does not report them. A's counts are facts about the logic, valid for B. |
| A timings vs B timings | **No** | Metro attached in A; different JS config. |
| A2 timings vs anything | **No** | Dev mode inflates everything. |
| A2 commit counts vs A2 commit counts (before/after a fix) | **Yes** | Relative, same mode both sides. |
| B timings vs B timings (before/after a fix) | **Yes** | This is the real acceptance test. |
| B FPS vs A/A2 FPS | **No** | Only B reflects release rendering. |
| Cold start A vs B | **No** | Compare B against B only. |

Rule of thumb: **counts come from A, verdicts about speed come from B.**

---

## Four separate metrics - never derive one from another

A store emit is not a notification, and a notification is not a render. React coalesces an
unknown number of listener notifications into far fewer renders, so the harness reports each
independently and derives none of them from the others.

| # | Metric | Where it is measured | Meaning |
| --- | --- | --- | --- |
| 1 | **Store emits** | `emit()` in `hooks/useProfile.ts` | How many times the store announced a change. |
| 2 | **Listener notifications dispatched** | sum of `listeners=N` across emits | Store-side work: callbacks invoked. **Not renders.** |
| 3 | **useProfile hook executions** | first statement of `useProfile()` | Actual renders of hook consumers, **after** React batching. Measured directly, never inferred. |
| 4 | **React commits** | Build A2 Profiler only | Not measured by this harness. Leave blank unless A2 was run. |

Expect **2 >> 3**. In the synthetic drill, 6 emits x 5 subscribers = 30 notifications against 15
hook executions — and even that ratio is an artifact of the script, not React. On device, a large
gap between 2 and 3 means React is absorbing the storm; a small gap means it is not. **That gap is
itself a finding**, which is why the two are never collapsed.

Caveats on metric 3, which is recorded during render:
- It counts hook executions, not commits. One commit may render several consumers; a commit
  rendering none of them is invisible here.
- A render React discards still counts.
- Build A2 only: StrictMode double-invocation can inflate it. Build A (`--no-dev`) is unaffected,
  so take metric 3 from **Build A**.

---

## Results form - fill this in, no profiler knowledge needed

### 1. Setup

| Field | Value |
| --- | --- |
| iPhone model / iOS version | |
| Signed-in account (same for all runs) | |
| Build A: `[PERF] instrumentation ACTIVE` line appeared? | YES / NO (NO = invalid run) |
| Build B: EAS build id | |
| FPS method used in B | Instruments / screen recording |

### 2. Per interaction - Build A (paste the BATCH summary numbers)

Run each interaction, wait for the batch to print, copy the six F1 numbers plus the F3 and
network lines. Use `__PERF_RESET__()` between interactions.

| # | Interaction | focus callbacks | distinct instances | loadProfile (forced/deduped/cached) | [1] emits | [2] notifications | [3] hook executions | [4] commits (A2 only) | net requests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Cold start -> Home | | | | | | | | |
| 2 | Home -> Games -> Home | | | | | | | | |
| 3 | Home -> Nearby -> Home | | | | | | | | |
| 4 | Home scroll 5s | | | | | | | | |
| 5 | 5 Quick Action presses | | | | | | | | |
| 6 | Modal open/close | | | | | | | | |

Home focus effects, from interactions 2 and 3 only:

| # | tournaments | pushToken | communityCards | loading flips over populated data |
| --- | --- | --- | --- | --- |
| 2 | | | | ___ of ___ |
| 3 | | | | ___ of ___ |

### 3. Per interaction - Build B (stopwatch / recording, no instrumentation)

| # | Interaction | Felt duration | Visible stutter? | Notes |
| --- | --- | --- | --- | --- |
| 1 | Cold start -> Home usable | | Y / N | |
| 2 | Home -> Games -> Home | | Y / N | |
| 3 | Home -> Nearby -> Home | | Y / N | |
| 4 | Home scroll 5s | n/a | Y / N | hitch ratio if Instruments: |
| 5 | 5 Quick Action presses | | Y / N | stutter *during* press animation? |
| 6 | Modal open/close | | Y / N | |

Control comparison for F2 - press a **non-blur** button (e.g. a Command Center Quick Action tile)
5 times in Build B:

| | Visible stutter? | Notes |
| --- | --- | --- |
| Blur tile press (Home) | Y / N | |
| Non-blur tile press (control) | Y / N | |

### 4. Verdicts - decided by the rule below, not by opinion

| Finding | Pre-Phase-0 rank | Verdict | Revised rank |
| --- | --- | --- | --- |
| F1 useProfile focus storm | Critical | CONFIRMED / DISPROVEN / REVISED | |
| F2 animated blur intensity | High | CONFIRMED / DISPROVEN / REVISED | |
| F3 Home triple focus refetch | High | CONFIRMED / DISPROVEN / REVISED | |

### 5. First-fix decision rule (fixed in advance)

Apply in order; the first rule that trips selects the fix.

- **F1** if interaction 2 or 3 shows `forced` >= 2, **or** metric [3] hook executions per navigation
  > 2x the subscriber count at emit. (Use [3]; never substitute [2] notifications here.)
- **F2** if Build B shows visible stutter on the blur tile press but **not** on the control press
  (or hitch ratio during Home scroll is materially worse than a non-blur screen).
- **F3** if `loading flips over populated data` is non-zero on **every** Home return.
- If none trip: the regression is **not** in F1-F3. Do not implement anything - reopen Phase 0
  with interactions 1 and 4 and widen to F4/F5.

Selected first fix: ______________  (evidence: ______________)

### 6. Acceptance metrics for the selected fix

| Metric | Baseline (from above) | Target | Must not regress |
| --- | --- | --- | --- |
| forced loadProfile per navigation | | <= 1 | auth gate: sign-in, sign-out, token refresh, account switch |
| useProfile hook executions [3] per navigation | | >= 50% reduction | profile updates still appear after editing profile elsewhere |
| net requests on Home return | | <= 1 when data < 30s old | joining/leaving an event still updates the Home list |
| Blur tile press stutter (Build B) | | matches control | `GlassQuickAction` press state visually unchanged |

---

## Harness dry-run (verified 2026-09-05, before any device time)

The harness was compiled standalone and executed in Node with synthetic events, to prove it
works before a device session is spent on it. Two runs:

**ON path** (`EXPO_PUBLIC_PERF_TRACE=1`, `EXPO_PUBLIC_APP_ENV=development`) - fed a synthetic
"three mounted useProfile instances each force-loading over 5 subscribers" navigation:

- `[PERF] instrumentation ACTIVE` printed on import - the go/no-go line appears as documented.
- Buffered silently, then auto-flushed with no manual call.
- Summary math correct: `focus callbacks 3`, `distinct instances 3`, `forced=3`, `emits 6`,
  `notifications dispatched 30`, `subscribers min=5 max=5`, `hook executions 15`, `flips 1 of 1`.

**What the dry run does NOT prove.** The `15` above came from the drill script calling
`traceProfileRender()` by hand, not from React. Node cannot exercise React Native's render
batching, so the dry run validates **event buffering, summary arithmetic and output format only**.
The real relationship between notifications and renders is measurable only on device.

**OFF path** (flag deliberately leaked into `EXPO_PUBLIC_APP_ENV=production`):

- `PERF_TRACE_ON = false`
- `fetch` **not** wrapped (verified by identity comparison against the original)
- `__PERF_FLUSH__` / `__PERF_RESET__` **not** installed on globalThis
- `flush()` called explicitly printed nothing

So the production stop is verified at runtime, not merely by reading the expression.

---

## Ship safety - can this instrumentation reach production?

**No, and it is enforced by two independent conditions.**

    export const PERF_TRACE_ON =
      process.env.EXPO_PUBLIC_PERF_TRACE === '1' &&
      process.env.EXPO_PUBLIC_APP_ENV !== 'production';

Verified by evaluating the same expression under each env combination:

| `EXPO_PUBLIC_PERF_TRACE` | `EXPO_PUBLIC_APP_ENV` | `PERF_TRACE_ON` |
| --- | --- | --- |
| unset | `production` | **false** |
| `1` (leaked in) | `production` | **false** |
| unset | `internal` (preview) | **false** |
| `1` | `development` | **true** |

Additional guarantees:

- `grep -c EXPO_PUBLIC_PERF_TRACE eas.json app.config.js` -> **0 and 0**. No build profile
  defines the flag, so it is `undefined` in every EAS build unless a human adds it by hand.
- The flag must be typed onto the Metro command line to take effect - it cannot arrive by accident.
- Even with instrumentation active, nothing is written to disk or sent off-device; output goes to
  the attached Metro terminal only.
- Every entry point returns early when `PERF_TRACE_ON` is false: no buffering, no fetch wrapper,
  no logging.
- The whole harness is **uncommitted** and removed by one command (see above), so the normal
  release path never contains it.

**Residual risk:** if the harness were committed *and* someone hand-added the flag to the preview
profile, a preview build would log to a console nobody is attached to. Production remains blocked
regardless. The mitigation is the removal step - do not commit this harness.

---

## MEASURED RESULTS (device run, 2026-09-05)

Device: user's iPhone, dev client build `a911ad9c` (runtimeVersion `9e5109d0...`), Metro dev
server. Harness v3 (after three defect fixes - see below). Account constant across runs.

### Interactions 2 and 3 - the F1/F3 deciders

| Metric | #2 Home->Events->Home | #3 Home->Nearby->Home |
| --- | --- | --- |
| focus callbacks fired | 2 | 2 |
| distinct hook instances | 2 (`#3`, `#2`) | 2 (`#3`, `#2`) |
| loadProfile calls, force=true | 2 of 2 | 2 of 2 |
| **dedupe BYPASSED (F1 signal)** | **2** | **2** |
| [1] store emits | 3 | 3 |
| [2] notifications dispatched | 18 | 18 |
| live subscribers at emit | 6 | 6 |
| [3] hook executions IN BATCH | 11 | 10 |
| **ratio [3] / subscribers** | **1.83x** | **1.67x** |
| network requests | 10 | 10 |
| Home focus effects fired | 1 / 1 / 1 | 1 / 1 / 1 |
| **loading flip over populated data** | **1 of 1** | **1 of 1** |

### All six interactions

| # | Interaction | Result |
| --- | --- | --- |
| 1 | Cold start | Smoke test only - pre-fix harness, not valid baseline evidence |
| 2 | Home -> Events -> Home | 2 force=true loads, **2 dedupe bypasses**, 10 requests, ~11 hook executions, loading flip 1/1 |
| 3 | Home -> Nearby -> Home | Reproduced: 2 loads, **2 bypasses**, 10 requests, ~10 hook executions, loading flip 1/1 |
| 4 | Home scrolling (~5s) | **CLEAN** - no profile activity, no Home refetch, no profile renders |
| 5 | Quick Action press x5 | **CLEAN** - no profile activity, no Home refetch |
| 6 | Modal open/close | 2 loads, **2 bypasses**, 10 requests, 8 hook executions, **populated Home content reset to loading** |

### What interactions 4, 5 and 6 establish

**Scrolling and pressing are not the problem.** Both were completely clean of profile churn and
Home refetching. Whatever cost exists during scroll or a Quick Action press is *rendering* cost -
which only Build B (F2, blur) can speak to. F1 and F3 are exonerated for those two interactions.

**Opening and closing a modal costs the same as a full navigation.** Interaction 6 produced the
identical cascade: 2 dedupe bypasses, 10 network requests, and a visible reset of populated Home
content to a loading state. A modal open/close should be nearly free; instead Home blurs and
refocuses, re-firing all three focus effects plus both forced profile loads.

That widens F3's blast radius considerably. The trigger is not "tab navigation" - it is **any
event that makes Home lose and regain focus**, which includes modals. Interaction 6 is the most
frequent of the three in ordinary use.

### Verdicts

**F1 - CONFIRMED, but REVISED (mechanism is duplicate requests, not a re-render storm).**

The predicted mechanism is real and captured directly:

    profile.focus  instance#3
    profile.load   force=true state=inflight dedupeBypassed=true
    profile.focus  instance#2
    profile.load   force=true state=inflight dedupeBypassed=true
    net.start      /rest/v1/profiles      <- duplicate
    net.start      /rest/v1/profiles      <- duplicate

Two hook instances fire focus callbacks ~1-5ms apart; both force past the in-flight dedupe;
two identical profile requests go out. Reproduced identically on both navigations.

**What the audit got wrong:** it claimed "re-renders every subscriber on every focus", projecting
`2N x subscribers`. Measured, React coalesced 18 notifications into 10-11 hook executions -
**1.67x-1.83x**, below the 2.00x threshold the rule set. The re-render amplification is NOT
happening. Also, "17 components call useProfile" was a count of call sites; the real concurrent
subscriber count is **6**, and only **2** instances actually fire focus callbacks.

Measured cost per navigation: **one wasted `/rest/v1/profiles` request (~90ms)**.

**F3 - CONFIRMED as specified.** All three Home focus effects re-fire on every return, and
`hadDataBeforeFlip=true` on **2 of 2** returns: Home tears populated content back into a loading
state each time. The three effects plus their cascades account for **8 of the 10** requests per
Home return.

**F2 - NOT TESTED.** Requires the Build B screen recording; no counts can decide it.

### Unplanned finding: duplicate requests beyond the profile store

Every Home return issued four duplicated pairs:

    /rest/v1/profiles                  x2
    /rest/v1/play_participants         x2
    /rest/v1/play_events               x2
    /rest/v1/play_participants_public  x2

Only the first pair is F1's. The rest come from Home's own effects and are not described anywhere
in this audit. Worth a separate investigation; not folded into F1/F2/F3.

### Harness defects found and fixed during the run

Recorded because each would have corrupted a verdict:

1. **`forced` misclassified** - `force=true` was only reported when a request was already in
   flight, so the F1 rule ("forced >= 2") would almost never have tripped. Replaced with
   independent `force` / `state` / `dedupeBypassed` fields. **Without this fix F1 would have been
   wrongly disproven.**
2. **Network counter captured nothing** - `lib/supabase.ts` calls `createClient()` at module
   scope and resolves fetch there, before the patch ran. Fixed by making `devPerfTrace` the first
   import in `_layout.tsx`, self-installing on load. First batch showed 0 requests during a real
   profile load; after the fix, 10 per navigation.
3. **Metric [3] was cumulative, not per-batch** - the module-level counter survives `perfReset()`,
   so the summary reported the session total (144, 165) instead of the interaction count (11, 10).
   A ~13x overstatement. **Without this fix F1's ratio clause would have "confirmed" on false
   data.**

---

## Phase 0 exit criteria

Phase 0 is complete when: both builds are measured on the same device, all six traces are
captured, every _pending_ cell above is filled, F1/F2/F3 each carry a confirmed / disproven /
revised verdict, and the decision rule has selected exactly one first fix. Implementation
does not begin before that.

---
---

# F1 implementation (2026-09-06)

**Status: CODE COMPLETE. Static verification done (typecheck, lint, standalone state-machine
drill). Device re-measurement (Build A) NOT yet run — this section stops before F3, per scope.**

## What changed

**File:** `apps/mobile/src/hooks/useProfile.ts` — `loadProfile()`, its two call sites, and the
module-level store fields. No other file touched. F3, F7, F2 (blur), F4 (virtualization) are
explicitly **not** part of this change.

1. **In-flight requests are always reused, including when `force=true`.** The dedupe check moved
   above the force check: `if (inFlight) return inFlight;` now runs unconditionally. Previously
   `if (inFlight && !force) return inFlight;` let a forced call — which is what every focus effect
   passed — skip the join and issue its own network request. This was the direct cause of the
   measured "2 dedupe bypasses / 2 duplicate `/profiles` requests" per Home return.

2. **`force` is redefined.** It no longer means "bypass in-flight dedupe" — it means "bypass the
   freshness window" (see #3). Identity change, token change, `reloadProfile()` (explicit retry),
   and `onProfileUpdated` (explicit "I just edited my profile elsewhere") still pass `force: true`;
   they are the "explicit refresh" cases requirement 5 asks to preserve.

3. **A 30s freshness window (`FRESHNESS_WINDOW_MS`) gates non-forced refreshes.** A focus-triggered
   `loadProfile(id, false)` within 30s of the last *successful* load is a no-op
   (`return Promise.resolve()`) instead of a network call. The focus effect itself changed from
   `loadProfile(currentUserId, true)` to `loadProfile(currentUserId, false)` — this is what actually
   makes ordinary tab navigation stop refetching.

4. **A refresh over an already-known profile never sets a blocking loading state.** `loadingProfile`
   / `profileStatus = 'loading'` / the `emit('load:start')` now only fire when `profileState` is
   `null` at the start of the call. A background refresh (cache present, window elapsed, or forced)
   fetches silently and only `emit()`s once on settle — subscribers keep rendering the cached
   profile throughout. Symmetrically, a **failed** background refresh no longer nulls out a good
   cached profile (it only did that when there was nothing cached to fall back on already).

## Defect found and fixed during implementation (not part of the four requirements, but load-bearing for them)

`inFlight = p.finally(() => { if (inFlight === p) inFlight = null; });` compares the module-level
`inFlight` against `p` — the *unwrapped* settle promise — while `inFlight` is always assigned the
*wrapped* `.finally()` promise, a different object. That comparison was never true, so `inFlight`
was **never reset to `null`** after a request settled.

This was invisible in the pre-fix code because every focus call passed `force=true`, and the old
`if (inFlight && !force)` check meant force always skipped the `inFlight` gate regardless of its
value. Requirement 1 removes that bypass — making `inFlight`'s lifecycle load-bearing for every
call for the first time. Without fixing the comparison, the store would have issued exactly one
request ever, then silently served the same stale resolved promise forever. Fixed by capturing the
wrapped promise in a local (`thisInFlight`) before the comparison, so identity is checked against
the right object. Caught by the standalone drill (see below), not by inspection — recorded here
because it is exactly the kind of defect the harness's own "harness dry-run" section warns about:
worth naming so it isn't silently re-introduced.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean, no errors.

**2. Lint.** `npx eslint src/hooks/useProfile.ts` — clean, no errors or warnings. (Full
`expo lint` run: 68 pre-existing warnings across the app, 0 in this file, 0 errors overall —
unrelated to this change.)

**3. Standalone state-machine drill (no test runner configured in this app — see
`apps/mobile/package.json`, no jest/vitest).** Reproduced `loadProfile()`'s exact logic in plain
Node (same method as the audit's own Phase 0 "Harness dry-run") and asserted against each
requirement directly:

| Requirement | Assertion | Result |
| --- | --- | --- |
| 1 — in-flight always reused | 3 overlapping calls (`false`, `true`, `true`) against a pending fetch issue exactly 1 network request and share the identical promise | **PASS** |
| 2 — force bypasses freshness, not dedupe | `force=true` on fresh cached data (15s old, inside the 30s window) still issues a new request | **PASS** |
| 3 — freshness window | non-forced call at +5s (inside window) issues no request; non-forced call at +31s (outside window) does | **PASS** |
| 4 — background refresh doesn't block | mid-refresh over cached data: `loadingProfile` stays `false`, `profileStatus` stays `'loaded'`, cached data remains readable; a failed background refresh preserves the good cached profile and does not flip status to `'error'` | **PASS** |
| (latent defect) | `inFlight` correctly returns to `null` once a request settles, so a later call past the freshness window issues a genuinely new request rather than replaying a stale resolved promise | **PASS** (only after the identity-comparison fix above) |

All 4 requirement checks plus the defect regression check passed. Script kept at
`f1_verify.js` in the session scratchpad (not part of the repo) — this is a logic drill, not a
substitute for the device re-measurement below.

**4. Auth-gate semantics (requirement 5), verified by reading, not by running a simulator.**
`resolveAuthGate()` (`apps/mobile/src/lib/authGate.ts`) keys off `ProfileStatus`
(`idle`/`loading`/`loaded`/`error`) plus `profile`. Traced every transition:
- **Sign-in / account switch** (`userChanged`): `profileState` is explicitly nulled before the
  forced load, so `hadCachedProfile` is `false` — the gate still sees `'loading'` until settle,
  exactly as before.
- **Sign-out**: `resetProfileStore()` unchanged in effect (now also clears the new `lastLoadedAt`
  field) — gate sees `'idle'`/no session, unchanged.
- **Token refresh** (`tokenChanged`): still forces (bypasses freshness), but now — since a cached
  profile is normally present — goes through the *background*-refresh path instead of flipping to
  `'loading'`. This does not change the gate's eventual outcome (still resolves to `'ready'` /
  `'error'`); it removes a `'loading'` flash during a silent token refresh that previously existed
  and was never a deliberate product behavior.
- **Explicit refresh** (`reloadProfile()` retry-after-error, `onProfileUpdated`): still force `true`,
  still bypasses the freshness window, so an explicit retry or a same-session profile edit is never
  silently dropped.
- 18 call sites of `useProfile()`/`reloadProfile()` were enumerated; none call the underlying
  `loadProfile()` directly, so the whole change surface is contained to this one file.

**5. NOT done — flagged, not skipped silently.** No on-device Build A re-run yet. The acceptance
criteria that require it (no duplicate `/profiles` requests on Home→Events→Home, "dedupe BYPASSED"
= 0, cached content visibly present during a real network refresh, actual sign-in/sign-out/account
switch on a real device) are **pending**, not claimed. The instrumentation this needs
(`traceProfileLoad`'s `dedupeBypassed` field) is unchanged and still emits meaningful data post-fix
— see note below — so the existing Build A method from Phase 0 applies without modification.

## Note on the kept harness's "dedupe BYPASSED" metric

`devPerfTrace.ts` computes `bypassed = force && inFlight` at the top of `loadProfile()`, before the
new dedupe-first branch runs. Post-fix this combination **no longer causes a duplicate request** —
`force`+`inFlight` now always joins the existing promise — so a nonzero reading here would mean
"force was called while something was in flight" (now harmless, always joined) rather than "a
duplicate request was issued." In the scripted Home→Events→Home / Home→Nearby→Home flows this
should read **0**, which is also the acceptance criterion, so the metric still does the job asked
of it. Left unmodified in `devPerfTrace.ts` per requirement 7 (harness kept for before/after
verification); a comment was added at the `traceProfileLoad` call site in `useProfile.ts` noting the
change in meaning.

## Acceptance criteria — status

| Criterion | Status |
| --- | --- |
| Home → Events → Home produces no duplicate `/profiles` requests | **Expected by code logic + drill; not yet confirmed on-device** |
| "dedupe BYPASSED" equals zero | **Expected; not yet confirmed on-device** |
| At most one profile request active at a time | **PASS — enforced unconditionally by `if (inFlight) return inFlight;`, verified by drill** |
| Cached profile content remains available during refresh | **PASS — verified by drill (mid-refresh and failed-refresh cases)** |
| Sign-in / sign-out / token refresh / account switch / auth-gate routing correct | **Sign-out→sign-in CONFIRMED live on-device (see below). Token refresh and account switch: PASS by code tracing only, not exercised live — see device re-measurement section** |
| TypeScript, lint, targeted tests pass | **PASS — tsc clean, eslint clean, standalone drill 15/15 assertions pass (no test runner exists in this app to run "tests" in the Jest sense)** |

## Device re-measurement (2026-09-06) — in progress

Build A re-run on the user's iPhone, same method as Phase 0 (`EXPO_PUBLIC_PERF_TRACE=1 npx expo
start --dev-client --no-dev --minify -c`), dev-client build (separate from the `preview` profile
build — the preview build has no `developmentClient: true` in `eas.json` and cannot connect to
Metro at all, which is why the first connection attempt opened the standalone preview app instead).

### Interaction 2 — Home → Events → Home (BATCH 3, 453ms)

| Metric | Phase 0 baseline | Post-fix | |
| --- | --- | --- | --- |
| `loadProfile` calls, `force=true` | 2 of 2 | **0 of 2** | both calls now pass `force=false` from the focus effect, as intended |
| dedupe BYPASSED | **2** | **0** | **acceptance criterion met** |
| store emits | 3 | **0** | both calls hit the freshness window (`state=cached`) and returned `Promise.resolve()` with no fetch, no emit, no subscriber touch |
| `/rest/v1/profiles` requests | 2 (duplicate) | **0** | **acceptance criterion met — no duplicate `/profiles` requests** |
| total network requests | 10 | **8** | exactly the 2 profile duplicates removed; the other 3 duplicated pairs (`play_participants`, `play_events`, `play_participants_public`) are unchanged — those belong to the unplanned finding under F3's umbrella, not touched by this fix |
| Home focus effects (F3, untouched) | 1/1/1, flip 1 of 1 | 1/1/1, flip 1 of 1 | **unchanged, as expected** — F3 is a separate, not-yet-implemented fix |

**Read:** the fix behaves exactly as designed for this interaction. Because the two focus calls
landed inside `FRESHNESS_WINDOW_MS`, this run didn't exercise the "at most one profile request
active" or "cached content available during refresh" paths (there was no request to be in flight
or to refresh over) — those are confirmed structurally by the standalone drill above, and will be
exercised on-device by interaction 3 if enough time has elapsed since the last profile load, or by
waiting >30s before repeating an interaction.

### Interaction 3 — Home → Nearby → Home (BATCH 5, 458ms)

This run landed **past** the freshness window, which is the scenario interaction 2 didn't exercise —
a genuine background refresh with the original two-instances-racing pattern:

| Metric | Phase 0 baseline | Post-fix | |
| --- | --- | --- | --- |
| dedupe BYPASSED | 2 | **0** | **acceptance criterion met** |
| `/rest/v1/profiles` requests | 2 (duplicate) | **1** | **acceptance criterion met — no duplicate requests** |
| profile requests active at once | 2 (race) | **1** | `instance#3` fired first (`state=cached`, past window) and issued the request; `instance#2` fired 2ms later at `state=inflight` and joined it instead of issuing its own — **the exact race that used to duplicate the request, now collapsed to one caller** |
| store emits | 3 | **1** (`reason=load:settled` only) | **no `load:start` emit at all** — confirms live, not just in the drill, that a background refresh over cached data never flips the store into a blocking loading state |
| total network requests | 10 | **9** | one profile duplicate removed (the other was avoided entirely in interaction 2) |
| Home focus effects (F3, untouched) | 1/1/1, flip 1 of 1 | 1/1/1, flip 1 of 1 | unchanged, as expected |

**Read:** together, interactions 2 and 3 now cover all the on-device acceptance criteria that were
previously marked "expected, not yet confirmed":

| Criterion | Status |
| --- | --- |
| Home → Events → Home / Home → Nearby → Home produce no duplicate `/profiles` requests | **CONFIRMED on-device** (both interactions) |
| "dedupe BYPASSED" equals zero | **CONFIRMED on-device** (0 in both batches) |
| At most one profile request active | **CONFIRMED on-device** — interaction 3 shows the two-instance race collapsing to one in-flight request instead of two |
| Cached profile content remains available during refresh | **CONFIRMED on-device** — interaction 3's single `load:settled` emit with no preceding `load:start` shows subscribers never left `'loaded'` during the refresh |

### Interaction 6 — Modal open/close

**Pending.** Optional but useful — this was the worst offender in Phase 0 (identical cascade to a
full navigation). Not yet captured; not required to close out F1 given interactions 2 and 3 already
cover every F1 acceptance criterion above.

### Auth-gate live pass (BATCH 9) — Sign-out → Sign-in, same account

| Metric | Result |
| --- | --- |
| `loadProfile` calls | 4 total: **1** `force=true, state=cold` (the `userChanged` branch, sign-in) → **1** `force=false, state=inflight` (a second `useProfile` instance joining it, correctly) → **2** `force=false, state=cached` (later instances, inside the freshness window from the just-settled sign-in load, correctly no-op) |
| dedupe BYPASSED | **0** |
| `/rest/v1/profiles` requests | **1** — no duplicate, even under real sign-out/sign-in churn |
| Post-sign-in state | Landed on the fresh, correct profile — no stale leftover from the prior session |

**Read:** the identity-change path (`userChanged` in `useProfile.ts`) still forces a cold load
correctly, and every other concurrent `useProfile` instance still either joins the in-flight
request or respects the freshness window — exactly as requirement 5 asked. This is the first live
confirmation of the fix under real Supabase auth events, not just code tracing.

**Account switch: CONFIRMED on-device (2026-09-07)**, user tested directly with a second account —
no stale profile carryover, no duplicate requests reported.

**Not exercised:** token refresh — no way to force it on demand in this codebase; accepted as
verified by code tracing against `resolveAuthGate()` only (same code path as the now-confirmed
identity-change branch, low risk).

### Interaction 6 — Modal open/close (BATCH 22)

Captured, but **does not reproduce the Phase 0 baseline**: 2 `profile.renders`, 0 network requests,
**0 `home.focus` events** — Phase 0's interaction 6 showed the modal re-firing all three Home focus
effects plus 2 profile loads (the "any event that makes Home lose and regain focus" finding). This
single data point isn't enough to say that finding is resolved or was never reproducible with this
particular modal — worth re-checking with the *same* modal Phase 0 used before drawing a conclusion,
but it is out of scope here regardless: that cascade is F3's territory, not F1's, and F3 has not been
touched.

## Status

F1 is implemented and its acceptance criteria are confirmed both structurally (standalone drill)
and live on-device across two focus-navigation interactions and one real sign-out/sign-in cycle.
Token refresh and account switch remain unexercised live (see above) but are low-risk — same code
path as the confirmed identity-change branch.

---
---

# F3 implementation (2026-09-06)

**Status: CODE COMPLETE. Static verification done (typecheck, lint, standalone state-machine
drill). Device re-measurement NOT yet run.**

## What changed

**File:** `apps/mobile/src/app/(tabs)/index.tsx` — the three `useFocusEffect` blocks (`tournaments`,
`pushToken`, `communityCards`) and their supporting refs. No other file touched.

1. **A 30s freshness gate (`HOME_FOCUS_FRESHNESS_MS`, same floor as F1) on all three effects.** Each
   effect tracks its own last-successful-fetch timestamp in a `useRef`. A focus within the window is
   a no-op — the effects still exist to catch real staleness (registering/joining elsewhere and
   coming back), they just stop re-running on every tab-switch or modal blur/refocus a few seconds
   apart.
2. **`pushToken` and `communityCards` key their freshness check by user id, not just time.** A
   different signed-in user is never treated as "fresh" from the previous one's fetch, even inside
   the window — this mirrors F1's identity-change bypass and is verified by drill (test 3 below).
3. **`communityCards` no longer resets to a loading state over cards already on screen.** Previously
   `setCommunityLoading(true)` ran unconditionally at the top of every focus. Now it only runs when
   nothing is on screen yet (`hadData` false) — a background refresh keeps showing the existing list
   while it fetches.
4. **Unscoped fix, applied alongside F3 with the user's explicit sign-off:** the `tournaments`
   effect's error handler unconditionally cleared the list to `[]` on any failed fetch — including a
   failed *background* refresh over a list that was already showing good data. Same defect class as
   the profile-store fix in F1. Now only a failed **cold** load (nothing on screen yet) clears to
   empty; a failed background refresh preserves the existing list.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean, no errors.

**2. Lint.** `npx eslint "src/app/(tabs)/index.tsx"` — clean, no errors or warnings.

**3. Standalone state-machine drill** (same method as F1's — no test runner configured in this app).
Reproduced the three effects' exact gating/loading/error logic in plain Node:

| Check | Result |
| --- | --- |
| Rapid re-focus inside the window issues no new request; past the window issues one | **PASS** |
| A refresh over cards already on screen never flips loading true; cached cards stay visible mid-refresh; failed refresh doesn't apply | **PASS** |
| Switching users bypasses the freshness window (never served stale data from the previous user) | **PASS** |
| A failed cold fetch still surfaces an error (F3 didn't touch error-surfacing) | **PASS** |
| Tournaments: failed background refresh preserves the existing list; failed cold load still clears to empty (unchanged) | **PASS** |

All 16 assertions pass. Script at `f3_verify.js` in the session scratchpad — logic drill, not a
substitute for the device re-measurement below.

## Note on the kept harness's "loading flips over populated data" metric

`traceHomeLoadingFlip(hadData)` in `communityCards` still fires on every focus with the same
argument as before (whether cards existed at that moment). Post-fix, a `true` reading here **no
longer implies a clobber** — the code no longer sets `communityLoading` in that branch — it only
means data existed at focus time. Left unmodified (matches the F1 precedent for `dedupeBypassed`);
a comment was added at the call site noting the change in meaning. The Phase 0 baseline read
"flip 1 of 1"; a post-fix batch inside the freshness window should show the effect skipped
entirely, and one taken past the window should show `hadData=true` with no actual loading-state
change (verifiable in a batch by the absence of any visible loading flash and by request count).

## Acceptance criteria — status (from the "Gate before proceeding" line in the prioritized plan: "Home focus commit count drops; staleness bugs in the effect comments do not return")

| Criterion | Status |
| --- | --- |
| Home focus issues ≤1 network round trip when data is fresh | **Expected by code logic + drill; not yet confirmed on-device** |
| Leaving and rejoining an event still updates the list (the staleness bug the effects' comments document) | **Expected — the freshness window (30s) is well under the time it takes to navigate away, join/register, and return in real use; not yet confirmed on-device** |
| `communityLoading` no longer flips over populated data | **PASS by drill; not yet confirmed on-device** |
| TypeScript, lint, targeted tests pass | **PASS — tsc clean, eslint clean, standalone drill 16/16 assertions pass** |

## Device re-measurement (2026-09-06)

### False start: stale bundle

The first two capture attempts (rapid Home→Events→Home→Events→Home under one RESET) showed the
freshness gate having **no effect at all** — both round trips issued the full, identical set of
network requests (`tournaments`, `push_tokens`, `play_participants`) only ~2.85s apart, well inside
the 30s window. Root cause: the F3 code was edited into `index.tsx` **after** the Metro session
(Build A) was already running. Build A runs with `--no-dev` (deliberate — closer to release JS
speed), and Fast Refresh does not reliably apply under `--no-dev`. The device was still executing
the pre-F3 bundle; F1's numbers looked correct in the same batches only because F1 was implemented
before that Metro session started. Fixed by a full force-quit and relaunch of the dev client, which
forces a fresh bundle request. **Lesson for future device sessions in this audit: a code change
made mid-session requires a hard relaunch, not just backgrounding the app, before the next capture
is trusted.**

### Confirmed, post-relaunch (BATCH 5)

Two Home→Events→Home round trips back-to-back under one RESET, ~11.9s apart (well inside the 30s
window). The batch shown is the **second** round trip:

| Metric | Result |
| --- | --- |
| `home.focus` fired for all 3 effects | Yes — the effects still run and still evaluate freshness |
| Network requests | **0 / 0** — the freshness gate skipped all three fetches entirely |
| dedupe BYPASSED | 0 |
| Profile store | Also correctly skipped (F1, unchanged) |

**Read:** this confirms the "Home focus issues ≤1 network round trip when data is fresh"
acceptance criterion directly — in this case zero, since even the first request of the pair wasn't
needed again. Combined with the earlier `RESET → Home → Events → Home` runs (BATCH 25/27, ~30-60s
apart in wall-clock terms), which correctly refetched because real time had elapsed past the
window, both sides of the gate are now verified live: **it refetches when actually stale, and skips
when it isn't.**

## Acceptance criteria — updated status

| Criterion | Status |
| --- | --- |
| Home focus issues ≤1 network round trip when data is fresh | **CONFIRMED on-device** (BATCH 5: 0 requests on a rapid repeat) |
| Leaving and rejoining an event still updates the list | **Not yet explicitly exercised** (join/leave-then-return within the window would need to still show up — see Next step) |
| `communityLoading` no longer flips over populated data | **PASS by drill; not yet directly observable on-device** (the trace can't see the boolean itself — see the harness note above) |
| TypeScript, lint, targeted tests pass | **PASS** |

## Regression found and fixed: freshness window resurrected the exact staleness bug it was warned about

The one remaining live check above **failed**. User joined an event on `community/[id].tsx`,
returned to Home within the freshness window, and the PERF batch confirmed the mechanism directly:

    home.focus         effect=communityCards
    (requests started / completed : 0 / 0)

Zero requests — the freshness gate correctly identified the visit as "not stale by time" and
skipped the refetch entirely. But time-based freshness was never the right proxy for this
specific list: the comment the original effect carried — *"otherwise leaving/joining an event on
another screen leaves this list showing stale 'Joined' status and counts"* — describes an
event-driven staleness cause, not a time-driven one, and a pure timer cannot distinguish "nothing
changed in the last 5s" from "I personally just changed something 5s ago." **User confirmed on
device: the joined event still showed as not-joined on Home.** This is a real regression introduced
by the F3 freshness gate, not a measurement artifact.

**Fix:** an explicit invalidation signal, the same shape as F1's `onProfileUpdated` /
`notifyProfileUpdated()` pair.

- **New file:** `apps/mobile/src/lib/playEventsEvents.ts` — `notifyPlayEventsUpdated()` /
  `onPlayEventsUpdated(listener)`, identical pattern to `profileEvents.ts`.
- **`apps/mobile/src/app/community/[id].tsx`** calls `notifyPlayEventsUpdated()` after each of the
  three real (database-backed) join/leave success paths: the authenticated join in
  `handleCTAPress`, `submitGuestJoin`, and `doLeaveEvent`. The fourth "join" code path in this file
  (`userStatus === 'not_joined'` / `'invited'` branches further down `handleCTAPress`) is
  **deliberately not wired up** — it's explicitly commented "Mock / non-UUID path", local-only demo
  state with no real `play_participants` row, so there is nothing for Home's real fetch to reflect.
- **`apps/mobile/src/app/(tabs)/index.tsx`**: `communityCards`'s focus effect now subscribes to
  `onPlayEventsUpdated` for the component's lifetime (a plain `useEffect`, not focus-gated, so it
  catches the event even while Home is backgrounded) and sets a `communityDirtyRef` flag. The
  freshness check becomes `!communityDirtyRef.current && ...(the existing time/identity check)` —
  a pending invalidation always forces a refetch, consumed (cleared) the moment it's used, exactly
  mirroring how F1's `force` bypasses its own freshness window.

## Verification performed on the fix

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on all three touched files — clean, no errors or warnings.

**3. Standalone drill, extended (test 6).** Reproduced the dirty-flag bypass logic in the same
Node harness: a cold fetch populates the list; `markDirty()` (standing in for
`notifyPlayEventsUpdated()`) is set 5s later, still well inside the 30s window; the very next focus
refetches anyway (bypassing freshness) and shows the updated join status; the flag is consumed —
the *following* focus goes back to respecting the freshness window normally. All 21 assertions
across the full F3 suite pass (`f3_verify.js` in the session scratchpad).

## Status

F3, including this fix, is code-complete and passes static verification. **Not yet re-confirmed on
device** — the join/leave-then-return-to-Home check needs to be repeated after a hard relaunch of
the dev client (same lesson as before: Metro under `--no-dev` needs a full app kill-and-reopen to
pick up mid-session edits, not just backgrounding).

## Regression fix confirmed on-device (BATCH 4, post-relaunch)

User left an event on `community/[id].tsx`, returned to Home inside the freshness window. Result:

| Effect | Requests issued | Read |
| --- | --- | --- |
| `communityCards` | **Yes** — `play_participants`, `play_events`, `play_participants_public` | dirty flag correctly forced the bypass |
| `tournaments` | No | correctly stayed skipped — unaffected by a play-event join/leave |
| `pushToken` | No | correctly stayed skipped — unaffected by a play-event join/leave |

**User confirmed visually: Home now correctly shows the event as left**, immediately, inside the
window that previously showed stale data. The fix is precise — only the one effect actually
affected by the invalidation refetches; the other two continue to respect the freshness window
normally, so this did not regress into "always refetch on any focus."

## Status — F3 complete

F3 (staleness gate + no-loading-clobber + the tournaments failed-refresh preservation fix) plus the
join/leave invalidation regression fix are all implemented, statically verified (tsc, eslint, 21/21
drill assertions), and confirmed live on-device across: rapid repeat skipping (BATCH 5), genuine
staleness refetching after real elapsed time (BATCH 25/27), and now event-driven invalidation
correctly overriding the window for exactly the one affected list (BATCH 4).

---
---

# F7 implementation, partial (2026-09-06)

**Status: Step 1 (false empty state) done and statically verified. Steps 2-3 (weather skeleton,
full-screen-loader-to-shell) deferred — see below. Device re-measurement NOT yet run.**

## What changed

**File:** `apps/mobile/src/app/(tabs)/games.tsx` only.

1. Added `upcomingLoading` state, `true` initially, flipped to `false` exactly once — in `.finally()`
   on the first `Promise.all` fetch settling (success or failure), or immediately for a guest (no
   session, nothing more will load). **Never flipped back to `true`** on a later focus, by
   construction — same discipline as F3's "don't reintroduce a loading flip over populated data."
2. Passed `loading={upcomingLoading}` into `UpcomingContent`.
3. `UpcomingContent`'s `isEmpty` changed from `events.length === 0 && tournaments.length === 0` to
   `!loading && events.length === 0 && tournaments.length === 0` — the empty-state copy no longer
   renders while the initial fetch is still in flight; a small spinner shows instead (mirrors the
   `loading ? 'Loading…' : 'No past events'` pattern already used correctly by this same file's
   `PastContent`).

This also covers the audit's fix item 2 (preserve data during background refresh) for free: since
`upcomingLoading` only ever flips once, a background refetch on a later focus updates `upcoming`/
`upcomingTournaments` in place without ever re-showing a loading or empty state over what's already
on screen.

## Deferred: weather skeleton (fix item 4)

Traced the actual render path before touching it: `community/[id].tsx`'s weather section
(`{weather != null && (...)}`) and `EventWeatherCard` **already** render a loading spinner
(`w === 'loading'` branch, `EventWeatherCard.tsx:73-79`) — and the `weather` state variable is
**never observably `null`-the-ambiguous-initial-value** in the current architecture, because the
code that determines it (`community/[id].tsx:417-426`) runs entirely inside the same fetch that
gates the full-screen loader (`pageLoading`). By the time `pageLoading` goes false and any content
is visible, `weather` has already resolved to either `'loading'`, a settled result, or a
legitimate `null` (no venue coordinates — nothing to show, correctly). **Making a "skeleton" change
right now would be cosmetic-only and unverifiable** — there is no actual gap to close under the
current architecture. This item is coupled to fix item 3 below: once the full-screen loader is
replaced with an immediate shell, `weather`'s initial `null` *would* become visible for real, and
a skeleton would matter. Deferred until that work happens, not implemented as a no-op now.

## Not started: full-screen loader → immediate shell (fix items 3 & 5)

The larger, higher-risk piece — rendering `community/[id].tsx` and `tournament/[id].tsx` from
route-passed card data instead of a full-screen loader, across every navigation call site. Not
started.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint "src/app/(tabs)/games.tsx"` — 0 errors; 3 pre-existing warnings, none in
the touched code (`CompletedContent`/`EmptyTab` unused, one `useCallback` missing-dep — all present
before this change).

**3. Device re-measurement: NOT yet run.** Awaiting a force-quit/relaunch (same requirement as F1/F3
— Metro under `--no-dev` needs a hard reload to pick up mid-session edits) and a manual check: cold
visit to the Events tab shows a brief spinner instead of "No upcoming events" flashing, and a
genuinely-empty account still correctly reaches the empty state after the fetch settles.

## Confirmed on-device (2026-09-06)

User relaunched and checked the Events tab: brief spinner, then the correct list of signed-up
events — no false "No upcoming events" flash. Step 1 closed.

---
---

# F7 step 3 implementation (2026-09-06): shell cache, community/[id].tsx only

**Status: CODE COMPLETE for one entry point (Home's community feed). Static verification done
(tsc, eslint). Device re-measurement NOT yet run. Scope deliberately narrowed — see below.**

## Scope decision

Threading route params through every navigation call site (12+ files reference
`/community/[id]`) was judged too invasive for this pass. Instead: a shared in-memory shell cache
that list screens populate as they already fetch card data, and the detail screen reads on mount —
zero navigation-call-site changes required, fully additive (a cache miss falls back to the exact
original full-screen-loader behavior, so nothing regresses for any path not yet wired in).

**Wired in this pass:** Home's `communityCards` only — the exact flow Build B's recording
confirmed. **Not wired:** the Events tab (`games.tsx`), Nearby (`nearby.tsx`), or any other card
source. Tapping into an event from those screens still shows the original full-screen loader,
unchanged. `tournament/[id].tsx` is untouched entirely this pass (consistent with the audit's
earlier evidence-scope note: it was never confirmed by the Build B recording, only by static
inspection).

## What changed

1. **New file:** `apps/mobile/src/lib/eventShellCache.ts` — a plain `Map<id, {name, photo,
   datetime, venue}>`, explicitly documented as a first-paint hint only, never a source of truth.
2. **`apps/mobile/src/app/(tabs)/index.tsx`**: after `setCommunityCards(cards)` in the
   `communityCards` focus effect, each card's `{name, photo, datetime, venue}` is written into the
   cache.
3. **`apps/mobile/src/app/community/[id].tsx`**:
   - `const [shell] = useState(() => getEventShell(id as string))` — read once on mount, not
     reactive to later cache writes (deliberate: a first-paint hint, not live state).
   - The `if (pageLoading) return <full-screen loader>` gate is now:
     `if (pageLoading) { if (shell) return <hero + contained spinner>; return <full-screen
     loader>; }` — a cache hit renders the same hero treatment as the fully-loaded page (image,
     back button, title, date, venue) immediately, with a spinner in the body area below instead of
     a full-screen blank. A cache miss (cold entry, deep link, any not-yet-wired source screen)
     falls back to the exact original behavior, unchanged.
   - The rest of the component (the fully-loaded render path) is **untouched** — this was
     deliberate to avoid the risk of exposing `EMPTY_EVENT`'s zero-valued fields (0/0 players,
     empty About text, etc. — the file's own comment says `EMPTY_EVENT` is "deliberately blank
     rather than plausible so that a regression looks broken instead of looking real," i.e. it was
     never meant to be rendered). The shell branch only ever shows real card data (title/photo/
     date/venue) or the original spinner — never a partially-populated `EMPTY_EVENT`.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on all three touched/new files — clean, no errors or warnings.

**3. Device re-measurement: NOT yet run.**

## Next step (not started)

Force-quit/relaunch (same requirement as every prior device check this session), then repeat the
Build B interaction 7B flow: Home → tap a community/Quick-Game card → observe. Expect: the hero
(image, title, date, venue) appears immediately with no blank flash, a spinner shows briefly in the
body area, then the rest of the page fills in — no more loader → partial → complete staged paint
for this one entry point. Also worth a control check: tap into an event from the **Events tab**
(not wired) and confirm it still shows the original full-screen loader, unchanged — proving the
fallback path is intact, not silently broken.

**Deferred, not started this pass:** weather skeleton (F7 fix item 4 — now genuinely relevant for
cache-hit entries, since the hero is visible while `weather` is still `null`/`'loading'`), wiring
the shell cache into `games.tsx`/`nearby.tsx`, and `tournament/[id].tsx` entirely.

## Confirmed on-device (2026-09-06)

User relaunched and tested: Home → community card shows the hero instantly with a brief spinner
below it, then the rest fills in. Confirmed.

---
---

# F7 continued (2026-09-06): weather skeleton + Events tab shell coverage

**Status: CODE COMPLETE. Static verification done (tsc, eslint). Device re-measurement NOT yet run.**

## What changed

1. **Weather skeleton (fix item 4), `apps/mobile/src/components/EventWeatherCard.tsx`.** The
   `w === 'loading'` branch previously rendered a bare `<ActivityIndicator>` centered in an
   otherwise-empty box — legitimately read as "empty," not "loading," even though it was
   technically a loading state. Replaced with a skeleton shaped like the loaded card (icon
   placeholder, temp-bar placeholders, divider, condition-bar and pill placeholders) plus one
   `ShimmerOverlay` sweep, reserving the exact same layout so nothing shifts when real data lands.
   `card`'s style gained `overflow: 'hidden'` so the shimmer sweep clips to the card's rounded
   corners. Unused `ActivityIndicator` import removed.
2. **Events tab shell coverage, `apps/mobile/src/app/(tabs)/games.tsx`.** Same pattern as Home:
   after building the `merged` (hosting + joined) card list for the Upcoming tab, each card's
   `{name, photo, datetime, venue}` is written into the same shell cache via `setEventShell` —
   using `eventCoverSource(c.imageUri)` for the photo, matching how `EMPTY_EVENT.heroPhoto` is
   derived elsewhere in this codebase. No changes to `community/[id].tsx` were needed — it already
   reads from the shared cache regardless of which screen populated it.

## Still not wired: Nearby (`nearby.tsx`), `tournament/[id].tsx`

Scope held at Home + Events tab this pass. Both remain on the original full-screen-loader
behavior, unchanged — a cache miss always falls back to it.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on both touched files — 0 errors. `games.tsx` carries 3 pre-existing
warnings (unused `CompletedContent`/`EmptyTab`, one `useCallback` missing-dep), none introduced by
this change, identical to the count before it.

**3. Device re-measurement: NOT yet run.**

## Confirmed on-device (2026-09-06)

User relaunched and tested both: weather shows the skeleton (not a bare spinner) while fetching,
and tapping into an event from the Events tab now also shows the hero-shell instead of the
full-screen loader. Both confirmed.

---
---

# F7 continued (2026-09-06): Nearby wiring + tournament/[id].tsx

**Status: CODE COMPLETE. Static verification done (tsc, eslint). Device re-measurement NOT yet
run.**

## What changed

**1. Nearby tab, `apps/mobile/src/app/(tabs)/nearby.tsx`.** Same pattern as Home/Events tab: after
`setLiveCommunity(pins)` in the community-pins fetch, each pin's `{name, photo, datetime}` is
written into the shared shell cache (`eventCoverSource(pin.photo)` for the image; `ExplorePin` has
no venue field, so that's left blank — degrades gracefully to an empty meta line, nothing crashes).

**2. `apps/mobile/src/app/tournament/[id].tsx` — two changes:**

- **Shell branch**, mirroring `community/[id].tsx`: `const [shell] = useState(() =>
  getEventShell(id))`, read once on mount. The `if (loading || !tournament)` gate now shows the
  hero (image/title/date/venue) plus a contained spinner when `shell` exists, falling back to the
  original full-screen loader on a cache miss — unchanged for any unwired entry point.
- **Un-scoped bug found and fixed alongside it (same class as F1/F3):** this screen's data effect
  uses `useFocusEffect`, unlike `community/[id].tsx`'s mount-only `useEffect` — so it was calling
  `setLoading(true)` on **every revisit**, not just cold entry, flashing the full-screen loader
  again each time the user navigated away and back to an already-loaded tournament. Fixed with a
  `tournamentRef` mirror (the focus callback's `useCallback` doesn't have `tournament` in its
  dependency array, so a plain closure read would have been stale) — `setLoading(true)` now only
  fires when nothing is on screen yet; a revisit refreshes in place. This directly serves F7 fix
  item 5 ("never replace an already-known screen with a full-screen loader") independent of the
  shell cache — even with no shell hit at all, a *second* visit to the same tournament instance no
  longer full-screen-loads.

**3. Shell cache population source, `apps/mobile/src/app/(tabs)/index.tsx`.** Home's `tournaments`
focus effect now also seeds the cache (name, `coverImgUrl` or the same fallback stock photo used
elsewhere in this file, `formatDateRange(eventDate)`, venue) alongside its existing community-card
wiring.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on all touched files — 0 errors. `tournament/[id].tsx` carries the same 3
pre-existing warnings it had before any of this session's changes (unused `getPlayerRegistrationStatus`/`supabase`/`SW`) — none introduced.

**3. Device re-measurement: NOT yet run.**

## Next step (not started)

Force-quit/relaunch, then: (a) tap a tournament card from Home — hero should show instantly, no
full-screen flash; (b) leave that tournament screen and come back to it (still mounted, e.g. via
back-navigation within the stack) — confirm it does **not** flash the full-screen loader on the
revisit; (c) tap a community pin from the Nearby tab and confirm the same hero-shell treatment
there too.

---
---

# Out-of-scope fix (2026-09-06): Nearby's "Tournaments" filter was never real

**Not part of F1/F3/F7.** Surfaced while testing F7's tournament shell work.

## What was found

User reported a hard app close tapping between two Nearby tournament pins, plus stale/past
tournament dates showing. Root-caused to two separate things:

1. **The crash did not reproduce after a clean force-quit/relaunch** — consistent with the
   already-known stale-bundle risk (`--no-dev` + many mid-session edits; see the F1/F3 device
   sections above). Not a code bug.
2. **Nearby's "Tournaments" map filter was never connected to real data at all.** Traced: zero
   references to any tournament-fetching function anywhere in `nearby.tsx`; the entire category was
   two hardcoded pins ("Summer Slam," "Bradenton Open") with fixed 2025 dates and a fake shared
   `detailRoute: '/tournament/summer-slam'` (not a real UUID — tapping either one always hit the
   same non-existent tournament, hanging forever on a spinner since `fetchTournamentById` and
   `fetchDivisionsForTournament` both return empty/null on a bad id rather than throwing). This is
   why the user's real, active nearby tournaments never appeared — nothing had ever queried for
   them. Confirmed with the user this was a missing feature, not a regression, and built it for
   real rather than just deleting the mock pins.

## What changed

1. **`apps/mobile/src/lib/supabase/tournaments.ts`**: new `fetchNearbyTournaments(limit)` —
   selects tournaments joined to `facilities` (via the `tournaments_facility_id_fkey` constraint,
   confirmed in `supabase/migrations/20260725000000_baseline_from_prod.sql:6596`) for lat/lng,
   filters to `VISIBLE_STATUSES`, and drops past events client-side via `isTournamentExpired` —
   same filter Home already applies to `fetchTournaments()`. A tournament with no facility (no
   coordinates) is dropped, same as `fetchNearbyPlayEvents`/`playEventToPin` already do for play
   events.
2. **`apps/mobile/src/app/(tabs)/nearby.tsx`**:
   - New `tournamentToPin()` mapper (mirrors `playEventToPin`/`facilityToPin`).
   - New `liveTournaments` state, fetched in the same focus effect as community pins.
   - `communityPinsRaw`'s tournament branch now reads `liveTournaments ?? []` instead of the
     hardcoded `PINS` array — which is deleted entirely.
   - Same F7 shell-cache wiring applied to these new real pins, consistent with every other list
     screen this session.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on both files — clean, 0 errors, 0 warnings.

**3. Device re-measurement: NOT yet run.**

## Next step (not started)

Force-quit/relaunch, then: open Nearby, select the Tournaments filter, and confirm real active
tournaments near the test location appear (not the old mock pins), with no past-dated entries and
no dead-end fake ids. Tap into one and confirm the F7 shell treatment applies there too.

---
---

## Status — F7 summary

Done and confirmed: false empty state (Events tab), hero-shell instead of full-screen loader for
Home + Events tab entry points (community events), weather skeleton, Nearby tournaments filter
(confirmed working 2026-09-07 alongside the out-of-scope real-data fix). Done, not yet explicitly
device-confirmed as a separate check: tournament shell-on-tap from Nearby specifically, and the
tournament revisit-loading-flip fix. Not done: nothing else identified as in-scope for F7. All
shell-cache paths fall back safely to original behavior on a cache miss, so nothing is broken for
any not-yet-covered entry point.

---
---

# F2 implementation (2026-09-07): stop animating blur `intensity` on Home's Quick Action tiles

**Status: CODE COMPLETE. Static verification done (tsc, eslint). Device re-measurement NOT yet
run.**

## What changed

**File:** `apps/mobile/src/components/GlassQuickAction.tsx` only — the component behind every
Quick Action tile on Home (13 instances per the original F2 finding). No other file touched.

1. **The `BlurView` is no longer animated.** It previously used `useAnimatedProps` to drive its
   `intensity` prop from 38 (rest) to 58 (pressed) via `AnimatedBlurView`. Animating `intensity`
   forces iOS to re-composite the blur every frame of the transition — one of the most expensive
   effects available, and with up to 13 tiles mounted simultaneously on Home this was the largest
   steady-state GPU cost identified in the whole audit. It's now a plain, static `BlurView` at a
   single fixed `intensity={44}` (roughly the midpoint of the old rest/press range), never
   re-rendered by press state at all.
2. **Press feedback now comes from a `View`'s `opacity`**, a compositor-only property. A new
   `pressOverlay` layer (same navy tone already used elsewhere in this component for the inner-
   shadow suggestion, `rgba(10,18,40,0.10)`) animates its `opacity` 0→1 on press-in and back on
   press-out, darkening the tile without touching the blur at all.
3. Scale and shadow-opacity press animations are unchanged — only the blur-intensity animation was
   removed, per the audit's explicit fix (item 1); `FloatingSupportButton`'s always-mounted 14th
   blur surface was **not** touched (the audit only listed reducing its blur count as something to
   "consider," not a required fix — left alone to keep this change minimal and self-contained).

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint src/components/GlassQuickAction.tsx` — clean, 0 errors, 0 warnings.

**3. Device re-measurement: NOT yet run.**

## Confirmed on-device (2026-09-07)

User verified: Quick Action tile press feels visually correct, no stutter regression.

## Status

F2 done and confirmed. All four prioritized findings from this audit (F1, F3, F7, F2) now have
real, on-device-confirmed fixes.

---
---

# F4 implementation (2026-09-07): FlatList for conversation/[id].tsx and games.tsx's Past tab

**Status: CODE COMPLETE. Static verification done (tsc, eslint). Device re-measurement NOT yet
run.**

## Scope decision

The audit's own recommendation: convert only where a list is unbounded and user-visible as slow,
not all 124 `ScrollView`s. Three lists converted this pass, all genuinely unbounded (grow over a
user's lifetime, unlike the small bounded lists elsewhere — Upcoming/Joined/Held Spots stay small
by nature and were left as `ScrollView`, unchanged):

- `RealDMScreen` (1:1 direct messages) and `RealGroupChat` (group/tournament chat) in
  `apps/mobile/src/app/conversation/[id].tsx` — the two components a real UUID conversation
  actually reaches via `ConversationResolver`. **Deliberately not touched:** `EventGroupChat` and
  `GenericDMConversation` in the same file — traced their reachability and confirmed they only
  render for legacy mock ids (`event-*`, `dm-*`), never for a real conversation; out of scope as
  dead/demo code, not a real user-facing perf surface.
- `PastContent` (the Past tab) in `apps/mobile/src/app/(tabs)/games.tsx` — a player's full history
  of completed/cancelled events, the one list in this file that isn't bounded to "what's happening
  now." Upcoming/Joined/Held Spots left as `ScrollView`.

## What changed

**1. `RealDMScreen`** — `ScrollView` + `messages.map()` replaced with `FlatList`:
- `scrollRef`'s type changed from `useRef<ScrollView>` to `useRef<FlatList<DbMessage>>` — both
  expose the same `.scrollToEnd()` this ref already called, so the two existing scroll-to-bottom
  triggers (`onContentSizeChange`, and the `useEffect` on `messages.length`) are unchanged.
  loading/error states moved from being conditionally rendered *inside* the scroll container to
  siblings that replace it entirely; the empty state ("Start the conversation") moved to
  `ListEmptyComponent`.
- **Correctness guard:** `renderItem` reads `reactions`, `user?.id`, and `partner?.photoUri` from
  outer scope, none of which are part of `messages` (the `data` prop). FlatList only re-renders a
  row when its own item reference changes, so without intervention a message whose *reactions*
  changed — but whose own object didn't — could go stale off-screen. Added
  `extraData={[reactions, user?.id, partner?.photoUri]}`: a fresh array every render, which forces
  FlatList to re-evaluate on every parent re-render, matching the old `.map()`'s always-re-render
  behavior exactly while still getting the actual win (only near-viewport rows mount).

**2. `RealGroupChat`** — identical treatment. `extraData={[reactions, senders, user.id]}` (adds
`senders`, the sender-display-name map, which `RealDMScreen` doesn't have).

**3. `PastContent`** — same `ScrollView`→`FlatList` swap, but this list mixes two different card
shapes (play-event cards via `CommunityCard`/`EventRow`, and tournament cards via
`TournamentTrendingCard`) rendered as two separate `.map()` calls appended in sequence. Merged into
one `PastItem` discriminated union (`{kind:'card', card} | {kind:'tournament', tournament}`) so a
single `FlatList`/`renderItem` can window both instead of eagerly mounting the whole combined list.
The two previous early-return branches (empty vs. populated ScrollView, ~45 duplicated lines) merged
into one `FlatList` using `ListHeaderComponent` (filter controls + section header) and
`ListEmptyComponent` (the empty-state copy, `loading`-aware exactly as before).
- **Correctness guard:** `isBookmarked` (from `useTournamentBookmarks`) is `useCallback`'d on
  `[bookmarkedIds]` — a new function reference every time a bookmark is toggled, which isn't part
  of `data` either. Added `extraData={isBookmarked}` so a bookmark toggle still re-renders an
  already-mounted tournament row.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on both files — 0 errors. Same pre-existing warnings as before this
change in both files (none newly introduced): `conversation/[id].tsx` carries 4 (unused `router`,
an `Array<T>` style nit, two missing-dep hook warnings, all outside the edited ranges);
`games.tsx` carries 3 (unused `CompletedContent`/`EmptyTab`, one missing-dep hook warning).

**3. Device re-measurement: NOT yet run.** No standalone Node drill for this one, unlike F1/F3 —
this is a rendering/scroll-behavior change, not a state machine, and isn't meaningfully testable
outside the actual FlatList/ScrollView host components.

## Next step (not started)

Force-quit/relaunch, then exercise each converted list directly:
- **DM chat:** open a conversation with several messages, confirm it opens already scrolled to the
  bottom (no visible jump), send a message and confirm auto-scroll still follows it, and toggle a
  reaction on an older message to confirm it updates even if that row had scrolled off-screen and
  back.
- **Group/tournament chat:** same checks, plus confirm sender names still resolve correctly for
  other participants' messages.
- **Past tab (Events tab):** scroll through past events, confirm bookmarking a past tournament
  updates its saved state, and switch the type filter to confirm the list and empty-state copy
  still respond correctly.

No FPS/count metrics are expected from this pass specifically — the audit's own guidance was to
measure before converting the *rest* of the 124 `ScrollView`s, not to produce a number for these
three. A qualitative pass (smooth scroll, correct behavior, no regressions) is the bar for now.

## Confirmed on-device (2026-09-07)

User verified all three converted lists (DM chat, group/tournament chat, Past tab) behave
correctly — scroll-to-bottom, reactions, bookmarking, filtering all work as before.

## Status

F4 done and confirmed for the two audit-recommended targets.

---
---

# F5 implementation (2026-09-07): one query replaces Director Hub's N+1 fan-out

**Status: CODE COMPLETE. Static verification done (tsc, eslint, standalone SQL-vs-JS metric
drill). The DB-side migration is written but NOT applied to the live Supabase project — see
"Required action" below. Device re-measurement blocked until it is.**

## What changed

**1. New migration: `supabase/migrations/20260907120000_director_tournament_metrics_rpc.sql`.**
Adds `get_director_tournament_metrics(p_tournament_ids uuid[])`, a `SECURITY INVOKER` SQL function
(explicitly **not** `SECURITY DEFINER` — see below) returning one row per tournament id with
`div_count`, `total`, `registered`, `checked_in`, `waitlisted`, `no_show`, `cancelled`,
`revenue_cents`, `outstanding_cents`. Replaces the two-request-per-tournament fan-out
(`fetchDivisionsForTournament` + `fetchTournamentRegistrations`) with one query for however many
tournaments are in view.

- **Security:** deliberately `SECURITY INVOKER` (the default — omitted from the function
  definition), not `SECURITY DEFINER`. It runs under the calling director's own permissions, so
  the existing RLS policies do the same restricting they already do for the two direct-table
  queries this replaces (`"registrations: director read own tournament"`,
  `"divisions: director manage own"`, confirmed present in
  `supabase/migrations/20260725000000_baseline_from_prod.sql`). A director who passes a tournament
  id they don't own gets no row back for it, not an error or someone else's data — same behavior
  as before, just batched. Granted to `authenticated`, revoked from `PUBLIC`/`anon`.
- **Metric math** mirrors `director.tsx`'s `loadSnapshots()` and
  `registrations.ts`'s `dbStatusToAppStatus()` exactly: `held`/`expired_hold` rows excluded up
  front (matching `fetchTournamentRegistrations`'s `.not('status','in','(held,expired_hold)')`),
  the same status-collapsing rules, `total`/`registered`/`checked_in`/`waitlisted`/`no_show`
  excluding cancelled, `revenue_cents` summing everything but cancelled (no_show included),
  `outstanding_cents` summing balance-due over everything but cancelled *and* no_show, with
  balance-due computed as `GREATEST(0, COALESCE(division_fee, tournament_fee, 0) - paid)` —
  the SQL translation of `effectiveEntryFeeCents()` + `balanceDueCents()` in `tournamentFees.ts`.

**2. `apps/mobile/src/lib/supabase/tournaments.ts`**: new `fetchDirectorTournamentMetrics(ids)`,
calling the RPC and returning a `Map<tournamentId, metrics>`. Uses `(supabase as any).rpc(...)` —
the function is too new to be in the generated Supabase types yet; same pattern already used for
`search_facilities_nearby` in `facilities.ts`. Comment marks it for removal once the migration is
applied and types are regenerated.

**3. `apps/mobile/src/app/director.tsx`**: `loadSnapshots()` no longer does
`filtered.map(async t => Promise.all([fetchDivisionsForTournament(t.id), fetchTournamentRegistrations(t.id)]))`
— replaced with one `fetchDirectorTournamentMetrics(filtered.map(t => t.id))` call, then a plain
(non-async) `.map()` to assemble snapshots from the returned map. `bracketCount` is untouched
(`getAllBrackets` is a local, in-memory lookup — never part of the network fan-out).

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on `director.tsx` and `tournaments.ts` — 0 errors. `director.tsx` carries
one pre-existing warning (`fmt` unused, line 45, untouched by this change).

**3. Standalone SQL-vs-JS metric drill.** Since the migration isn't applied yet, there's no live
database to test the RPC against. Instead, ported the SQL's aggregation logic to JS and ran it
side-by-side against a direct JS port of the *original* client-side logic, over five synthetic
cases: empty tournament, mixed statuses via the tournament-fee fallback, `held`/`expired_hold`
exclusion, division-fee-overrides-tournament-fee with a partial payment, and an overpayment
(confirms the balance floors at 0 rather than going negative). All five produced byte-identical
output between the two implementations. Script at `f5_verify.js` in the session scratchpad — this
validates the *math* is a faithful translation; it cannot validate the RLS/join behavior against
real data, which only the live database can do.

## Migration applied and verified (2026-09-07)

`supabase db push` initially failed on a large pre-existing migration-ledger/local-file mismatch —
unrelated to this change, but blocking it. Root cause: migrations applied in the past via
`apply_migration` (MCP) never wrote local files (a known gap — see memory), and separately, a batch
of local migration files had been renumbered to earlier timestamps than what the remote ledger
recorded them under. Resolved in three `supabase migration repair` passes (36 versions total across
two batches, all bookkeeping-only — `migration repair` never executes SQL, it only edits the ledger
table), each verified against the live database before running:

- 5 versions (`20260902140000`–`20260902220000`): confirmed via direct query that their functions/
  settings already existed on the database, byte-identical to the local files.
- 31 versions (`20260831060000`–`20260902130000`): confirmed via batched queries that all 32
  functions, 11 tables, 1 view, and spot-checked columns these files define already existed live.

Only after both were reconciled did `db push` correctly narrow down to the one genuinely-new
migration (`20260907120000_director_tournament_metrics_rpc.sql`) and apply it. Verified directly
(not just trusting CLI output):
- `select proname, prosecdef from pg_proc where proname = 'get_director_tournament_metrics'` →
  exists, `prosecdef: false` (confirms `SECURITY INVOKER` as intended, not `DEFINER`).
- Called the function against all real tournament ids on the database — returned varied, plausible
  counts/revenue/outstanding-balance numbers across 13 tournaments, nothing that looked broken
  (zeros for tournaments with no registrations, non-zero revenue/outstanding for ones with real
  activity).

## Confirmed on-device (2026-09-07)

User relaunched, opened Director Hub, and verified against real data:
- The "Open" filter chip showed exactly 2 tournaments — matched the database directly.
- Per-filter counts across all 8 status chips (draft 2, open 2, filling_fast 0,
  registration_closed 2, in_progress 0, pending_approval 0, completed 0, cancelled 7, all 13)
  matched a live query of the director's actual tournaments.
- The "Test payments" tournament's metrics (6 total, 6 registered, 3 cancelled, 1 division,
  $170 revenue, $200 outstanding) matched the RPC's direct output exactly.

## Status

F5 done and confirmed both against the database directly and through the actual Director Hub UI.

---
---

# Out-of-scope fix (2026-09-07): cancelled tournaments badged "Open"

**Not part of F1–F5.** Surfaced while verifying F5 against real Director Hub data — the user
noticed several cancelled tournaments showing a green "Open" badge under the "All" filter.

## Root cause

`getTournamentStatus()` in `apps/mobile/src/lib/tournamentStatus.ts:68-84` never checked for
`tournament.status === 'cancelled'` at all. A cancelled tournament fell through every branch:
- If its event date had already passed, the date-based fallback caught it and returned
  `'completed'` — wrong, but not alarmingly so, and not what the user reported.
- If its event date was still in the future, **nothing caught it**, and the function fell all the
  way to its final `return 'open'` — badging a cancelled tournament as open for registration.

Confirmed directly against the database: exactly the 3 future-dated cancelled tournaments
(director has 7 cancelled total, 3 future-dated + 4 past-dated) were the ones the user saw wrongly
badged "Open"; the 4 past-dated ones weren't reported, consistent with them landing on
`'completed'` instead — not correct either, but not what got flagged.

## What changed

1. **`apps/mobile/src/lib/tournamentStatus.ts`**: added `'cancelled'` to the `TournamentStatusKey`
   union and to `TOURNAMENT_STATUS_INFO` (red variant, matching the existing red used for
   `no_show` in the player-registration status table). `getTournamentStatus()` now checks
   `status === 'cancelled'` immediately after the draft/pending_approval checks and **before** the
   date-based completed fallback — cancelled is a terminal state in its own right, not something
   that should ever resolve to "completed" just because the date has also passed.
2. **`apps/mobile/src/app/director.tsx`**: `getGroup()` (which drives the ACTIVE/UPCOMING/COMPLETED
   summary cards) now also checks for `'cancelled'` first. Necessary side effect of fix #1 — without
   it, a future-dated cancelled tournament would have started counting toward "Upcoming" instead of
   "Open" (arguably worse), and a past-dated one would have silently stopped counting toward
   "Completed" with nowhere else to go. There's no "Cancelled" summary card, so cancelled
   tournaments are now excluded from all three counts rather than miscounted into one.
3. Checked all other consumers of `TournamentStatusKey` (`tournament/[id].tsx`,
   `player-results.tsx`, `player-brackets.tsx`) — all just pass the value through to
   `getTournamentStatusInfo()` for badge display, no exhaustive switches to update. The fix
   propagates automatically: any screen showing a tournament's status badge now correctly shows
   "Cancelled" (red) instead of "Open"/"Completed" for a cancelled tournament.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint` on both files — 0 errors. `director.tsx` carries the same pre-existing
`fmt`-unused warning as before, untouched by this change.

**3. Standalone drill.** 11 assertions covering: the exact reported bug (future-dated cancelled →
now `'cancelled'`, was `'open'`), the previously-silent past-dated case (now `'cancelled'`, was
`'completed'`), five unaffected-case regression checks (genuinely open, past-open→completed, draft,
full, filling_fast/closing_soon), and both `getGroup()` cases (cancelled excluded from upcoming
and from completed). All pass. Script at `cancelled_status_verify.js` in the session scratchpad.

**4. Device: NOT yet run.**

## Next step (not started)

Force-quit/relaunch, then: check the "All" filter in Director Hub and confirm the previously
wrongly-badged tournaments (Caledar Tournament Test, Test payments, Test Small ❤️) now show a red
"Cancelled" badge instead of green "Open"; also spot-check the ACTIVE/UPCOMING/COMPLETED summary
cards at the top — their counts should now be slightly lower than before (cancelled tournaments no
longer inflate either bucket).

---
---

# Out-of-scope fix (2026-09-07): iOS MapKit crash tapping into a Nearby tournament pin

**Not part of F1–F5.** User reported a hard crash tapping into a tournament pin from Nearby's new
real-data tournament filter, plus a visual "faded" icon on a marker tapped just before the crash.

## Root cause

`apps/mobile/src/components/ExploreMap.native.tsx`'s own comment (present before this session,
untouched by the Nearby-tournaments work) already documents the exact mechanism: a custom map
marker view defaults to `tracksViewChanges=true`, and a **live, still-tracking** marker torn down
mid-update — e.g. by a navigation push covering the screen — hard-crashes MapKit on iOS. The
existing mitigation stops tracking `MARKER_TRACK_WINDOW_MS` (600ms) after a marker's selected state
last changed. That window is a **race, not a guarantee**: tap a pin, then tap into its detail sheet
fast enough, and the navigation can cover the screen before 600ms elapses — the marker is still
tracking when it's torn down, reproducing the exact crash the comment describes. The "faded" icon
is almost certainly the same mechanism from the other direction: the marker's static snapshot got
frozen by the timer mid-render, before the icon glyph had fully painted that frame.

This is pre-existing code I didn't write, but the new real tournament-pin data (replacing two
static mock pins) changes marker churn/image-load timing on this screen, plausibly making the race
easier to hit. Fixed as an extension of the same file's existing intent, not new scope.

## What changed

**`apps/mobile/src/components/ExploreMap.native.tsx`**: `MapMarker` now also calls
`useFocusEffect` and forces `tracking` to `false` the instant this screen loses focus (the cleanup
function fires on blur, which happens synchronously before a navigation push covers the screen).
This closes the race unconditionally — the marker is guaranteed static before it can ever be torn
down mid-update, regardless of how fast the user taps. The existing 600ms timer is untouched and
still serves its original flicker-prevention purpose for the common case where the screen stays
focused.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint src/components/ExploreMap.native.tsx` — clean, 0 errors, 0 warnings.

**3. Device: NOT yet run** — this is a native-crash race condition; it can only be meaningfully
verified on-device, and the user was away from home when this was reported. No standalone drill
possible either (native marker view lifecycle, not application logic).

## First attempt was wrong and made it worse — reverted (2026-09-07)

User reported the crash still happening, and now **spreading to community-event and court pins
too** — every marker type, not just tournaments. That is a direct signal the first fix was the
cause: `useFocusEffect` was called from inside `MapMarker`, but `MapMarker`'s children render as
the child of a `<Marker>`, which `react-native-maps` snapshots to an offscreen native view for the
custom marker bitmap — not a normal position in the screen's render tree. A router-context hook
there is outside the pattern's intended use and produced unpredictable behavior across every
marker/category, not just the one whose flow triggered it.

**Fixed by moving the hook to the right place.** `useFocusEffect` now lives in `ExploreMap` itself
— a normal, top-level position in `nearby.tsx`'s render tree, the only screen that renders this
component. It tracks a `screenBlurring` boolean (true the instant this screen loses focus) and
passes it down to every `MapMarker` as a plain `forceStatic` prop. Each marker's
`tracksViewChanges` is now `tracking && !forceStatic` — same race-closing effect as the first
attempt (a marker is guaranteed static before it can be torn down mid-update by a covering
navigation), but via a prop instead of a hook running inside the marker's own offscreen subtree.

Re-verified: `npx tsc --noEmit` clean, `npx eslint src/components/ExploreMap.native.tsx` clean.
Still not runnable as a standalone drill (native marker view lifecycle) — device verification is
the only way to close this out.

## Second attempt (forceStatic/tracksViewChanges) also failed — real root cause identified (2026-09-07)

Both `useFocusEffect`-based attempts targeted `tracksViewChanges`, an old-architecture marker
snapshotting prop. The crash log (device-provided `.ips`, `Settings → Privacy & Security →
Analytics & Improvements → Analytics Data`) showed something entirely different: `SIGABRT` via an
Objective-C exception during **React Native's Fabric view-mounting** —
`RCTMountingManager performTransaction` → `mountChildComponentView:index:` → `objc_exception_throw`
→ `abort()`. No `tracksViewChanges` involvement at all; both prior fixes were addressing the wrong
mechanism.

Root cause, confirmed via web search: `react-native-maps` (this project's exact version, 1.20.1) is
**upstream-unsupported on React Native's New Architecture (Fabric)**, specifically for markers with
custom child components — [react-native-maps#5378](https://github.com/react-native-maps/react-native-maps/issues/5378),
[#4805](https://github.com/react-native-maps/react-native-maps/issues/4805). Fabric's InteropLayer
does not support a `Map → Marker → (custom View tree)` structure, which is exactly what
`MapPin` (a custom View with a colored circle, icon, and halo) was. Expo SDK 54 defaults
`newArchEnabled` to true (not explicitly set in this project either way), and the crash trace
itself confirms Fabric is active. This is a **pre-existing, latent incompatibility** — not
something introduced this session — that the new real tournament/community pin data plausibly
made easier to trigger by increasing marker interaction/churn on this screen.

**Controlled confirmation (user-directed):** temporarily removed `MapPin`'s children entirely
(zero custom children, default native pin), changing nothing else — not navigation, not selection
state, not `tracksViewChanges`. Reproduced the exact crash sequence on-device: **zero crashes.**
This isolated the cause conclusively before committing to a real fix.

## Real fix: `pinColor`, not custom children (2026-09-07)

**File:** `apps/mobile/src/components/ExploreMap.native.tsx` — full rewrite of the marker
rendering, per user-directed plan:

1. **Shipped now:** `<Marker pinColor={...} opacity={...} />` — react-native-maps' own native pin
   rendering, zero React children, using the library's supported (non-Fabric-broken) code path.
   `pinColorFor()` preserves the existing category/game-type color logic (gold for community,
   navy for tournament/court, game-type-specific colors where set) as a native `pinColor` string
   instead of a custom View's `backgroundColor`. `opacity` (a plain native prop, not a child)
   gives a lightweight selected-state signal, replacing the removed halo glow.
2. **Removed, not just reverted:** `MapPin`, `HALO_BY_COLOR`, the `tracking`/`MARKER_TRACK_WINDOW_MS`
   timer, `forceStatic`/`screenBlurring`/the `useFocusEffect` in `ExploreMap` — all of it existed
   only to manage `tracksViewChanges` for a custom marker view that no longer exists. Confirmed via
   grep that nothing else in `nearby.tsx` depends on any of the removed exports.
3. **Explicitly deferred, not done:** closer visual fidelity (the circle+icon design) via
   `<Marker image={require(...)} />` — the native `image` **prop**, which passes an asset with no
   React child at all, unlike a child `<Image>` (still a React child inside `<Marker>`, still on
   the broken Fabric path — flagged and corrected mid-session). Would need pre-colored image assets
   per category/selected-state, since `tintColor` may not apply reliably through the native image
   prop. Not started.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint src/components/ExploreMap.native.tsx` — clean, 0 errors, 0 warnings.

**3. Device: confirmed no crash** with the diagnostic (zero-children) build. **Not yet confirmed**
with the actual shipped fix (`pinColor`) — see next step.

## Status

Fresh EAS preview build #12 published with all of today's changes (F1–F5, cancelled-status fix,
map marker `pinColor` fix): https://expo.dev/accounts/dhjesus122/projects/dreambreaker/builds/383878b1-32cd-45f6-bea8-2a894d52415d.
Dev-client connection was attempted first per the user's plan but hit repeated environment friction
(port conflicts, Expo Go vs. dev-client vs. preview-build URL-scheme collisions, an app that auto-
loaded a stale OTA update) that made it impractical to complete in-session; pivoted to a preview
build instead, which sidesteps all of that by launching directly with no Metro connection needed.
Device verification of the marker crash fix is still pending on this build.

---
---

# Out-of-scope fix (2026-09-07): tournament hero showed a hardcoded stock photo, never the real cover image

**Not part of F1–F5.** Surfaced by the user testing build #12: navigating into a tournament showed
a correct-looking hero image briefly (the F7 shell, which does use the real cover), then visibly
flashed to a *different*, wrong image once the full page loaded.

## Root cause

`apps/mobile/src/app/tournament/[id].tsx`'s hero `<Animated.Image>` was hardcoded to a constant
Unsplash stock photo (`HERO_PHOTO`) unconditionally — `tournament.coverImgUrl` was never read at
all in the main render. This was a pre-existing bug, noted during the F7 shell-cache work
("tournament hero image showed a hardcoded stock photo... a separate, unrelated bug... out of
scope") and deliberately left alone at the time. It became visibly jarring once the shell fix
started showing the *correct* image first — the flash from right to wrong image is what made it
noticeable, not a new regression in the underlying bug itself.

## What changed

`apps/mobile/src/app/tournament/[id].tsx`: the hero image source is now
`tournament.coverImgUrl ?? HERO_PHOTO` — the real director-uploaded cover image when one exists,
falling back to the same stock photo only when it doesn't. Matches exactly what the shell branch
and Home's card already do.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint src/app/tournament/[id].tsx` — 0 errors, same 3 pre-existing warnings as
before this change (unused `getPlayerRegistrationStatus`/`supabase`/`SW`), none introduced.

**3. Device: NOT yet run.** Not included in build #12 (found after that build was already
published) — needs a follow-up build or dev-client verification to confirm on-device.

## Next step (not started)

1. Confirm the map marker `pinColor` fix on build #12: test every marker category (community,
   tournament, court), repeated fast taps into detail, navigation back, and selected-marker reset —
   no crash, markers render as colored native pins (gold/navy/game-type colors, no custom
   circle+icon).
2. Confirm whether the dev-mode sluggishness noted during the diagnostic test persists on this
   release build — expected not to, but not yet explicitly checked.
3. Fold the tournament-hero-image fix into the next build (not yet built).
4. If the standard pins feel visually inadequate, the `image`-prop follow-up (native `image` prop,
   not a child `<Image>`) is the correct next step for closer visual fidelity — not started.

---
---

# Out-of-scope feature (2026-09-07): real Stripe saved-payment-methods

**Not part of the performance audit.** User spotted, while testing today's other fixes, that
`payments-settings.tsx`'s "Payment Methods" section was hardcoded fake UI ("Visa •••• 4321", dead
taps) — confirmed by the code's own pre-existing comment: *"No payment-methods table exists — saved
cards need Stripe Customer/PaymentMethod support before this is real."* User chose to build the real
integration rather than defer it.

## Research before implementation

Delegated a research pass mapping existing Stripe conventions in this codebase (Customer creation
patterns, PaymentIntent flow, edge function skeleton, RLS patterns, mobile client structure) before
writing anything, so the new feature matches house style instead of inventing a parallel approach.
Key findings: no Stripe Customer is created anywhere yet, though `profiles.stripe_customer_id`
was already provisioned (baseline migration) and dormant; the closest template is
`create-connect-onboarding-link`'s lazy-create-and-persist pattern for
`stripe_connect_account_id`; all money-state changes in this codebase happen only via a verified
Stripe webhook (`web/src/app/api/stripe/webhooks/route.ts`) or a `SECURITY DEFINER` RPC, never a
bare client write.

## What was built

**Migration** `supabase/migrations/20260907130000_payment_methods.sql`:
- `payment_methods` table (Stripe card metadata snapshot — brand/last4/exp/is_default), RLS
  `owner read own` + admin, **no client INSERT/UPDATE/DELETE grant** — matches the `payments` table's
  money-state discipline exactly (service role writes only, from server code after a verified
  Stripe round trip).
- `set_default_payment_method(uuid)` — the one client-callable write path, `SECURITY DEFINER` but
  internally scoped to `auth.uid()`, touches no Stripe state (a preference flag, not money or card
  identity) so a controlled RPC is the right ceremony level rather than a dedicated edge function.

**Three edge functions** (`supabase/functions/`), each added to `config.toml` with `verify_jwt = true`:
- `create-setup-intent` — lazy-creates the Stripe Customer (persists to `profiles.stripe_customer_id`,
  mirroring `create-connect-onboarding-link`'s account-creation pattern exactly, including "fail
  loudly if the persist fails, never proceed" so a retry can't mint a second orphaned Customer),
  creates an ephemeral key + SetupIntent, returns everything PaymentSheet's customer flow needs in
  one round trip.
- `confirm-payment-method` — called after `presentPaymentSheet()` reports client-side success.
  Re-retrieves the SetupIntent from Stripe **server-side** and only writes a `payment_methods` row
  if Stripe itself confirms `succeeded` with a card attached to this user's Customer — same
  never-trust-client-success principle `_shared/payments.ts` documents for money, applied to card
  attachment. Explicitly does NOT go through the web app's webhook route (the only existing webhook
  receiver) — reasoned in the function's own comment: SetupIntent confirmation is a synchronous,
  immediately-authoritative Stripe call, unlike a PaymentIntent's async settlement, so re-verifying
  synchronously here is safe and keeps the feature self-contained to one app.
- `delete-payment-method` — detaches from Stripe first (treating `resource_missing` as
  already-deleted success, not an error), then removes the local row, then promotes a new default if
  the removed card was one.

**Mobile client**:
- `apps/mobile/src/lib/payments/paymentMethods.ts` — Stripe-SDK-free (same split as
  `reservationPaymentIntent.ts`/`useReservationPayment.ts`), direct RLS-scoped table read for
  listing, edge-function calls for create/confirm/delete, RPC call for set-default. Two `as any`
  casts (table + RPC) since `payment_methods`/`set_default_payment_method` aren't in generated
  Supabase types yet — same documented pattern as `fetchDirectorTournamentMetrics` (F5).
- `apps/mobile/src/lib/payments/useSavedPaymentMethods.ts` — the `@stripe/stripe-react-native`-importing
  half, `initPaymentSheet`/`presentPaymentSheet` in SetupIntent/customer mode. Reuses the existing
  `payment_started`/`succeeded`/`failed`/`canceled` analytics events with `source: 'add_card'`
  rather than inventing new ones — `AnalyticsEvent` (`packages/shared/src/analytics.ts`) is a
  deliberate allowlist ("an event that is never analysed is still a row someone has to reason
  about"), and this genuinely is a Stripe payment-sheet funnel.
- `apps/mobile/src/app/payments-settings.tsx` — the hardcoded Visa row replaced with a real
  loading/error/empty/list section (`CardBrandBadge` generalized from the old Visa-only logo, any
  Stripe-supported brand), "Add Payment Method" wired to the real flow, tapping a card opens an
  action sheet (Set Default / Remove Card), pull-to-refresh now also refreshes the card list.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean across the whole project.

**2. Lint.** `npx eslint` on all four touched/new mobile files — 0 errors, 0 warnings.

**3. Edge functions: NOT statically verified.** No Deno CLI available in this environment to run
`deno check` before deployment — the three new functions were written by close pattern-matching
against working existing functions (`create-connect-onboarding-link`, `_shared/payments.ts`), but
deployment itself will be the first real syntax/type check. Flagged honestly, not glossed over.

**4. Device: NOT run.** Entirely new, unexercised code path.

## Required actions — you need to run these, I can't (production writes)

1. **`supabase db push`** — applies the `payment_methods` migration. Expect a clean apply (single
   new table + one new function, no ledger conflicts like F5 hit, since this migration was written
   fresh this session with no pre-existing remote drift for it).
2. **Deploy the three new edge functions** — `supabase functions deploy create-setup-intent`,
   `confirm-payment-method`, `delete-payment-method` (or your usual batch-deploy method). This is
   the step that will surface any Deno syntax issue, since it wasn't checked locally.
3. **Confirm `STRIPE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` secrets** are already set on the
   project for edge functions — they should be, since every existing PaymentIntent-creating function
   already requires them; no new secret should be needed.
4. Once 1–3 are done, ship the mobile-side code via OTA update
   (`node ./scripts/publish-update.js preview`) — pure JS/TS, no native change, same as the
   tournament-hero-image fix earlier today.

## Next step (not started)

After the above: test the full flow on-device — add a real (Stripe test-mode) card via "Add Payment
Method", confirm it appears with correct brand/last4 and is marked default, add a second card and
set it default, remove a card and confirm the remaining one gets promoted to default if it was the
one removed, and confirm the empty state shows correctly with zero cards saved. None of this has
been exercised yet — it's new code, not a regression check.

---
---

# Out-of-scope fix (2026-09-07): truncated marketplace listing action row

**Not part of the performance audit.** User spotted `apps/mobile/src/app/marketplace/my-listings.tsx`'s
per-listing action row (Edit / Mark Pending / Mark Sold / Delete, as inline text buttons in a
horizontal row) overflowing and clipping off the right edge of the screen once a listing had all
four actions available — confirmed in the screenshot ("Delete" cut off mid-word).

## Fix

Not a new component — `apps/mobile/src/components/ContextMenu.tsx` already exists for exactly this
(extracted from `groups/[id].tsx`'s overflow menu), presenting the **real iOS system action sheet**
via `ActionSheetIOS` (no custom-drawn popover to maintain, gets native blur/spacing/Dynamic
Type/VoiceOver/destructive-red styling for free) with an Android popover fallback, and — the reason
it's the right choice here — **no new native module**, so this ships via OTA update like every other
JS fix today, not a new build. (That file's own comment already rules out a true long-press
`UIContextMenuInteraction` for the same reason: it needs a native module.)

`my-listings.tsx`: the four-button row replaced with a single "•••" trigger per listing row
(extracted into its own `ListingRow` component so each row can hold its own trigger ref for
Android's popover positioning — `FlatList`'s `renderItem` can't call hooks directly). Menu items
are built per-item (`menuItemsFor`) so a sold listing correctly only offers Delete, matching the
original conditional-rendering logic exactly, just presented as a menu instead of a row of buttons
that could disappear mid-row.

## Verification performed

**1. TypeScript.** `npx tsc --noEmit` — clean.

**2. Lint.** `npx eslint src/app/marketplace/my-listings.tsx` — clean, 0 errors, 0 warnings.

**3. Device: NOT yet run.**

## Next step (not started)

Ship via OTA (`node ./scripts/publish-update.js preview`) — pure JS, no native change — then
confirm on-device: tapping "•••" on a listing shows the real iOS action sheet (not clipped, not a
custom popover), a sold listing's sheet only offers Delete, and every action (Edit navigation, Mark
Pending/Active/Sold, Delete confirmation) still does what it did before.
