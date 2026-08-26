# Web ↔ Mobile Alignment — Implementation Plan

Companion to `WEB_MOBILE_ALIGNMENT_AUDIT.md`. Written 2026-08-26.
**Nothing in this plan is implemented yet.**

Rendered version: https://claude.ai/code/artifact/6ecb0225-2f4d-4db0-8285-bb56ad74b4eb

**All four gating decisions were answered 2026-08-26** — recorded in §1. Nothing
in this plan is blocked on a product decision any more; what remains blocked is
blocked by the iOS build quota and by sequencing.

---

## ⏸️ PROGRESS — paused 2026-08-26

**Workstream A complete (bar A3), C3 complete.** Everything committed and pushed
to `feature/expo-mobile-foundation`. Nothing half-finished in the working tree.

| Task | Status | Commit |
| --- | --- | --- |
| A1 · web no longer registers paid entries for free | ✅ done | `c657aef` |
| A2 · web honours `is_discoverable` | ✅ done | `c657aef` |
| A3 · server-side waitlist position | ⏸️ deferred — lands better after B1 | — |
| A4 · deleted `frontend/` and `backend/` | ✅ done (86 files) | `c657aef` |
| A5 · removed dead dependencies | ✅ done | `c657aef` |
| C3 · one vocabulary for state components | ✅ done | `526a6ce` |

**🔴 Two things are waiting on a human, and one is live in production.**

1. **Promote a Vercel preview.** A1's fix is committed but not deployed — the
   priced button that charges nothing is still live until you promote.
2. **Fix the Supabase URL configuration.** Site URL is still
   `http://localhost:3000` and the redirect allowlist is missing
   `https://pickleballapp.app/**`. Password reset and OAuth are shipped and
   broken. Dashboard-only, no redeploy. Add `pickleballapp://**` at the same
   time so mobile keeps working.

**Everything else is parked on the 2026-09-01 iOS build.** B1 is the next real
move and its *timing* matters more than its content — it is the highest-risk
task here and the one most likely to break the EAS builders, so it lands
immediately after that build verifies, never before one you depend on.

**Left on disk deliberately:** `frontend/node_modules`, 599 MB. `git rm` removed
the 86 tracked files; the untracked directory remains and is safe to delete by
hand.

---

## 0. Constraints That Shape the Order

Facts about this project, not general advice. They change what can be sequenced
when.

| Constraint | Effect on this plan |
| --- | --- |
| iOS build quota exhausted until **2026-09-01** | No mobile change is device-verifiable before then. Five items already queue behind that build. Mobile work should be *written* now, verified in one pass. |
| Web ships by manual promote, not push | Every web task needs an explicit promote step. "Merged" is not "live". See `project-vercel-deploy-model`. |
| Supabase Site URL still `localhost:3000` | Password reset and OAuth are shipped but broken. Fix before any auth-adjacent work — it invalidates testing. |
| TODO 1.1 has 8 open items | This is a **second** programme, not a replacement. Running both at full speed stalls both — see §6. |
| No workspace exists | Nowhere to put shared code. **B1 is a hard prerequisite** for all of workstream C. |
| 3 free / 7 paid tournaments in production | Makes payment containment surgical rather than blunt — see A1. |

---

## 1. Decisions — ANSWERED 2026-08-26

All four gates are closed. Recorded here until workstream F moves them into
`WEB_MOBILE_PRODUCT_ALIGNMENT.md`.

### D1 — Does web take tournament payments? → **No, for now**

Web never takes entry fees. Paid registration hands off to mobile; free events
(3 of 10 today) complete on web. Web payments may be built later as a deliberate
project, not as a divergence fix.

**Unblocks A1.**

### D2 — Gold-on-navy, or lime? → **Gold on navy, matching the app**

Web adopts mobile's palette. **Additionally: the token set must carry light *and*
dark from the start** — web already has both, and mobile is expected to gain dark
mode later. This expands B3; see the task for what it now includes.

**Unblocks B3.**

### D3 — Are web's six stubs permanent? → **Yes, except `marketplace/[id]`**

Five stay handoffs. `marketplace/[id]` becomes a real web surface, because a
listing is the one link a seller pastes somewhere the recipient may not have the
app. **Adds task D1 in workstream D.**

### D4 — Does web get feature flags? → **A shared flag map, not a vendor service**

A minimal mirror of mobile's `FEATURE_VISIBILITY` in `packages/shared`, imported
by both apps. No hosted flag provider.

**Consequence worth knowing:** mobile flags are compiled into the binary, so
changing one still requires an EAS build. That is accepted. If it becomes
painful, a remote provider can back the same interface later without touching
call sites — B4 should be written with that in mind.

**Unblocks B4.**

---

## 2. Workstream A · Containment

Small, independent, all now unblocked. Every task reduces active harm or removes
noise. **Start here.**

### A1 — Stop web registering paid entries for free ✅ `c657aef`
`Web` · `P0` · `S` · **Gate: D1 — ANSWERED (no web payments)**

Gate `completeRegistration` on the entry fee. Where a fee is owed, replace the
priced button with a handoff to mobile; where the event is free, keep today's
behaviour, which is correct.

- **Files:** `web/src/app/tournaments/[id]/page.tsx`
- **Verify:** paid event offers no completion path; free event completes and
  writes `entry_fee_paid_cents: 0` truthfully
- **Ship:** promote
- **Risk:** low — narrows an action, removes none

### A2 — Honour `is_discoverable` on web ✅ `c657aef`
`Web` · `P0` · `XS` · **Gate: none**

Add the filter mobile already applies. A user who opted out of discovery is
currently still listed to other users on web.

- **Files:** `web/src/app/matchmaking/page.tsx`
- **Verify:** set a profile non-discoverable; confirm absent from web matchmaking
- **Ship:** promote
- **Risk:** very low

### A3 — Move waitlist position server-side ⏸️ DEFERRED
`Web` · `P2` · `M` · **Deferred to after B1**

Web computes `max(position) + 1` in the browser then inserts. Two concurrent
joiners race. Wrap in an RPC both platforms can call.

- **Files:** new migration + `web/src/app/tournaments/[id]/page.tsx`
- **Verify:** two simultaneous joins produce distinct positions
- **Ship:** migration + promote
- **Risk:** medium — touches registration writes

### A4 — Delete `frontend/` and `backend/` ✅ `c657aef`
`Repo` · `S` · **Done — verified unreferenced by CI and both apps**

A predecessor CRA app and a Python server, last touched in June, still carrying
`node_modules`.

- **Verify:** both app builds pass; no CI reference
- **Ship:** commit only
- **Risk:** low — recoverable from git

### A5 — Remove dead dependencies ✅ `c657aef`
`Web` · `S` · **Done**

`@tanstack/react-query` has zero call sites. **So does `lucide-react`** — the
plan expected an icon-library consolidation and there was nothing to
consolidate, since Phosphor (37 files) was already the only one in use. Both
removed; lockfile updated with `--package-lock-only`.

- **Verify:** `next build` clean; no visual diff
- **Ship:** promote
- **Risk:** low

---

## 3. Workstream B · Foundations

Creates the place where shared things can live. **Nothing in workstream C is
possible without B1.**

### B1 — Introduce a workspace and `packages/shared`
`Repo` · **Prerequisite** · `M` · **Gate: none**

A root `package.json` with workspaces, and one package both apps depend on.
Start it empty — its first contents are B2 and C1.

- **Verify:** both apps build from a clean install; **EAS builders still resolve**
- **Ship:** commit; validated by the next iOS build
- **Risk: medium-high.** Metro and EAS are sensitive to workspace layout, and the
  lockfile has broken builds here before. **Do this immediately after a
  successful build, never immediately before one you need.** See
  `project-eas-npm-lockfile`.

### B2 — One generated `database.types.ts`
`Both` · `P1` · `S` · **Gate: B1**

267 KB duplicated by copy. Generate once into the shared package; both apps
import it.

- **Verify:** both `tsc` runs clean; regeneration updates one path
- **Risk:** low once B1 lands. Watch the UTF-16 encoding trap on Windows — see
  `project-gen-types-utf16`.

### B3 — Extract foundation tokens, light and dark
`Both` · `P1` · **`L` (was `M`)** · **Gate: D2 — ANSWERED**

Colour, semantic colour, type scale, spacing, radius as plain data. Web's
Tailwind theme reads it; mobile's `theme/` re-exports it. Adopt mobile's existing
scales rather than authoring new ones.

**D2 expanded this task.** The token set must define light *and* dark from the
outset, because web already ships three theme states (`next-themes`: light, dark,
system) and mobile is expected to gain dark mode. Extracting a light-only token
set now would mean extracting it twice.

The hard part is not the extraction — it is that **mobile's palette cannot be
naively inverted.** In the light theme, navy `#0A1228` is the *ink*. In a dark
theme it becomes a *surface*. The roles swap, so a mechanical inversion produces
navy text on a navy ground.

There is a real head start: mobile already carries a dark surface family built
for the player credential card, and it is internally consistent —

| Token | Value | Dark-theme role |
| --- | --- | --- |
| `playerDarkBg` | `#050A18` | page ground |
| `playerCardBg` | `#0A1228` | surface |
| `playerCardElevated` | `#101A34` | raised surface |
| `playerCardBorder` | `rgba(201,168,76,.24)` | hairline |
| `playerText` | `#FFFFFF` | ink |
| `playerTextSub` | `#B9C4DA` | muted ink |

Gold `#C9A84C` reads acceptably on both grounds, which is why this palette
survives the swap at all. Promote these from "player credential card" tokens to
the app's dark theme rather than designing a second dark palette.

- **Verify:** rendered colours unchanged except the deliberate brand change;
  both themes legible on both platforms; contrast checked, not assumed
- **Ship:** promote + next build
- **Risk:** medium — visually broad. Larger than originally scoped because of
  the dark-theme requirement, but cheaper than doing it twice.

### B4 — Minimal feature flags on web
`Web` · `S` · **Gate: D4 — ANSWERED (shared map, no vendor)**

Mirror mobile's `FEATURE_VISIBILITY` in `packages/shared` so web can stage work
and so aligning against a hidden mobile feature has a defined answer. Write the
lookup behind a single accessor so a remote provider could back it later without
touching call sites.

- **Verify:** a flagged-off route is unreachable by direct URL, not merely
  unlinked
- **Risk:** low

---

## 4. Workstream C · Shared Contracts

Correctness before pixels. These are the places where two implementations
disagreeing produces a *wrong answer* rather than an ugly one.

### C1 — Shared money formatting
`Both` · `P1` · `S` · **Gate: B1**

Cents → display string, in one function. Every price on both platforms routes
through it.

- **Verify:** unit tests for zero, null, sub-dollar, large values
- **Risk:** low, high value — money formatted two ways generates support tickets

### C2 — Shared status vocabulary
`Both` · `P1` · `S` · **Gate: B1, B3**

One mapping from `registration_status`, `tournament_status` and
`reservation_status` to a label and a semantic colour. Renderers stay
per-platform.

- **Verify:** every status has exactly one label and colour across both apps
- **Risk:** low

### C3 — Align the state-component contracts ✅ `526a6ce`
`Both` · `S` · **Done**

Mobile's `ScreenState.tsx` and web's `route-error.tsx` were written days apart
for the same purpose and had already picked different names for the same things.
Web aligned onto mobile's vocabulary (`description` → `message`, `retry` →
`onRetry`, `retryLabel` added), across nine `error.tsx` call sites. Both files
now carry the empty-versus-error rule and point at each other.

**Not done, deliberately:** web still has no `EmptyState`/`LoadingState`
component and 43 inline empty/error states across 14 files. Extracting them is
6.3's deferred tail rather than alignment work, and building them before B3
means styling against the current palette and restyling after. They belong in
workstream D.

- **Verify:** prop names match; the rule is stated in both files
- **Risk:** very low. Cheapest today it will ever be.

---

## 5. Workstreams D–F · After the Gates

Deliberately less specified. Specifying these before the gates are answered
would be guessing, and the audit's most useful output was identifying exactly
which guesses to avoid.

### D — Consumer alignment · *Mobile is reference*

Tournaments, profile, dashboard re-expressed in the shared token language, using
the mobile→web pattern mapping from audit §7: stacked cards become responsive
grids, bottom sheets become side panels, tab bars become persistent navigation.
Web keeps higher density and gains hover and focus states; it does not become a
stretched phone.

**Gates answered.** Sequence: dashboard → tournaments list → tournament detail →
profile. Do the dashboard first — its information model differs most, so it
forces the hard questions early rather than late.

**D1 (task) — make `marketplace/[id]` a real web surface.** Per decision D3, this
is the one stub that becomes a page: listing detail, photos, price, seller, and
whatever the share flow needs. It is a read surface — creating and editing
listings stay on mobile. Sensible to do early: it is self-contained, it is the
smallest possible test of the shared token system on a real page, and it does not
touch tournaments.

### E — Operations boundary · *Web is reference*

Confirm web as configuration and mobile as courtside, then write down exactly
which operations mobile may perform during an event: check-in, score entry, live
status, small corrections. Everything else — divisions, seeding, bracket
generation, refunds — stays web.

**Gated on the ownership decisions in audit §3.** Eight capabilities are
unassigned; five are operational.

### F — Governance

Create `WEB_MOBILE_PRODUCT_ALIGNMENT.md` to the structure proposed in audit §12,
and record the four gate decisions in it as dated entries.

**Do this as soon as the gates are answered, not at the end.** Most of what the
audit found is indistinguishable from a decision nobody wrote down; finishing
this programme without a governance document guarantees a third audit in six
months.

---

## 6. Running This Alongside TODO 1.1

TODO 1.1 still has eight open items and is the programme gating a beta release.
This work does not replace it, and running both at full speed will stall both.

**Until the Sep 1 build:** ~~workstream A~~ — **done 2026-08-26**, along with C3.
What is left before that build is not engineering: promote the web changes, and
fix the Supabase URL configuration.

**Immediately after the Sep 1 build verifies:** B1, while there is maximum
distance to the next build you depend on. It is the highest-risk task here and
the one most likely to break the EAS builders.

**Then:** alternate — one TODO 1.1 item, one alignment workstream. TODO 1.1
keeps beta on track; alignment stops the divergence widening while it does.

| Order | Work | Gate | Needs build | Needs promote |
| --- | --- | --- | --- | --- |
| ~~1~~ | ~~A2, A4, A5, C3~~ ✅ done 2026-08-26 | — | No | **Promote pending** |
| ~~2~~ | ~~A1~~ ✅ done 2026-08-26 | — | No | **Promote pending** |
| **3** | **Fix the Supabase URL config** — outstanding | — | No | No |
| 4 | Sep 1 build — verify the five queued items | — | **Yes** | No |
| 5 | B1 → B2 → C1, C2 | B1 | Yes, to confirm | Yes |
| 6 | B3, B4 | — | Yes | Yes |
| 7 | F — governance doc | — | No | No |
| 8 | D, E | E needs ownership calls | Yes | Yes |

### The one thing not to do

**Do not start workstream D before B3 lands.** It is the largest body of work
here and it touches the highest-traffic pages. Its gates are answered, but every
page in it consumes the shared tokens — building it against the current
per-platform palettes means building it twice.

The one exception is the `marketplace/[id]` task, which is self-contained and is
a good first real-page test of the token system once B3 exists.
