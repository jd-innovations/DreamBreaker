# Web ↔ Mobile Alignment — Implementation Plan

Companion to `WEB_MOBILE_ALIGNMENT_AUDIT.md`. Written 2026-08-26.
**Nothing in this plan is implemented yet.**

Rendered version: https://claude.ai/code/artifact/6ecb0225-2f4d-4db0-8285-bb56ad74b4eb

Four product decisions gate roughly two-thirds of this work. The plan is built so
the ungated third can start immediately and the rest is unambiguous once the
gates are answered.

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

## 1. Decisions Required

Each carries a recommendation with reasoning. **Taking the recommendation
unchanged is a valid answer** — the point is that the choice gets made and
recorded.

### D1 — Does web take tournament payments? 🔴 *Blocks A1, workstream D*

Today it does not, but it presents a priced button and registers the player
anyway. The one finding actively producing bad data.

- **Option A** — Web never takes entry fees. Paid registration hands off to
  mobile; free events complete on web.
- **Option B** — Build Stripe Checkout into web. Full parity, new payment
  surface to secure and reconcile.

> **Recommend Option A.** Mobile's paid path is verified end to end and the
> webhook already finalises it. Option B adds a second money path to a system
> where the first was only proven a few days ago — and 3 of 10 tournaments are
> free, so Option A leaves web fully functional for them.

### D2 — Gold-on-navy, or lime? 🔴 *Blocks B3, workstream D*

Web is `hsl(84 81% 56%)`; mobile is `#C9A84C` on `#0A1228`. No token work can
begin until one wins.

> **Recommend mobile's gold on navy.** Mobile is the consumer product — the
> installed app, five times the surface, and its palette is already a documented
> token system with semantic colours. Web's lime lives in a Tailwind config that
> can be re-pointed in one file. Migrating the smaller, more centralised system
> is cheaper.
>
> **Caveat:** this is an aesthetic and brand call, not a technical one. If lime
> is the brand, say so — the plan is unchanged apart from direction of travel.

### D3 — Are web's six stubs permanent? *Blocks workstream D scope*

`booking/[id]`, `groups/[id]`, `marketplace/[id]`, `coach/offers/[id]`,
`conversation/[id]`, `claim/[token]` currently say "open this in the app".

> **Recommend permanent handoffs, with one exception: `marketplace/[id]`.** A
> listing is the one of the six a seller will paste into a group chat or social
> post, where the recipient may have no app installed. The other five are only
> reached by someone already in the product.

### D4 — Does web get feature flags? *Blocks B4*

Mobile stages unfinished work behind `FEATURE_VISIBILITY`. Web has no
equivalent, so anything half-built there must be deleted or shipped.

> **Recommend yes** — a minimal mirror of mobile's map, not a flag service.
> Without it, aligning web to a mobile feature that is itself flagged off has no
> correct outcome. Four mobile capabilities are hidden today.

---

## 2. Workstream A · Containment

Small, independent, mostly ungated. Every task reduces active harm or removes
noise. **Start here regardless of what the gates decide.**

### A1 — Stop web registering paid entries for free
`Web` · `P0` · `S` · **Gate: D1**

Gate `completeRegistration` on the entry fee. Where a fee is owed, replace the
priced button with a handoff to mobile; where the event is free, keep today's
behaviour, which is correct.

- **Files:** `web/src/app/tournaments/[id]/page.tsx`
- **Verify:** paid event offers no completion path; free event completes and
  writes `entry_fee_paid_cents: 0` truthfully
- **Ship:** promote
- **Risk:** low — narrows an action, removes none

### A2 — Honour `is_discoverable` on web
`Web` · `P0` · `XS` · **Gate: none**

Add the filter mobile already applies. A user who opted out of discovery is
currently still listed to other users on web.

- **Files:** `web/src/app/matchmaking/page.tsx`
- **Verify:** set a profile non-discoverable; confirm absent from web matchmaking
- **Ship:** promote
- **Risk:** very low

### A3 — Move waitlist position server-side
`Web` · `P2` · `M` · **Gate: none, but better after B1**

Web computes `max(position) + 1` in the browser then inserts. Two concurrent
joiners race. Wrap in an RPC both platforms can call.

- **Files:** new migration + `web/src/app/tournaments/[id]/page.tsx`
- **Verify:** two simultaneous joins produce distinct positions
- **Ship:** migration + promote
- **Risk:** medium — touches registration writes

### A4 — Delete `frontend/` and `backend/`
`Repo` · `S` · **Gate: confirm nothing deploys from them**

A predecessor CRA app and a Python server, last touched in June, still carrying
`node_modules`.

- **Verify:** both app builds pass; no CI reference
- **Ship:** commit only
- **Risk:** low — recoverable from git

### A5 — Remove dead dependencies and duplicate icon library
`Web` · `S` · **Gate: none**

`@tanstack/react-query` has zero call sites. Lucide and Phosphor both ship;
Phosphor is dominant.

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

### B3 — Extract foundation tokens
`Both` · `P1` · `M` · **Gate: D2**

Colour, semantic colour, type scale, spacing, radius as plain data. Web's
Tailwind theme reads it; mobile's `theme/` re-exports it. Adopt mobile's
existing scales rather than authoring new ones.

- **Verify:** rendered colours unchanged except the deliberate brand change
- **Ship:** promote + next build
- **Risk:** medium — visually broad, mechanically simple

### B4 — Minimal feature flags on web
`Web` · `S` · **Gate: D4**

Mirror mobile's visibility map so web can stage work.

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

### C3 — Align the state-component contracts
`Both` · `S` · **Gate: none — do this before B1 if B1 slips**

Mobile's `ScreenState.tsx` and web's `route-error.tsx` were written days apart
for the same purpose. Agree prop names and the empty-versus-error rule now,
while both are new.

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

**Gated on D2 and D3.** Sequence: dashboard → tournaments list → tournament
detail → profile. Do the dashboard first — its information model differs most,
so it forces the hard questions early rather than late.

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

**Until the Sep 1 build:** workstream A only, plus answering the four gates. A is
small and mostly web-only, needing no build. The gates need thinking time, not
engineering time — which is exactly what a build blackout is good for.

**Immediately after the Sep 1 build verifies:** B1, while there is maximum
distance to the next build you depend on. It is the highest-risk task here and
the one most likely to break the EAS builders.

**Then:** alternate — one TODO 1.1 item, one alignment workstream. TODO 1.1
keeps beta on track; alignment stops the divergence widening while it does.

| Order | Work | Gate | Needs build | Needs promote |
| --- | --- | --- | --- | --- |
| 1 | Fix the Supabase URL config | — | No | No |
| 2 | A2, A4, A5, C3 | None | No | Yes |
| 3 | Answer D1–D4 | — | No | No |
| 4 | A1 | D1 | No | Yes |
| 5 | Sep 1 build — verify the five queued items | — | **Yes** | No |
| 6 | B1 → B2 → C1, C2 | B1 | Yes, to confirm | Yes |
| 7 | B3, B4 | D2, D4 | Yes | Yes |
| 8 | F — governance doc | D1–D4 | No | No |
| 9 | D, E | All | Yes | Yes |

### The one thing not to do

**Do not start workstream D — the visible, satisfying part — before the gates are
answered.** It is the largest body of work here, it touches the highest-traffic
pages, and every line depends on D2 and D3. Building it first means building it
twice.
