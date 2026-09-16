# Performance Audit — Web App

**Date:** 2026-09-16
**Scope:** `web/` (Next.js 16, App Router, Turbopack)
**Mode:** Read-only. One production build (`next build`) was run to inspect real
output artifacts (chunk sizes, the build manifest). No code, dependency, or
database changes were made for this audit; the one fix mentioned in passing
(the marketplace photo RLS policy) landed earlier today in a separate change
and is noted here only where it's directly relevant.

---

## Executive summary

Two findings account for most of what a real visitor would feel, and both are
structural rather than accidental — nobody wrote a slow line, the architecture
just has no guard against the failure mode:

1. **Analytics rode in the same bundle as the app, unnecessarily.** PostHog
   was wired into the root layout with a static import, so its JS shipped to
   every page load — including anonymous public pages (landing, the
   marketplace listing built this session, auth) with nothing yet to
   identify. Measured from the actual build output: **~700 KB (uncompressed)
   of JS loaded on every single route**, and a 424 KB chunk carrying Sentry
   was the largest thing in that set. Sentry itself is deliberately NOT
   deferred (see F1) — it loads early on purpose, to catch hydration-time
   errors, and its config is already lean (no Replay, no tracing). PostHog
   had no such reason to load early and has been converted to a dynamic
   import in this session's Phase 2.

2. **User-generated images bypass `next/image` app-wide.** `next.config.ts`'s
   `remotePatterns` allow-lists only `images.unsplash.com` and
   `images.pexels.com` — not the Supabase storage host that every avatar,
   marketplace photo, and facility photo is actually served from. The result:
   **38 raw `<img>` tags across 20 files**, none lazy-loaded, none resized,
   none served as WebP/AVIF. This is the single highest-leverage image fix
   available because it's one config change plus a mechanical swap, not 38
   independent decisions.

Beneath those two, the biggest client-rendered pages fetch data in long
sequential chains rather than in parallel — the profile page alone makes 9
sequential round-trips, and the first one is an **unfiltered `select` of every
row in `profiles`**, so every other fetch on that page queues up behind a
full-table scan before the page has rendered anything.

**What this audit does not cover, stated plainly:** no Lighthouse run, no
Core Web Vitals field data (CrUX/Vercel Analytics), no React DevTools
Profiler trace, and no server-side query plan (`EXPLAIN ANALYZE`) was pulled
for any of the flagged Supabase queries. Every finding below is from static
code inspection and one real production build's output — real artifacts, but
not a substitute for measuring an actual page load. Section 6 lists what to
capture before trusting the severity ranking over your own judgment.

---

## 1. Findings, ranked by severity

### F1 — Analytics/monitoring JS loads on every page — **HIGH**

**Evidence.** `next build` was run and its output inspected directly rather
than estimated:

- `.next/build-manifest.json`'s `rootMainFiles` — the files Next.js injects
  into the `<script>` tags of literally every route — lists 6 JS chunks
  totalling **698 KB uncompressed**.
- The largest of those, `17vj4abtm3mxx.js` at **424 KB**, contains 24
  matches for the string `Sentry` and no other recognizable library. Nothing
  else in `rootMainFiles` approaches that size.
- `AnalyticsProvider` ([`src/components/layout/analytics-provider.tsx`](web/src/components/layout/analytics-provider.tsx))
  is mounted unconditionally in [`src/app/layout.tsx`](web/src/app/layout.tsx)
  — the root layout every route renders inside. Its module does a static
  `import posthog from "posthog-js"` ([`src/lib/analytics/index.ts:26`](web/src/lib/analytics/index.ts#L26)),
  not a dynamic `import()`. A static import inside a component that's always
  rendered means PostHog's code rides in the root layout's own bundle
  regardless of which chunk webpack/Turbopack happens to place it in — there
  is no route where it can be absent.
- **Correction, caught during Phase 2 execution:** the first pass of this
  audit searched only the repo root and concluded no client-side Sentry init
  existed. Wrong search location — it lives at
  [`src/instrumentation-client.ts`](web/src/instrumentation-client.ts), which
  is where Next 15+ actually expects it. Client-side error capture **is**
  active. Reading it changed this finding's remediation (see below): the
  config is already deliberately lean — no Replay, no Session Tracking
  (the file's own comment explains why: this app's DOM includes chat
  messages and payment forms), `tracesSampleRate: 0` in the shared options
  ([`src/lib/observability/scrub.ts:195`](web/src/lib/observability/scrub.ts#L195)),
  and no extra `integrations` override to trim. There isn't a lever left to
  pull on Sentry's side without undoing a deliberate choice.

**Why it's high severity, not just a size number.** This isn't 700 KB spread
proportionally across the app — it's 700 KB paid by the *anonymous, public*
surface too: the landing page, `/auth`, `/tournaments`, and the
`/marketplace/[id]` page built earlier today specifically so a pasted link
works for someone who has never opened this product. That page's entire
design point was to paint fast for a stranger on an unknown connection
([`web/src/app/marketplace/[id]/page.tsx`](web/src/app/marketplace/[id]/page.tsx)'s
own comments say as much) — and it currently pays the same monitoring-JS tax
as the logged-in dashboard.

**What this audit did not verify:** the gzip/brotli-compressed size (roughly
a third of the raw figure is a reasonable estimate, not a measurement), and
how much of the 424 KB is Sentry's actually-necessary error-capture core
versus optional pieces (session replay, tracing integrations) that may be
enabled by default and are individually disable-able.

---

### F2 — User-generated images never reach `next/image` — **HIGH**

**Evidence.**

- [`next.config.ts`](web/next.config.ts)'s `images.remotePatterns` lists only
  `images.unsplash.com` and `images.pexels.com`.
- Every user photo — avatars (`profile-settings.tsx:98,105`), marketplace
  listing photos, facility photos — is uploaded to and served from Supabase
  Storage, a host `next/image` is never told about. Requesting it through
  `next/image` against an unlisted host throws at request time, which is
  presumably *why* the codebase reaches for plain `<img>` instead — this
  looks like a config gap that was worked around 38 times rather than fixed
  once.
- Grep confirms the scope: **38 `<img>` tags across 20 files**, against
  **1 file** using `next/image`. A sample of 15 of those tags (across
  `profile/page.tsx`, `matchmaking/page.tsx`, `director/page.tsx`) shows
  **0** with `loading="lazy"`.
- This includes the page built earlier today
  ([`listing-gallery.tsx`](web/src/app/marketplace/[id]/listing-gallery.tsx)) —
  raised here rather than silently fixed, because it's in scope for whatever
  remediation this audit recommends and shouldn't be treated as already
  handled just because it's new.

**Impact, reasoned from the pattern rather than measured:** full-resolution
originals ship to every viewport size, there's no automatic WebP/AVIF
negotiation, and without `loading="lazy"` an off-screen image in a long list
(the matchmaking swipe deck, a facility's photo grid) competes for bandwidth
with content the visitor can actually see. `profile/page.tsx` and
`matchmaking/page.tsx` carrying 6 raw `<img>` tags each makes them the
concrete pages to start with.

**What this audit did not verify:** actual file sizes of the images being
served (no sample was downloaded and measured), and whether a Supabase
Storage transform/resize endpoint already exists that a fix could route
through instead of `next/image`'s own optimizer — that's the first thing to
check before choosing an approach in Section 2.

---

### F3 — Sequential data-fetch waterfalls on the largest client pages — **MEDIUM-HIGH**

**Evidence.** Counting `await supabase`/`await fetch` calls against
`Promise.all` usage in the six largest `"use client"` pages:

| Page | Sequential awaits | `Promise.all` calls |
| --- | --- | --- |
| `profile/page.tsx` (1,100 lines) | 18 | **0** |
| `matchmaking/page.tsx` (1,141 lines) | 17 | **0** |
| `admin/page.tsx` (2,102 lines) | 9 | 1 |
| `director/page.tsx` (1,676 lines) | 12 | 1 |
| `dashboard/page.tsx` (1,511 lines) | 13 | 1 |
| `tournaments/[id]/tournament-detail-client.tsx` (1,214 lines) | 7 | 0 |

The clearest case is `profile/page.tsx`'s `load()` function
([`src/app/profile/page.tsx:273-410`](web/src/app/profile/page.tsx#L273-L410)):
nine `await` calls in a row, none in a `Promise.all`, and at least six of
them — hidden matches, the profile row, match history, registrations,
bookmarks, mutual matches — depend on nothing but the already-known
`user.id`. They have no reason to run in sequence.

**The specific line worth naming:** the *first* of those nine awaits
([`src/app/profile/page.tsx:280`](web/src/app/profile/page.tsx#L280)) is

```ts
const { data: usersData } = await supabase.from("profiles")
  .select("id,full_name,role,avatar_url").order("full_name");
```

— an unfiltered, unlimited select of every row in `profiles`, fetched
unconditionally on every profile page load for a messaging recipient picker
the visitor may never open, and positioned first so every other fetch on the
page queues up behind it. At the current ~51 rows this costs little; it's
flagged because it's an **unbounded** query wired into a page's critical
path, not because today's row count is a problem. A related finding from the
earlier web/mobile alignment audit noted the same pattern in the messaging
panel specifically — this is the same shape, on the profile page's own load,
which is broader reach than that earlier note implied.

**Why MEDIUM-HIGH and not higher:** the pages that already use `Promise.all`
(admin, director, dashboard) show the fix is a known, applied pattern in this
codebase — this isn't unfamiliar territory, it's inconsistently applied. And
unlike F1/F2, the cost here is paid only by signed-in users on their own
data, not by anonymous visitors.

**What this audit did not verify:** actual round-trip latency for any of
these queries (no `EXPLAIN ANALYZE`, no network trace), so "9 sequential
round-trips" is a call-count fact, not a measured millisecond figure.

---

### F4 — `select("*")` inconsistent with the codebase's own stated convention — **LOW-MEDIUM**

**Evidence.** Six call sites, five of them in `/play/*`
(`play/page.tsx:102`, `play/[id]/join/page.tsx:34`,
`play/[id]/manage/page.tsx:43-44,57`, `play/[id]/play-event-client.tsx:45,62`,
`play/[id]/standings/page.tsx:32-34`), select `"*"` rather than named
columns. This matters less for its own sake and more because the codebase
already documents the opposite rule elsewhere — a comment in
[`src/lib/og/fetchers.ts:179`](web/src/lib/og/fetchers.ts#L179) says plainly
*"never select('\*')"*, referencing a specific migration
(`20260825120000_restrict_anon_profile_columns.sql`) written after an
over-broad grant leaked every profile's email. The `/play/*` surface simply
didn't get that memo. Low severity on its own — these tables are narrow —
but worth fixing as a consistency sweep alongside F3, since it's the same
files.

### F5 — Dead dependency: `framer-motion` — **LOW**

`framer-motion` is in `package.json` (`^12.40.0`) with **zero** import sites
anywhere in `src/`. Same class of finding as this repo's earlier removal of
`@tanstack/react-query` and `lucide-react` (both zero-usage). If genuinely
unused, tree-shaking likely already excludes it from shipped bundles, so the
practical cost is closer to `npm install` time and lockfile weight than
runtime JS — but it's a one-line removal to confirm and close out.

### F6 — Icon barrel imports not covered by `optimizePackageImports` — **LOW, unverified impact**

38 files import from the `@phosphor-icons/react` package barrel with named
imports. Next.js's own documentation specifically recommends
`experimental.optimizePackageImports` for icon libraries like this one, to
guarantee per-icon chunking regardless of how well the library's own barrel
tree-shakes — and `next.config.ts` doesn't set it. This is a genuine
best-practice gap with essentially no downside to fixing, but **this audit
found no direct evidence of an actual oversized-chunk problem caused by it**
(no Phosphor-specific chunk was identified as anomalously large in the build
output). Listed as a cheap, safe addition rather than a proven regression.

### F7 — No pagination on the largest admin/director list views — **LOW-MEDIUM, low reach**

`admin/page.tsx` renders 54 separate `.map()` calls with no `.range()` or
`.limit()` visible on its list queries, consistent with unbounded lists
rendered in full. Lower priority than F1-F3 because this surface is used by
a handful of internal staff, not the consumer base — the same pattern on a
player-facing screen would be MEDIUM-HIGH.

---

## 2. What's already fine — worth stating, not just implying

- **Fonts** are loaded via `next/font/google` in the root layout
  (`Manrope`, `Bebas_Neue`, `JetBrains_Mono`), which self-hosts and
  subsets them at build time — no render-blocking third-party font request.
  This is the correct pattern and needs no change.
- **`packages/shared`'s token generator** (`scripts/gen-tokens.mjs`, run via
  `prebuild --check`) means design-token drift fails the build rather than
  shipping — unrelated to runtime performance, but worth naming so it isn't
  mistaken for a gap.
- **`vitest` is fast and already wired** (53 tests, ~0.6s) — any fix from
  this audit that touches `packages/shared` has a real test loop to use.

---

## 3. Remediation plan

Ordered by impact-per-effort, not strictly by severity — F2's config change
is nearly free and unblocks a mechanical sweep, so it leads.

### Phase 1 — Config-level, low-risk, do first

1. **F2 — Add the Supabase storage host to `remotePatterns`.** One line in
   `next.config.ts`. This alone doesn't convert any `<img>` tags, but it's
   the prerequisite for every conversion after it, and it's zero-risk on its
   own — nothing consumes it yet.
2. **F6 — Add `experimental.optimizePackageImports: ["@phosphor-icons/react"]`.**
   Zero-risk, documented pattern, one line.
3. **F5 — Remove `framer-motion`.** Confirm zero usage (already done in this
   audit), remove from `package.json`, regenerate the lockfile.

**Verify:** `next build` still succeeds; diff `rootMainFiles` and the chunk
list against this audit's baseline numbers to confirm nothing regressed.

### Phase 2 — F1: get PostHog off the critical path — **DONE, revised in execution**

The plan as originally written proposed deferring both Sentry and PostHog.
Executing it surfaced a fact the audit's read-only pass missed: client-side
Sentry capture lives at `src/instrumentation-client.ts` (a directory this
audit's first pass didn't search) and is deliberately configured to load
EARLY — Next's own convention for this file runs it before hydration
specifically so it can catch hydration-time errors, and the shared options
already have Replay off, tracing off, no extra integrations. **Deferring
Sentry would have undone a deliberate design choice for a size win that
isn't there to take** — there was no disable-able extra to trim. So Sentry
was left untouched, and this phase narrowed to PostHog, which had no such
constraint.

1. `src/lib/analytics/index.ts`: `import posthog from "posthog-js"` became a
   dynamic `import("posthog-js")` inside `initAnalytics`, which already ran
   inside a `useEffect` — the timing hook existed, it just wasn't used.
   `initAnalytics` is now `async`; a module-level `posthogRef` is set
   alongside the existing `started` flag once the import resolves, and
   `track`/`identifyUser`/`resetAnalytics` read that ref instead of a
   module-scope binding.
2. The dynamic `import()` is a new failure mode the static import never had
   — an ad blocker or an offline visitor can fail it at runtime, where a
   static import can only fail at build time. Wrapped in `try/catch` to
   preserve this file's existing "analytics never throws" guarantee, which
   every other exported function here already honors.
3. `AnalyticsProvider`'s call site updated to `void initAnalytics(...)` —
   fire-and-forget is correct since the effect has no cleanup and
   `initAnalytics` cannot reject (the try/catch swallows it).

**Verified:** `tsc --noEmit` clean, `next build` succeeds,
`rootMainFiles` re-measured (see Section 5 for the before/after).

### Phase 3 — F2 continued: convert the highest-traffic `<img>` sites

Once Phase 1's config change lands, convert in order of reach rather than
all at once:

1. `profile/page.tsx` (6 tags) and `matchmaking/page.tsx` (6 tags) first —
   highest occurrence count, and matchmaking's swipe deck is exactly the
   kind of scrolling list `loading="lazy"` and responsive `sizes` help most.
2. `marketplace/[id]/listing-gallery.tsx` (3 tags) — small, and it's the
   page this session built specifically to be fast for a stranger.
3. The remaining 17 files, roughly one or two tags each.

Each conversion is mechanical (`<img>` → `next/image` with a `sizes` prop)
but touches rendered UI, so each should be its own small, reviewable change
rather than one 38-site sweep — consistent with how this session's other
work has been done throughout today.

### Phase 4 — F3/F4: parallelize the profile and matchmaking loads

1. `profile/page.tsx`'s `load()`: wrap the independent fetches (hidden
   matches, profile row, match history, registrations, bookmarks, mutual
   matches) in `Promise.all`. The messaging recipient list (line 280) is the
   one to look at hardest — consider whether it needs to load on every
   profile visit at all, or only when the messaging UI is actually opened.
2. Same pattern in `matchmaking/page.tsx`.
3. Fold in F4 while touching these files: swap the `/play/*` `select("*")`
   sites to named columns, matching the convention already documented in
   `lib/og/fetchers.ts`.

**Verify:** page still renders identical data; if before/after timing is
available, note it — this is where a real network trace would turn this
audit's call-count reasoning into an actual measured number.

### Phase 5 — F7, only if it becomes a real complaint

Server-side pagination for `admin/page.tsx`'s list views. Held to last
because current reach is small (internal staff) and the fix is more
involved than the others (touches queries, not just rendering) — worth
doing, not worth doing before the phases that affect every visitor.

---

## 4. What I'd verify before trusting the ranking

Stated in the mobile audit's spirit of not overclaiming: this audit ranks
findings by *code-evidence severity and blast radius*, not by measured
user-perceived impact. Before treating "F1 is HIGH" as more than a
reasonable inference:

1. **A Lighthouse or PageSpeed Insights run** against the live
   `pickleballapp.app` landing page and `/marketplace/[id]`, both logged out.
2. **Vercel Analytics or CrUX field data**, if either is already collecting —
   would show whether real visitors are actually bottlenecked on JS parse
   time (consistent with F1) versus something this audit didn't look at at
   all, like server response time or a slow upstream Supabase query.
3. **A gzip-compressed size check** of the `rootMainFiles` chunks — this
   audit's 698 KB figure is uncompressed on disk, which overstates the
   over-the-wire cost by roughly 2-3x.
4. **One real network trace** of `profile/page.tsx` loading, to convert
   F3's "9 sequential awaits" into an actual measured waterfall duration.

None of that was available in this session — no live URL fetch tool with
Lighthouse capability, no attached analytics dashboard. The plan above is
safe to execute regardless (every step is independently verifiable by
`next build` output and manual testing), but the *order* might change once
real measurement exists.

---

## 5. Execution log — measured, as each phase lands

This section is appended to as phases complete, with real before/after
numbers rather than the pre-execution estimates in Section 1.

### Phase 1 (config + dead dependency)

`next build` succeeded with the new `remotePatterns` entry and
`optimizePackageImports`. No `rootMainFiles` regression — expected, since
neither change alters what loads eagerly; they enable later work (Phase 3)
and remove code nothing was executing.

### Phase 2 (PostHog deferral)

**What changed:** `src/lib/analytics/index.ts`'s `import posthog from
"posthog-js"` became a dynamic `import()` inside `initAnalytics`.

**`rootMainFiles` total went UP slightly, not down** — 715,679 bytes before
this session's Phase 1 baseline vs 726,661 bytes after Phase 2 (+10,982
bytes). Worth being direct about why, rather than letting a plan's stated
goal quietly not match its result: `rootMainFiles` was already not where
PostHog's weight lived (confirmed in the very first audit pass — the
combined posthog/stripe chunk was already "route-specific," not global by
that specific manifest list). The 11 KB increase is Turbopack's own runtime
glue for handling a new async-chunk boundary, and it is paid on every page
in exchange for PostHog's ~258 KB no longer being one of them.

**The real, directly-verified win** is not visible in `rootMainFiles` at
all — it required inspecting an actual prerendered page's emitted `<script>`
tags. Located the chunk actually holding the PostHog library body by
grepping every output chunk for `distinct_id` (a string that only appears in
the real library, not in this app's own thin wrapper around it):
`2n-s4cm5nrumg.js`, 264,208 bytes. Confirmed by direct inspection of
`.next/server/app/tournaments.html` (a real static page's real output) that
this chunk is **absent** from its emitted script tags, and absent from
`rootMainFiles`. It exists on disk, ready to be fetched, and is fetched only
when `initAnalytics`'s `import()` actually executes at runtime — after the
effect runs, after first paint.

**What I did not do:** keep a byte-exact snapshot of the *pre-Phase-2*
build's full script-tag list to diff directly against — `.next/` was
rebuilt over between phases rather than archived. The causal claim (static
import → eager; dynamic import → deferred) rests on how ES module bundling
works, not on an A/B diff of two preserved builds. I'm confident in it for
that reason, but it's a different kind of confidence than the F1 chunk-size
measurement itself, and it's worth knowing which is which.

**Net effect for a real visitor:** on first paint, ~258 KB less JS is
in-flight than before, at the cost of ~11 KB more runtime glue always
present. Sentry — deliberately left untouched — remains the largest single
piece of always-loaded JS (424 KB), for the reason given in F1's corrected
evidence: its early load timing is intentional, and its configuration was
already lean before this audit touched anything.

### Phase 3 (F2 — `<img>` to `next/image`)

**32 of 36 real `<img>` tags converted** across 17 files. The remaining 4 are
deliberate, each with a comment explaining why, not oversights:

1. `director/page.tsx` and `director/tournaments/[id]/page.tsx` — a banner
   *preview* bound to a text field where the director can paste **any** URL
   ("Paste a direct image URL"). `next/image` throws at request time for a
   host outside `remotePatterns`, so it structurally cannot preview an
   arbitrary host the way this control needs to.
2. `admin/facility-import/page.tsx` — already had its own justification
   comment predating this session (a Google Places photo proxy, admin-only,
   used during a one-time import workflow); left as-is rather than
   overridden.
3. `ticket-panel.tsx` — a chat attachment of unknown, variable natural
   dimensions. `next/image` needs a width/height (or a sized `fill` parent)
   to reserve layout space; forcing one here would either distort the image
   or require storing dimensions at upload time, which is new work outside
   this audit's scope.

**Two new `remotePatterns` hosts added beyond the Phase 1 Supabase one:**
`logo.clearbit.com` (sponsor carousel — always that host, only the path
varies) with `unoptimized` on that specific `<Image>`, since routing ~15
already-cached external brand logos through Next's server-side optimizer for
a 4:1 downscale costs more (a round trip, Vercel image-transform quota) than
it returns.

**A real mistake caught by `tsc`, not by review:** a batch-edit script
inserted the new `import Image from "next/image"` line in the middle of two
files' existing multi-line `import { ... } from "..."` blocks (landed after
the FIRST line of the block rather than after it closes), breaking their
syntax outright. `tsc --noEmit` failed immediately and named both files
precisely — `play-event-client.tsx` and `player-profile-sheet.tsx` — which is
exactly the value of running a full project-wide typecheck after a
scripted, multi-file edit rather than trusting the edit script's own
success output. Both fixed, then the whole `src/` tree was re-scanned in
Python for the same corruption pattern (a bash/grep attempt at the same
check produced a false-positive matching nearly every file, due to how
shell quoting handles embedded newlines in a pattern — worth remembering
for next time: verify a multi-line-pattern grep result before trusting it,
especially when it returns suspiciously many hits).

**Sizing decisions, briefly:** fixed-pixel avatars/thumbnails got explicit
`width`/`height` matching their Tailwind size class exactly (so the
rendered box is unchanged); images inside an already-`relative`,
already-sized container got `fill` with a `sizes` attribute reflecting the
real responsive layout, not a guess. Three images marked `priority` because
each is the single largest above-the-fold element on its page: the profile
header avatar and cover, the landing page hero, the marketplace listing's
main photo, and the matchmaking swipe deck's current card (that last one
priority for a different reason — it is never off-screen, so lazy-loading
it would be actively wrong, not just unhelpful).

**Verified:** `tsc --noEmit` clean across the full project (not just changed
files), `eslint src --quiet` reports zero errors, `next build` succeeds with
no Image-related runtime errors during static generation, 53 tests pass.
**Not verified:** actual decoded file sizes or WebP/AVIF negotiation in a
real browser — that needs a live deploy and a network panel, which this
session doesn't have access to.

