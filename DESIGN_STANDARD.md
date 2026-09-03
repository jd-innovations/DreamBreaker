# Design Standard

The target for the whole mobile app, **extracted from three screens Nate chose
on 2026-09-03** as the reference for what "right" looks like.

Nothing here was designed. Every value was read out of the code that renders
those screens, and the source is named so any line can be checked.

Measured from:

- `apps/mobile/src/app/(tabs)/index.tsx` — screen chrome (`s`) and the
  community card (`cl`)
- `apps/mobile/src/components/TournamentTrendingCard.tsx` — the tournament card

**The reference is already coherent.** The community card and the tournament
card were built separately and independently arrived at the same radii, the same
padding, the same title, label and meta styles. That is why this is a naming
exercise rather than a redesign.

---

## Type scale

| Role | Value | On screen | Measured from |
| --- | --- | --- | --- |
| `statNumber` | 26 / 900 | "36", "59" | `s.statCellNum` |
| `cardTitle` | 22 / 800, lh 26 | "SUNCOAST CLASSIC SRQ" | `cl.name`, `card.title` |
| `sectionTitle` | 17 / 900 | "Find Games", "Upcoming Tournaments" | `s.sectionTitle` |
| `actionLarge` | 16 / 800 | "Find Courts", the 1–4 pills | `booking/index.tsx` † |
| `body` | 15 / 500 | date, venue, location rows | `cl.metaText`, `card.metaText` |
| `fieldLabel` | 13 / 800 | "Looking For", "Where?", "Date" | `booking/index.tsx` † |
| `action` | 13 / 800 | "Hold My Spot · $5" | `holdBtnLabel`, `viewTournText` |
| `link` | 13 / 700 | "View All", "Customize" | `s.viewAllText` |
| `caption` | 12 / 500 | "Invitations", "Messages" | `s.statCellLabel` |
| `cardLabel` | 11 / 800, ls 0.8 | "TOURNAMENT", "COMMUNITY PLAY" | `cl.typeText`, `card.typeText` |
| `sectionLabel` | 11 / 700, ls 1.2 | "QUICK ACTIONS" | `s.sectionLabelSmall` |

Sizes: **26 · 22 · 17 · 16 · 15 · 13 · 12 · 11**. Weights: **900 · 800 · 700 · 500**.

† **Added 2026-09-03, migrating Book a Court.** The original nine roles came from
browse/card screens, which have no form controls and no full-width buttons.
Applying `action` (13/800, measured from in-card CTAs) to a primary submit
button would have shrunk it by three points. Both values are what that screen
already used — the scale was incomplete, not the screen.

**Control labels** ("Court", "Ball Machine", "Doubles", "Singles") were 14/700.
14 is not in the scale, so they take `body` (15/500) — the nearest value up, so
no control shrinks. The selected one keeps weight 700.

`sectionTitle` at 17/900 is **identical to the existing `typography.sectionTitle`
token**. The note in `theme/typography.ts` claiming that token "no longer
describes the app" is wrong — it describes the reference screens exactly.

## Spacing

| Use | Value |
| --- | --- |
| Screen gutter | 16 |
| Card padding | 16 |
| Tight gap (icon↔label, chips) | 8 |
| Card gap | 12 |
| Above a section | 24 |
| Below a section header | 14 |

## Radius

| Use | Value |
| --- | --- |
| Card | 16 |
| Stats box / inset panel | 12 |
| Pill (chips, badges, status) | 20 |
| **CTA** | **10** |
| Small badge | 6 |
| Icon circle | half the size (48 → 24) |

---

## Decisions (2026-09-03)

**1. CTA radius is 10.** The reference uses 10; `PrimaryButton` uses
`radius.button` = 14, and 19 other screens hardcode 30 (plus 18 spelling it
`999`). Ten wins because it is what the chosen screens use.

*Consequence:* this is the only decision with real visual fallout. Every screen
currently on 30 will change shape. Expect it, and check it per screen.

**2. `11/400` stat labels fold into `caption` (12/500).** The reference uses 11pt
in two legitimately different jobs — `cardLabel` inside a card and
`sectionLabel` for a screen section. The third use, plain 11/400 for stat
labels, is not a distinct role and becomes 12/500.

**3. Meta rows become navy.** `cl.metaText` and `card.metaText` both use
`#000000`. Pure black is off-palette; the reference's one impurity.

**4. CTA radius 10 applies at every width.** Confirmed on device after the Book
a Court migration. A full-bleed button at radius 10 reads squarer than a
card-width button at the same radius, and that was accepted deliberately —
there is **no** separate `ctaWide` role. One CTA shape, all widths.

**5. Scales are stored as px numbers.** `packages/shared/src/tokens.ts` holds
them as plain numbers; web formats to rem at generation (`--radius` emits
`radius.base / 16` + `rem`), React Native consumes them directly. Verified with
`node scripts/gen-tokens.mjs --check`, which passes, so web CSS is unchanged.

**6. Section labels are 13/800, ls 0.8, navy.** Facility detail's treatment
wins over the reference's 11/700/ls1.2 muted ("QUICK ACTIONS"). This is the one
value in the standard that does **not** come from the reference screens; it was
chosen deliberately over the measured one. *Consequence:* when Home is migrated,
"QUICK ACTIONS" grows and turns navy.

**7. `actionLarge` stays 16/800.** Book a Court (already shipped and reviewed)
uses 16; facility detail used 15 for the same job. Sixteen wins, so facility's
five CTA labels grow by a point and nothing already approved moves.

**8. `heroTitle` 26/800 lh30 is a role.** A title over a hero image is not
`statNumber` (26/900) or `cardTitle` (22/800). Added at facility detail's
existing value, so nothing changes there — and tournament and community hero
screens now have something to reuse instead of each inventing one.

**9. Roles are atomic: size AND weight together.** Applying a role means taking
both. The single exception is **state variants** — selected, active, disabled,
pressed — which may override weight, as a selected segment does.

*Why:* roughly twenty styles on facility detail use a scale size with an
off-scale weight (11/700, 12/600, 12/700, 12/800, 13/700, 14/600). If weight
stays free, "consistency" only ever means consistent sizes and the weights stay
as scattered as they are today.

*Consequence:* those styles shift weight, mostly getting lighter. And
`helperText` in `booking/index.tsx` needs correcting — it took `action`'s size
(13) but kept weight 600 where the role is 800. That was an inconsistency
introduced before this rule existed.

**10. Sizes below 11 have no role and stay as they are** until one is proposed
with a measurement. The scale floor is 11. Facility detail has a 9pt type label
and two 10pt status labels; they are left alone rather than forced upward,
because nothing in the reference screens measures them.

**11. Job match is required. Coincidental size/weight equality is not a match.**
`actionLarge` is a button role that happens to be 16/800; a card header is also
16/800 and is not a button. Same numbers, different job, so it is not a match —
propose a role instead.

*Why this exists:* decision 9 ("roles are size and weight") and the map-by-job
rule contradict each other, and on facility detail that gap was resolved three
times by judgement and not consistently — two 11/800 styles were mapped to
`cardLabel` on numbers alone while a third identical one was skipped. Rule 11
settles it in favour of job.

**12. A screen is not done until every style maps to a role or is exempted by a
decision.** No partial migrations. A half-mapped screen looks migrated and is
not, which is worse than either extreme. If a screen cannot be finished, propose
the missing roles and leave the screen alone until they are decided.

---

## Proposed roles — NOT DECIDED

Facility detail has nine styles with no matching role. All values below are
measured from that screen; none is invented. Two ways to close them:

**Option A — five roles, four small visual changes** (recommended)

| Role | Value | Absorbs | Change |
| --- | --- | --- | --- |
| `rowTitle` | 14 / 700 | list row primary (`ic.name`) | none |
| `rowValue` | 14 / 800 | list row value (`ic.price`) | none |
| `titleSm` | 16 / 800 | card header 16/800 (none), venue name 15/800, sheet title 18/900 | venue name +1; sheet title 18/900 → 16/800 |
| `controlLabel` | 13 / 700 | tab labels (`invTabText`) | none |
| `chipValue` | 12 / 800 | chip time 12/800, chip count 11/700, joinable 11/800 | both 11pt values → 12 |

**Option B — admit all nine values as roles.** No visual change anywhere, but
the scale goes from 12 roles to 21, and 14/700, 14/800, 15/800, 16/800, 18/900,
13/700, 12/800, 11/700 and 11/800 all become permanent. That is close to
describing the app rather than standardising it.

**Note against decision 4:** the earlier answer on the 14pt cluster was "map
each by job" rather than "add a 14pt role". Option A partially reverses that by
admitting 14 for list rows specifically. That is deliberate — the cluster
question was about body text and CTA labels, which did map; list row titles and
values were flagged as needing a call at the time.

Until this is decided, facility detail stays on Commit A (radius) only.

---

## Where the tokens live

`packages/shared/src/tokens.ts` — the canonical values for both platforms
(Workstream B3 of `WEB_MOBILE_ALIGNMENT_PLAN.md`). Mobile reads it through the
existing `@shared/*` alias, which resolves in both `tsconfig.json` and
`metro.config.js`.

Import in a mobile screen as:

```ts
import { text, radius as shape, space } from '@shared/tokens';
```

`radius` is aliased because mobile's own `@/theme` also exports a `radius`, with
different values. Until that is reconciled, alias at the import to keep which
one you mean unambiguous.

---

## The rule: nothing is invented

Every value in this document traces to one of two things:

1. **A measurement** from the reference screens, with the source style named.
2. **A dated decision** in the list above.

Nothing else is admissible. In particular:

**Do not map by value. Map by job.** A global substitution of "every 14 becomes
15" would be invention — 14pt appears 441 times across the app doing different
jobs, and only the ones doing the same job as a named role should take that
role. Read what the style is *for*, then pick the role whose job matches.

**When no role matches, stop.** Do not pick the nearest number. Measure what the
screen actually uses, propose it as a new role, and get a decision. This is
exactly how `fieldLabel` and `actionLarge` were added: Book a Court needed form
labels and a full-width button, the original nine roles came from card screens
that have neither, and applying `action` (13/800) to a primary submit button
would have shrunk it by three points. The screen was right and the scale was
incomplete — which is the expected direction.

**But do not escalate what the decisions already answer.** The rules above are
the defaults; apply them and show the result. A new question is warranted only
when a style has no role and no decision covers it. If a default produces
something that looks wrong on device, that is a finding to report after the
fact, not a reason to stop before starting — every migration is one revertible
commit, so the cost of being wrong is a `git revert`, not a redesign.

**Expect form screens to keep finding gaps.** The reference is three
browse/card screens. Forms, settings, empty states, modals and flows will
surface roles those screens do not contain.

---

## Migrating a screen

One screen per commit, so any screen can be reverted alone.

1. **Read the screen's stylesheets.** List every `fontSize` / `fontWeight` /
   `letterSpacing`, every `borderRadius`, and every spacing literal.
2. **Name the job of each one** — is this a section title, a field label, an
   in-card CTA, a caption? The job decides the role, not the current number.
3. **Map to roles.** Where a role matches, use it. Where none does, stop and
   propose (see above).
4. **Import from `@shared/tokens`.** Do not copy values into the screen.
5. **Verify before publishing:**
   - `npx tsc --noEmit -p tsconfig.json` and `npx eslint <file>` in `apps/mobile`
   - `node scripts/gen-tokens.mjs --check` if the shared tokens changed
   - `npx expo-updates fingerprint:generate --platform ios` must still start
     `9e5109d0`, or the OTA reaches no installed build
6. **Publish and look at it.** `node ./scripts/publish-update.js preview
   --message "..." --non-interactive`, then close and reopen the app twice.
   Screenshot before and after.
7. **Record it in the log below.**

## Migration log

| Screen | Commit | Notes |
| --- | --- | --- |
| `app/booking/index.tsx` — Book a Court | `1c0aed1` | First. Five radii 14 → 10. Added `fieldLabel`, `actionLarge`. Control labels 14/700 → `body` 15/500. Confirmed on device. |

## Known outstanding

Counts measured 2026-09-03 across `apps/mobile/src/**/*.tsx`. Occurrences and
files are given separately because they are not the same number and the
distinction changes how big a job each one is.

| Work | Occurrences | Files |
| --- | ---: | ---: |
| `radius.button` (14) → `shape.cta` (10) | 88 | 50 |
| `borderRadius: 30` → `shape.cta` | 19 | 12 |
| `borderRadius: 999` → `shape.cta` | 18 | 10 |
| Screens rendering `<PrimaryButton>` | — | 31 |
| Screens rendering `<SecondaryButton>` | — | 16 |

- **`PrimaryButton` / `SecondaryButton` are the highest-leverage change and the
  riskiest.** Both use `radius.button` (14). They are shared, so editing them
  restyles 31 and 16 screens in one commit. Do it deliberately and on its own,
  never as a side effect of migrating a screen.
- The `30` and `999` spellings are the same intended shape written two ways.
  Together they are 37 occurrences across 22 files, and under decision 1 all
  become 10. This is the largest **visible** change remaining.
- Mobile's `@/theme` still exports its own `radius` and `spacing`, parallel to
  the shared scales. Reconciling them is tracked in `THEMING_PLAN.md`.

---

## What this does NOT cover

Colour. That is the separate light/dark role work in `THEMING_PLAN.md`, and the
two should not be conflated — except that both land in the same shared token
file and both get applied in the same per-screen pass, so each screen is touched
once.

This document supersedes the typography, spacing and radius proposals in
`DESIGN_TOKENS_2.md`. Those were derived from usage counts across the whole app;
these are derived from screens actually chosen as correct, which is the better
source. `DESIGN_TOKENS_2.md`'s colour measurements still stand.
