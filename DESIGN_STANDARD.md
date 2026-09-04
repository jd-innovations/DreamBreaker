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

<!-- BEGIN GENERATED: type-scale — edit packages/shared/src/tokens.ts, then run scripts/gen-design-standard.mjs -->

20 roles, generated from `packages/shared/src/tokens.ts`.

| Role | Value |
| --- | --- |
| `pageTitle` | 28 / 900 |
| `heroTitle` | 26 / 800, lh 30 |
| `statNumber` | 26 / 900 |
| `cardTitle` | 22 / 800, lh 26 |
| `modalTitle` | 20 / 900 |
| `statValueSm` | 20 / 900 |
| `sectionTitle` | 17 / 900 |
| `actionLarge` | 16 / 800 |
| `titleSm` | 17 / 800 |
| `body` | 15 / 500 |
| `rowTitle` | 14 / 700 |
| `rowValue` | 14 / 800 |
| `fieldLabel` | 13 / 800 |
| `action` | 13 / 800 |
| `link` | 13 / 700 |
| `controlLabel` | 13 / 700 |
| `sectionLabel` | 13 / 800, ls 0.8, uppercase |
| `chipValue` | 12 / 800 |
| `caption` | 12 / 500 |
| `cardLabel` | 11 / 800, ls 0.8, uppercase |

Sizes: **28 · 26 · 22 · 20 · 17 · 16 · 15 · 14 · 13 · 12 · 11**. Weights: **900 · 800 · 700 · 500**.

<!-- END GENERATED: type-scale -->

Where each role came from is in the decisions below and in each role's comment
in `tokens.ts`. The first nine were measured from the reference screens;
`fieldLabel` and `actionLarge` were added migrating Book a Court, and the last
five under option A migrating facility detail.

**Two roles sit at 13/700 and must not be confused.** `link` is a text link
("View All", "Customize"). `controlLabel` is a label on a control (a tab, a
filter chip). Rule 11: same numbers, different jobs, so they are separate roles
and neither substitutes for the other.

**Every two-up toggle takes `controlLabel`**, whether it is called a segment, a
tab or a filter. Book a Court's "Court / Ball Machine" and "Doubles / Singles",
Choose Time's and facility detail's "Courts / Ball Machines" — all 13/700, with
the selected one at 800 as a state variant.

*This was wrong once and is worth remembering.* Book a Court was migrated first,
before `controlLabel` existed. Its segments were 14/700, 14 was not in the scale,
and they took `body` 15/500 as the nearest value up. Two screens later
`controlLabel` (13/700) arrived and the later screens took it — so the same
toggle rendered three points and two weights apart within one flow. Worse, the
first version of this note wrote that divergence down as though it were a
deliberate distinction between "selectors" and "tabs". It was not; it was
migration order, and codifying an accident as a decision is how a standard stops
being one. Fixed 2026-09-03.

**The general lesson:** a screen migrated before a role existed can be left
holding a worse match than a screen migrated after. When a role is added,
check whether earlier screens should take it.

`sectionTitle` at 17/900 is **identical to the existing `typography.sectionTitle`
token**. The note in `theme/typography.ts` claiming that token "no longer
describes the app" is wrong — it describes the reference screens exactly.

## Spacing and radius

<!-- BEGIN GENERATED: scales — edit packages/shared/src/tokens.ts, then run scripts/gen-design-standard.mjs -->

**Radius**

| Role | px |
| --- | ---: |
| `badge` | 6 |
| `cta` | 10 |
| `panel` | 12 |
| `card` | 16 |
| `pill` | 20 |
| `base` | 12 |

**Spacing**

| Role | px |
| --- | ---: |
| `gapTight` | 8 |
| `gap` | 12 |
| `sectionBottom` | 14 |
| `gutter` | 16 |
| `sectionTop` | 24 |

Icon circles are half their own size and take no role.

<!-- END GENERATED: scales -->

The spacing roles map to the reference as: screen gutter and card padding
`gutter`; icon↔label and chip gaps `gapTight`; card gap `gap`; above a section
`sectionTop`; below a section header `sectionBottom`.

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

*One deliberate exception, recorded rather than hidden (2026-09-03):*
`(tabs)/index.tsx` — Home — has **only its `sectionLabelSmall` migrated**. Home
is the screen the standard was measured from, and decision 6 is the single
place the standard overrides it, so that one label was changed on its own to
make the consequence visible before committing the whole screen. The file
carries a note at its import saying so. Home is **not** migrated; it still has
31 unmapped text styles and 23 radii, and finishing it is a separate job. An
exception that is written down is a decision; an exception that is not is the
half-migrated screen rule 12 exists to prevent.

**13. Three title/value roles added for `(tabs)`.** `pageTitle` 28/900,
`modalTitle` 20/900, `statValueSm` 20/900.

*Why:* the audit of `(tabs)` found **seven treatments for "the title at the top
of a screen"** — 28, 26, 24, 22, 20, 18 across the tab roots, plus 17 on the
nine migrated booking screens. There is one legitimate distinction inside that
range: a pushed screen has a small centred title beside a back button
(`sectionTitle` 17/900), and a tab root has a large left-aligned one
(`pageTitle` 28/900). Two jobs, not seven values.

`modalTitle` and `statValueSm` share 20/900 and stay separate under rule 11.

*Consequence, and it is the migration-order trap again:* facility detail's
sheet title already took `titleSm` 16/800 because `modalTitle` did not exist.
It moves to `modalTitle` in the same commit that adds these roles, rather than
being left behind the way Book a Court's toggle was.

*Not mapped:* `finder`'s "PASS" / "CONNECT" swipe overlays are also 28/900 but
with ls 2, and a full-screen gesture overlay is not a page title. Rule 11 —
left alone, flagged rather than forced.

**15. `titleSm` is 17/800, not 16/800.** Corrected after measuring the whole
app rather than a sample.

`node scripts/measure-styles.mjs` counted every literal type value in
`apps/mobile/src`: **2,350 values across 198 distinct size/weight
combinations**. In the `title / name` job, **`17/800` has 45 uses — the single
most common title in the app** — against 16 for `16/800`. This role was set to
16 from the three reference screens, before that measurement existed.

*Consequence:* the 16 styles already on `titleSm` grow by one point. In
exchange, the 45 places the app already titles things at 17/800 migrate as a
no-op instead of shrinking.

*Side effect worth having:* `titleSm` and `actionLarge` no longer share 16/800.
They were kept apart by rule 11 alone; now they differ in value too.

*The wider point, which is why this decision exists at all:* the vocabulary was
derived from three screens and then patched five times as each newly migrated
screen exposed a gap. Three screens correctly answer what good looks like. They
cannot answer how many roles an app of 218 files needs, and treating them as if
they could cost a day of rework. The measurement should have come first.
Coverage turned out to be roughly right — about 18 distinct jobs against 20
roles — and this was the one value clearly chosen from too small a sample.

**14. Avatar initials are exempt.** Text drawn to fit an avatar circle is sized
to its container, not from the type scale — the same reasoning that leaves a
36px circle's `borderRadius: 18` alone. Four instances so far: `booking/players`
(13), `booking/game-status` (12), `(tabs)/chat` (18), `(tabs)/profile` (18).

This began as a per-screen note and is written down now because it recurred
four times, which is the point at which a judgement call should become a rule
or be abandoned.

---

## Role additions — DECIDED 2026-09-03 (option A)

Five roles added to close the nine unmapped styles on facility detail. Values
measured from that screen. `titleSm` and `actionLarge` share 16/800
deliberately: rule 11 keeps them separate because a card header is not a button.

| Role | Value | Job |
| --- | --- | --- |
| `titleSm` | 16 / 800 | card headers, sheet titles, venue names |
| `rowTitle` | 14 / 700 | primary label in a list or info row |
| `rowValue` | 14 / 800 | the value a row carries — a price |
| `controlLabel` | 13 / 700 | tabs, filter chips, contact chips |
| `chipValue` | 12 / 800 | a time, count or flag inside a chip |

Option B (admit all nine measured values) was rejected: it changes nothing
visually but takes the scale from 12 roles to 21, which describes the app
rather than standardising it.

The original proposal, kept for the reasoning:

## Proposed roles — superseded by the decision above

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

**Note on the earlier 14pt answer:** the answer given on the 14pt cluster was "map
each by job" rather than "add a 14pt role". Option A partially reverses that by
admitting 14 for list rows specifically. That is deliberate — the cluster
question was about body text and CTA labels, which did map; list row titles and
values were flagged as needing a call at the time.

Facility detail is now fully migrated under option A: 45 styles mapped, 3
exempt below the 11pt floor, none left to interpretation.

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

**0. Check for repeated style names first.**

```
node scripts/migrate-styles.mjs --collisions <file>
```

A style name reused across two `StyleSheet.create` blocks usually means two
different jobs. `stats.tsx` had three styles called `title` — two card
headings at 22/900 and a modal title at 20/900 — and an earlier version of the
migrator mapped all three to `modalTitle`, shrinking the card headings. That
shipped before it was caught. The tool now refuses a bare key for an ambiguous
name; use `sheet.name`.

Then apply the mapping:

```
node scripts/migrate-styles.mjs <file> <mapping.json>
```

```json
{ "type":  { "cardName": "cardTitle", "ab.label": "controlLabel" },
  "shape": { "card": "card", "tab": "cta" },
  "allow": ["10", "9"] }
```

It asserts every mapped key was found and that the only raw sizes left are the
exemptions declared in the mapping — rule 12, enforced rather than remembered.

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

<!-- BEGIN GENERATED: migration-log — edit packages/shared/src/tokens.ts, then run scripts/gen-design-standard.mjs -->

57 files migrated, listed from the tree with the sha of the commit
that last touched each.

| File | Last commit |
| --- | --- |
| `app/(tabs)/_layout.tsx` | `fb47edb` |
| `app/(tabs)/chat.tsx` | `fb47edb` |
| `app/(tabs)/finder.tsx` | `05efd8b` |
| `app/(tabs)/games.tsx` | `34a8eeb` |
| `app/(tabs)/index.tsx` | `2d52fa5` |
| `app/(tabs)/marketplace.tsx` | `fb47edb` |
| `app/(tabs)/nearby.tsx` | `e7927f3` |
| `app/(tabs)/partner.tsx` | `fb47edb` |
| `app/(tabs)/stats.tsx` | `5bc03cb` |
| `app/(tabs)/tournaments.tsx` | `fb47edb` |
| `app/booking/choose-time.tsx` | `22414dd` |
| `app/booking/confirmation.tsx` | `13c2178` |
| `app/booking/game-status.tsx` | `ae4b5b3` |
| `app/booking/index.tsx` | `656488b` |
| `app/booking/my-bookings.tsx` | `96f8293` |
| `app/booking/players.tsx` | `f1c1ebd` |
| `app/booking/results.tsx` | `54ff028` |
| `app/booking/review.tsx` | `abb9086` |
| `app/coach/[id].tsx` | `2638ed9` |
| `app/coach/index.tsx` | `2638ed9` |
| `app/coach/offers/[id]/edit.tsx` | `2638ed9` |
| `app/coach/offers/create.tsx` | `2638ed9` |
| `app/coach/offers/index.tsx` | `2638ed9` |
| `app/coach/redeem.tsx` | `2638ed9` |
| `app/facility/[id].tsx` | `22a4dd3` |
| `app/groups/[id].tsx` | `81d23cd` |
| `app/groups/[id]/chat.tsx` | `81d23cd` |
| `app/groups/[id]/edit.tsx` | `81d23cd` |
| `app/groups/create.tsx` | `81d23cd` |
| `app/lessons/[id].tsx` | `2638ed9` |
| `app/lessons/index.tsx` | `2638ed9` |
| `app/round-robin/[id]/schedule.tsx` | `2c78032` |
| `app/round-robin/[id]/score-entry.tsx` | `2c78032` |
| `app/round-robin/[id]/standings.tsx` | `2c78032` |
| `app/tournament/[id].tsx` | `16871ec` |
| `app/tournament/[id]/add-registration.tsx` | `9564031` |
| `app/tournament/[id]/brackets.tsx` | `9933f30` |
| `app/tournament/[id]/check-in-qr.tsx` | `41b6a99` |
| `app/tournament/[id]/check-in-scan.tsx` | `41b6a99` |
| `app/tournament/[id]/check-in.tsx` | `9933f30` |
| `app/tournament/[id]/command-center.tsx` | `c4cd45b` |
| `app/tournament/[id]/division-bracket.tsx` | `c4cd45b` |
| `app/tournament/[id]/divisions/create.tsx` | `9564031` |
| `app/tournament/[id]/edit.tsx` | `9933f30` |
| `app/tournament/[id]/hold-confirm.tsx` | `41b6a99` |
| `app/tournament/[id]/hold-success.tsx` | `41b6a99` |
| `app/tournament/[id]/player-brackets.tsx` | `67d51bf` |
| `app/tournament/[id]/player-results.tsx` | `67d51bf` |
| `app/tournament/[id]/register.tsx` | `0a7395d` |
| `app/tournament/[id]/registration-success.tsx` | `41b6a99` |
| `app/tournament/[id]/report.tsx` | `9933f30` |
| `app/tournament/[id]/results.tsx` | `0a7395d` |
| `app/tournament/[id]/select-division.tsx` | `9564031` |
| `app/tournament/[id]/workspace.tsx` | `c4cd45b` |
| `components/PrimaryButton.tsx` | `f4469e9` |
| `components/SecondaryButton.tsx` | `f4469e9` |
| `components/StatusChip.tsx` | `b0fd68d` |

<!-- END GENERATED: migration-log -->

**The court booking flow is complete** — 9 screens plus `StatusChip`. 5 styles
remain unmapped across the whole flow, every one of them an explicit exemption:
3 below the 11pt floor (decision 10) and 2 avatar initials sized to their
container.

## Progress

<!-- BEGIN GENERATED: progress — edit packages/shared/src/tokens.ts, then run scripts/gen-design-standard.mjs -->

Measured from the tree when this was generated — 218 `.tsx` files
under `apps/mobile/src` carry a `fontSize` or `borderRadius`.

| | Occurrences | Files |
| --- | ---: | ---: |
| Files importing `@shared/tokens` (migrated) | — | **57 of 218** (26%) |
| Raw `fontSize: N` remaining | 1709 | 185 |
| `borderRadius: radius.*` from `@/theme` remaining | 359 | 87 |
| `borderRadius: 30` → `shape.cta` | 10 | 9 |
| `borderRadius: 999` → `shape.cta` | 16 | 8 |

Raw sizes include the deliberate exemptions (below the 11pt floor, and
avatar initials sized to their container), so the remaining count will not
reach zero.

<!-- END GENERATED: progress -->

- **Shared components are done.** `PrimaryButton`, `SecondaryButton` and
  `StatusChip` are migrated. They were the highest-leverage change: 31, 16 and
  33 screens respectively, restyled from three small commits.
- The `30` and `999` spellings are the same intended shape written two ways.
  Under decision 1 both become 10. This is the largest **visible** change
  remaining.
- Mobile's `@/theme` still exports its own `radius` and `spacing`, parallel to
  the shared scales. Reconciling them is tracked in `THEMING_PLAN.md`.
- `(tabs)` needs roles the scale does not have: page titles (28), modal and
  sheet titles (20), screen titles (18) and one header at 24. The reference
  screens had no page or modal titles, so there is nothing between
  `sectionTitle` 17 and `cardTitle` 22. Propose that set before migrating them.

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
