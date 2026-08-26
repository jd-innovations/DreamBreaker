# Web ↔ Mobile Divergence Audit

Read-only audit, 2026-08-26, against `9f23754`. **No files were modified.**

Rendered version: https://claude.ai/code/artifact/a6963642-ddf2-44ff-87da-ea659fbb8626
Companion plan: `WEB_MOBILE_ALIGNMENT_PLAN.md`

Every claim marked **[Evidence]** is verifiable from the repository. Everything
marked **[Recommendation]** is a product decision, not a finding. The purpose is
to establish current state so platform decisions can be made deliberately — it
does not propose feature parity, and it does not treat "exists on one platform
only" as a defect by itself.

---

## 1. Executive Summary

| | |
| --- | --- |
| Real web pages | **28** (plus 6 "open in the app" stubs) |
| Mobile routes | **~150** |
| Shared RPCs | **0** |
| Shared packages | **0** |
| Paid flows missing a payment step | **1** |

The two applications are not a web app and its companion. They are two
independently built products addressing the same database. There is no
monorepo, no workspace configuration, no shared package and no shared design
token — the only file they have in common is a 267 KB generated types file that
exists as a **byte-identical copy** in each tree.

Most of the divergence is defensible. Mobile is roughly five times the surface
area and owns the consumer experience: onboarding, wallet, stats, session
logging, lessons, marketplace creation, push. Web is where the data-dense
operational work lives — the admin console and director tooling are its four
largest pages. **This audit does not propose undoing that split.**

Three findings are not defensible, and one is moving money.

### Finding 1 — Tournament registration takes no payment on web 🔴

`web/src/app/tournaments/[id]/page.tsx` renders a button labelled
`` COMPLETE · ${entryFee - holdFee} `` — it shows the user a price — and its
handler writes `status: "registered", entry_fee_paid_cents: 0` directly through
the Supabase browser client. **There is no Stripe code anywhere on that page.**
Mobile performs the same action through
`create-tournament-entry-balance-payment-intent` and PaymentSheet.

The same user action against the same table produces a charge on one platform
and a free registration on the other. The row it leaves behind is
indistinguishable in shape from the phantom-revenue rows cleaned out of
production under TODO 1.1 item 6.1.

### Finding 2 — The platforms share no server contract 🔴

Web calls 7 RPCs. Mobile calls 27. **The overlap is zero.** Web invokes one Edge
Function; mobile invokes nine, and that overlap is zero too. Every behaviour
implemented on both sides is implemented twice, independently, with no shared
layer keeping them honest.

### Finding 3 — The two apps are not the same brand 🔴

Web's primary is `hsl(84 81% 56%)` — a lime green. Mobile's is gold `#C9A84C` on
navy `#0A1228`. These are not drifted variants of one palette; they are
unrelated identities.

**Recommended posture:** not convergence. Name an owner for each capability, fix
the three findings, and put a token contract between the platforms so deliberate
differences stay deliberate.

---

## 2. Repository Architecture **[Evidence]**

| Dimension | Web | Mobile |
| --- | --- | --- |
| Framework | Next.js 16.2.9, React 19.2.4, App Router | Expo SDK 54, React Native 0.81.5 |
| Routing | File-based App Router, 34 `page.tsx` | expo-router 6.0.24, ~150 route files |
| State | Local state + 1 context. `@tanstack/react-query` is a dependency **used in 0 files** | 3 contexts + 18 custom hooks |
| Supabase | `@supabase/ssr` — browser, server, service-role | `@supabase/supabase-js`, single client |
| Payments | Next API routes: Stripe Connect + **webhook receiver** | Edge Functions + `@stripe/stripe-react-native` |
| Design system | Tailwind v4, 68 HSL custom properties, Radix, `next-themes` | TS token modules, no theming layer |
| Components | 5 UI primitives + 8 shared | ~40 components, some `.native/.web` split |
| Icons | Phosphor **and** Lucide | `@expo/vector-icons` + custom |

### How much is shared

Effectively nothing. No root `package.json`, no workspaces field, no
`turbo.json` or `pnpm-workspace.yaml`. The apps install and build independently.

- **`database.types.ts` is duplicated byte-for-byte** — 267,042 bytes at both
  `web/src/lib/supabase/database.types.ts` and
  `apps/mobile/src/lib/database.types.ts`. Identical today, meaning it has been
  regenerated in lockstep so far. Nothing enforces that.
- **`legal.ts` exists on both sides and has already diverged.** It is the only
  other same-named module, and it is not identical.
- Everything else — queries, formatting, validation, permission checks — is
  written twice.

### Dead code in the repository root

`frontend/` (CRA + craco) and `backend/` (Python `server.py`) are still present
with `node_modules`. Last commits **2026-06-13** and **2026-06-12**, against
2026-08-26 for the live trees. A predecessor stack, not part of the running
system.

---

## 3. Functional Capability Matrix

Status columns are **[Evidence]**; the platform-model column is
**[Recommendation]**. Six web routes are `MobileLinkFallback` stubs — a page
that says "open this in the app" and renders no data — marked *Stub* rather
than counted as coverage.

| Capability | Web | Mobile | Shared backend | Functional difference | Model (rec.) | Pri |
| --- | --- | --- | --- | --- | --- | --- |
| Auth (email/OAuth) | Full | Full | Yes | Web OAuth wired 2026-08-25; both blocked on redirect allowlist | Shared | P1 |
| Onboarding | 1 page, 139 ln | **20 screens** | Yes | Mobile collects DOB, gender, home court, radius, play style, availability | Mobile Primary | P2 |
| Profiles | Full (1,088 ln) | Full + edit | Yes | Comparable | Shared | P3 |
| Dashboard / Home | Full (1,511 ln) | Tabs home | Yes | Different information models entirely | Needs Decision | P2 |
| Tournament discovery | Full | Full | Yes | Comparable | Shared | P3 |
| Tournament detail | Full (1,152 ln) | Full | Yes | Comparable | Shared | P3 |
| **Registration + entry fee** | Direct write, **no payment** | Edge Fn + PaymentSheet | Same table | **Web registers without charging** | Mobile Primary | **P0** |
| Hold My Spot | Full incl. countdown | Full | Same table | Web "complete" skips the balance charge | Shared | **P0** |
| Waitlist | Direct insert | Present | Same table | Web computes position client-side | Shared | P2 |
| Director console | **Full (1,682 ln)** | Present | Yes | Web far deeper | Web Primary | P2 |
| Tournament creation | Full | Full | Yes | Both complete; duplicated logic | Web Primary | P2 |
| Divisions / pools / seeding | Full (1,420 ln) | Partial | Yes | Web has serpentine pooling + drag seeding | Web Primary | P3 |
| Brackets | Generation + tree | View only | Yes | Web generates, mobile consumes | Web Primary | P3 |
| Scoring | Director-side | Score entry screens | Yes | Mobile is the courtside tool | Mobile Primary | P2 |
| Check-in / QR | None | Scan + QR + manual | `check_in_registration` | Mobile only by nature | Mobile Only | — |
| Live tournament ops | Partial | Command center, workspace | Yes | Split with no defined boundary | Needs Decision | P2 |
| Facilities | None | Detail + search | `search_facilities_nearby` | Web absent | Needs Decision | P3 |
| Court booking | **Stub** | 7-screen flow | Edge Fn | Web cannot book | Mobile Primary | P3 |
| Reservations | None | Full lifecycle | 6 RPCs | Mobile only | Mobile Primary | P3 |
| Flash Deals | None | `reservation_best_flash_deal` | Yes | Mobile only | Mobile Only | — |
| Groups | **Stub** | Full + chat + edit | Yes | Web cannot participate | Mobile Primary | P3 |
| Community Play | 5 routes | Full | Yes | Closest to genuine parity | Shared | P3 |
| Quick Game / RR / Mini | None | Full, 3 formats | Yes | Mobile only | Mobile Primary | P3 |
| Partner Finder | Full (1,084 ln) | Full + prefs | Same tables | **Different filters — see §4** | Shared | P1 |
| Messaging | **Stub** + inline panel | Full chat | Yes | Web has no standalone chat | Mobile Primary | P2 |
| Push notifications | None (impossible) | Full | `send-message-push` | Platform-inherent | Mobile Only | — |
| Marketplace | **Stub** | Browse, create, edit, mine | Yes | Web cannot list or buy | Mobile Primary | P3 |
| Wallet | None | Full (flagged hidden) | Yes | Mobile only | Mobile Only | — |
| Coach / lessons | **Stub** | Coach hub + offers + browse | Yes | Both flagged hidden on mobile | Mobile Primary | P4 |
| Stats / PAR | None | Stats tab + log-session (17 screens) | 4 PAR RPCs | Mobile only, substantial | Mobile Only | — |
| Calendar | None | `expo-calendar` | n/a | Native capability | Mobile Only | — |
| Weather | None | `event-weather` | Edge Fn | Mobile only | Needs Decision | P4 |
| Admin | **Full (2,019 ln)** | None | Yes | Largest page in either app | Web Only | — |
| Support / moderation | Email note | Tickets + new-ticket | Yes | Mobile has the ticket system | Needs Decision | P2 |
| Analytics | None | None | n/a | Absent on both (item 4.2) | Web Primary | P2 |

**Feature flags materially change this picture.**
`apps/mobile/src/lib/featureFlags.ts` marks `paidBooking`, `coachMarketplace`,
`lessonMarketplace`, `wallet` and `marketplaceAiAssist` as **hidden** — built but
unreachable in a production build. Several rows above reading "Mobile only" are,
today, "nobody". Web has no equivalent flag system, so it cannot express the
same staging.

---

## 4. Workflow Divergence

### Tournament player journey **[Evidence]** 🔴

| Step | Web | Mobile |
| --- | --- | --- |
| Discover | `/tournaments` list + filters | Tournaments tab |
| Detail | `/tournaments/[id]` | `tournament/[id]` |
| Select division | Inline on detail page | Dedicated `select-division` |
| Hold | `hold-my-spot-dialog` | `hold-confirm` → `hold-success` |
| **Pay balance** | **No payment step exists** | Edge Fn → PaymentSheet → webhook |
| Confirm | Optimistic local state | `registration-success` |
| Check in | Absent | QR scan / display / manual |
| Results | Bracket tree | `player-results`, `player-brackets` |

The journeys agree until money is involved, then stop agreeing entirely.
Mobile's path produces a `payments` row, a Stripe intent id on the registration
and a webhook confirmation. Web's produces a registration asserting the entry fee
was paid in full at zero cents.

### Court booking journey **[Evidence]**

Mobile implements the whole thing — `booking/index` → `choose-time` → `players`
→ `review` → `confirmation`, plus `my-bookings`, `game-status`, `results` — on
six RPCs (`create_reservation`, `confirm_reservation`, `cancel_reservation`,
`join_reservation`, `accept_reservation_invite`, `reservation_occupancy`). Web
has one stub. A clean, intentional-looking split needing no remediation beyond
being written down.

### Social journey **[Evidence]** 🔴

Both platforms implement partner discovery against the same tables with
different rules. Mobile's `useFinderCandidates` filters on `is_discoverable`,
`partner_preferences.actively_looking`, a skill-range window and a distance
radius. Web's `/matchmaking` filters on `role = 'player'` and orders by DUPR —
**it does not check `is_discoverable` at all.**

A user who turns discovery off in mobile's Match Settings is still surfaced to
other users on web. The control exists in the UI, writes to the database, and is
read by one of the two clients.

---

## 5. Backend & Business Logic Divergence **[Evidence]**

| Surface | Web | Mobile | Overlap |
| --- | --- | --- | --- |
| RPCs | 7 | 27 | **0** |
| Edge Functions | 1 | 9 | **0** |
| Stripe surface | Connect + webhook receiver | 6 payment-intent functions + PaymentSheet | Complementary |

The Stripe split is coherent and worth preserving: mobile creates intents, web
receives the webhook that finalises them. The webhook is correctly pointed at
`pickleballapp.app` and is the single writer of payment outcomes. **Nothing here
should change.**

### HIGH-RISK PLATFORM DIVERGENCE

1. **Registration bypasses payment on web.** Same table, same status transition,
   opposite money outcome.
2. **`is_discoverable` ignored by web matchmaking.** A privacy control honoured
   by one client only.
3. **Web writes `registrations` and `tournaments` through the browser client.**
   Mobile routes equivalent writes through RPCs and Edge Functions where
   server-side invariants live. Web's writes are constrained only by RLS and the
   C7 trigger.
4. **Waitlist position computed client-side on web.** `max(position) + 1` read
   then written from the browser — a race between concurrent joiners.
5. **`legal.ts` has already diverged.** Legal copy differing by platform is a
   compliance surface, not a styling one.
6. **Dev-only payment simulation exists on web only.**
   `/api/dev/simulate-payment` can mark payments succeeded without Stripe.
   Double-gated (`NODE_ENV` + `DEV_TOOLS_SECRET`), no mobile counterpart.

---

## 6. Design System Audit **[Evidence]**

| Element | Web | Mobile | Relationship |
| --- | --- | --- | --- |
| Primary | `hsl(84 81% 56%)` lime | `#C9A84C` gold | Unrelated |
| Ground | `hsl(210 17% 98%)` | `#F3F6FC` / `#FFFFFF` | Coincidentally close |
| Ink | `hsl(240 6% 10%)` neutral | `#0A1228` navy | Different hue family |
| Token format | HSL CSS custom properties | TS hex constants | No shared source |
| Typography | Display face + system stack | Bebas Neue + system | Partially aligned |
| Radius | Tailwind scale, heavy `rounded-full` | `radius.ts` tokens | Independent |
| Theming | Light + dark + system (`next-themes`) | **Light only** | Asymmetric |
| Empty / error states | `route-error.tsx` + 9 boundaries | `ScreenState.tsx` trio | Same concept, built twice, same week |
| Icons | Phosphor **and** Lucide | Ionicons + custom | Three libraries total |

### Token discipline inside mobile

`apps/mobile/src/theme/colors.ts` states: *"This is the single source of truth
for color across the app. No screen should declare its own color object."*

| Measure | Count |
| --- | --- |
| Screens declaring a local `L` palette | **109** |
| Files importing the shared theme | 186 |
| Hard-coded `#FFFFFF` | **207** |
| Hard-coded iOS blue `#007AFF` | **35** |

The token system exists and is half-adopted. That is the more tractable problem:
mobile does not need a new design system, it needs the one it has to be used.
The 35 instances of raw iOS blue are the clearest tell — a platform default
leaking through a branded surface.

---

## 7. Platform Ownership **[Recommendation]**

### Mobile as the consumer reference

Mobile should be the visual reference for consumer surfaces, because that is
where the consumer product is: onboarding is 20 screens against web's one, and
wallet, stats, session logging, lessons and marketplace creation have no web
equivalent.

Translating upward should **not** produce a stretched phone UI:

| Mobile pattern | Web equivalent |
| --- | --- |
| Stacked scroll cards | Responsive card grid, 2–4 columns |
| Bottom sheet | Right side panel; dialog for short confirmations |
| Tab bar | Persistent sidebar or top nav |
| Full-screen sub-route | Master–detail in one view |
| Pull to refresh | Explicit refresh + background revalidation |
| Touch-first controls | Denser controls with hover and focus states |
| One card per record | Table where records are compared, cards where browsed |

### Web as the operational reference

Director, admin, analytics and moderation stay web-first — the admin console
(2,019 lines) and director tooling (1,682 + 1,420) are already the deepest
surfaces in either app, and drag-seeding a 64-player bracket is not a phone
interaction.

Mobile's operational role should be deliberately narrow: **check-in, courtside
scoring, live status, alerts, small corrections.** Configuration stays on web.

---

## 8. Design Alignment **[Recommendation]**

### Foundation tokens

One source of truth — plain JSON or TS, consumed by Tailwind's theme on web and
imported directly on mobile. Neither app should own it.

- **Colour** — resolve gold vs lime first; nothing else can be aligned until a
  brand decision exists.
- **Semantic colour** — success / warning / critical, separate from brand accent.
- **Type, spacing, radius** — mobile's scales are sound and documented; promote
  them rather than inventing new ones.
- **Breakpoints and motion** — web-only concerns; define but do not force onto
  mobile.

### Shared conceptual components

These share a contract, not code. React and React Native keep separate renderers.

| Component | Tokens | Types | Logic | Notes |
| --- | --- | --- | --- | --- |
| StatusBadge | Yes | Yes | Yes | Status → colour mapping must not differ |
| PriceDisplay | Yes | Yes | **Yes** | Cents formatting is a correctness surface |
| TournamentCard | Yes | Yes | Partial | Fill %, status, fee derivation shared |
| FacilityCard | Yes | Yes | No | Web has no facility surface yet |
| EmptyState / LoadingState | Yes | Yes | No | Both now exist; align props |
| StatTile, ProgressBar, FilterChip | Yes | Yes | No | Presentational |
| AppButton, AppCard, SearchField, UserAvatar | Yes | Partial | No | Tokens carry the resemblance |

---

## 9. Priority Findings

### Top functional divergences

1. 🔴 Web registers players without charging
2. 🔴 Web matchmaking ignores `is_discoverable`
3. Onboarding collects different data (20 screens vs 1)
4. No check-in on web — reasonable, but unrecorded as a choice
5. Six web routes are "open in the app" stubs
6. Messaging has no standalone web surface
7. Wallet, stats/PAR, session logging absent from web
8. Feature flags exist only on mobile
9. Facilities have no web surface despite a working RPC
10. Weather and calendar mobile-only (calendar inherent, weather not)

### Top design divergences

1. 🔴 No shared brand colour
2. 🔴 Mobile has no dark mode; web has three theme states
3. 109 mobile screens declare a local palette against explicit prohibition
4. 35 hard-coded iOS blue values
5. Three icon libraries
6. Empty/error states built twice in one week
7. Token formats cannot interoperate
8. Radius scales set independently
9. Status colours defined per platform
10. Web has 5 UI primitives to mobile's ~40

### Top architecture risks

1. 🔴 Zero RPC and Edge Function overlap
2. 🔴 Web mutates core tables from the browser
3. 267 KB of generated types duplicated by copy
4. No workspace — nowhere to put shared code
5. `legal.ts` already diverged, proving drift happens
6. Client-side waitlist position
7. Dead `frontend/` and `backend/` trees
8. `react-query` declared but unused on web
9. Two Stripe integration styles, undocumented
10. Dev payment-simulation route on web only

---

## 10. Quick Wins & Do Not Touch

### Quick wins **[Recommendation]**

1. Add `is_discoverable` to web's matchmaking query — one line, closes a privacy divergence
2. Delete `frontend/` and `backend/`
3. Drop the unused `react-query` dependency
4. Pick one web icon library (Phosphor is dominant)
5. Generate `database.types.ts` to one path and import it
6. Replace the 35 iOS-blue literals with a token
7. Align `EmptyState`/`ErrorState` prop names now, while both are new

### Do not touch yet

- **The Stripe split.** Mobile creates intents, web receives the webhook. Looks
  asymmetric, is correct. Changing it risks the one payment path verified working.
- **Mobile's hidden feature flags.** Do not "align" web to features staged off.
- **Anything requiring an iOS build.** Quota exhausted until 2026-09-01, five
  items already queued.
- **The registration-payment fix itself.** The *finding* is urgent; the *fix*
  needs a product decision first — does web take payments at all, or hand off to
  mobile? Implementing either before that decision risks building the wrong one.

---

## 11. Roadmap

Superseded by `WEB_MOBILE_ALIGNMENT_PLAN.md`, which sequences this against the
build blackout and TODO 1.1.

---

## 12. Proposed `WEB_MOBILE_PRODUCT_ALIGNMENT.md` **[Recommendation]**

Structure only. **Not created** — see workstream F of the plan.

It should record *decisions*, not observations. The matrix in §3 is the
observation and will be stale within weeks.

- **Header** — how to use it, and the rule that a capability without an owner is
  a bug in the document, not the code
- **Platform model glossary** — the six classifications, defined once
- **One section per capability** — web responsibility · mobile responsibility ·
  platform model · backend owner (which RPC/Edge Function is canonical) · design
  reference · **intentional differences, with the reason** · future alignment
  requirements · last reviewed
- **High-risk divergence register** — anything where the same action produces
  different backend behaviour, carried until closed
- **Decisions log** — dated, so a future reader can tell a deliberate choice from
  an accident of history

### On method

Every Evidence claim comes from reading the repository at `9f23754`: route
inventories, import graphs, RPC and Edge Function call sites, token files, page
sizes. Counts are mechanical. **Runtime behaviour was not traced and no flow was
exercised** — "web has no payment step on this page" is confirmed by absence of
code. Where intent could not be established from the code, the row says *Needs
Decision* rather than guessing. Eight capabilities fall in that bucket, and they
are the most useful output of this audit.
