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
| `body` | 15 / 500 | date, venue, location rows | `cl.metaText`, `card.metaText` |
| `action` | 13 / 800 | "Hold My Spot · $5" | `holdBtnLabel`, `viewTournText` |
| `link` | 13 / 700 | "View All", "Customize" | `s.viewAllText` |
| `caption` | 12 / 500 | "Invitations", "Messages" | `s.statCellLabel` |
| `cardLabel` | 11 / 800, ls 0.8 | "TOURNAMENT", "COMMUNITY PLAY" | `cl.typeText`, `card.typeText` |
| `sectionLabel` | 11 / 700, ls 1.2 | "QUICK ACTIONS" | `s.sectionLabelSmall` |

Sizes: **26 · 22 · 17 · 15 · 13 · 12 · 11**. Weights: **900 · 800 · 700 · 500**.

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

---

## Where the tokens live

`packages/shared/src/tokens.ts` — the canonical values for both platforms
(Workstream B3 of `WEB_MOBILE_ALIGNMENT_PLAN.md`). It already carries `radius`
and `fontStacks`; the type and spacing scales join them there so web inherits
the same system instead of a mobile-only copy being built a second time.

**Open question before the tokens are added:** `radius` in that file is stored
as CSS strings (`"calc(0.75rem - 4px)"`), which React Native cannot consume. The
file's own principle is that the canonical form should match the consumed form
so the generator is a formatter rather than a converter. For numeric scales that
points to storing plain numbers and letting the web side format to rem — but
this changes an existing export and needs deciding, not assuming.

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
