# Design Tokens 2 — a proposal

> **Superseded in part (2026-09-03).** The typography, spacing and radius
> proposals below are replaced by [`DESIGN_STANDARD.md`](DESIGN_STANDARD.md),
> which derives the scale from three screens chosen as correct rather than from
> usage counts. The colour measurements here still stand.

Status: **draft, nothing decided.** Two questions at the bottom are yours to
answer before any migration starts.

Companion to [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md), which stays the source of
truth until this is accepted. Source of the tokens themselves is still
[`apps/mobile/src/theme/`](apps/mobile/src/theme/).

---

## Why this document exists

The v1 rule is *"no screen should declare its own local color/spacing/radius
object."* Measured against the tree on 2026-09-01: **113 of 228 mobile `.tsx`
files declare a local `const L = {…}`.** The rule is the exception, not the norm.

The instinct is to read that as 113 screens misbehaving. The measurements say
otherwise — **the token set describes roughly a third of the app**, and screens
hand-roll the rest because there is nothing to reach for.

So this is not a cleanup. It is a question of which is wrong, the app or the
scale, and the answer differs by category.

---

## What was measured

All 228 `.tsx` files under `apps/mobile/src`, counting raw literal values.

### Typography — the scale does not fit

| Size | Uses | Token? |
| ---: | ---: | --- |
| 13 | 450 | — |
| 14 | 441 | — |
| 12 | 435 | `metadata` |
| 11 | 293 | — |
| 15 | 292 | `body` |
| 17 | 137 | `pageTitle` / `sectionTitle` |
| 16 | 127 | `cardTitle` |
| 10 | 100 | — |

The two most-used sizes in the entire app have no token. Four of the top five
values are untokenised.

This is already admitted in `typography.ts`. The comment on `sectionTitle` says
the token "no longer describes the app," that only `design-lab.tsx` consumes
it, and that the real standard is a small uppercase label — 11–13pt, weight
800–900, letterSpacing 0.6–0.8 — across **four competing variants**. That note
has been open since 2026-08-23 and is the single highest-value thing in here to
resolve.

### Radius — mostly healthy, one gap

Top five (20, 14, 12, 10, 16) are all tokens. The real gap is **`30`**, the
app-wide pill CTA shape, which has no token — `radius.chip` is 20 and
`radius.button` is 14. Every rounded submit button in the app hardcodes 30.
`999` appears too, as the same idea spelled differently.

### Spacing — healthy, three off-grid values

Top hits 12, 8, 16, 4, 20 are all tokens. The exceptions are **`10` (520
uses)**, **`14` (399)** and **`6` (340)** — all off the 4pt grid, all far too
common to be accidents.

### Colour — the only category where a violation is reliably a bug

Most-used off-palette values:

| Hex | Uses | What it is |
| --- | ---: | --- |
| `#007AFF` | 24 | iOS system blue |
| `#2563EB` | 15 | Tailwind blue-600 |
| `#6B7280` | 13 | Tailwind gray-500 |
| `#16A34A` | 11 | duplicate of `success` |
| `#DC2626` | 8 | duplicate of `danger` |
| `#000000` | 9 | should be `navy` |
| `#E5E7EB`, `#F3F4F6` | 8 | Tailwind greys |

These are not design decisions. They are framework defaults that leaked in, and
status colours re-invented at slightly different values than the tokens that
already exist. **This is the part worth fixing on its own merits**, regardless
of what happens to the scales.

---

## Proposal

### 1. Make the tokens describe the app, then migrate

Adding what is missing is what turns the violation list from noise into signal.
Most files would go from "many violations" to "a handful" without a single
screen being touched.

Proposed typography additions, taken from the measured vocabulary rather than
invented:

| Token | Value | Replaces |
| --- | --- | --- |
| `label` | 13 / 600 | 450 uses |
| `bodySm` | 14 / 400 | 441 uses |
| `caption` | 11 / 400 | 293 uses |
| `sectionLabel` | 13 / 800 / ls 0.8 / uppercase | the de facto section heading |
| `display` | 22 / 900 | hero prompts (review screen, wallet) |

`sectionLabel` is the one that closes the `sectionTitle` note. Picking it means
choosing among the four surveyed variants and migrating the others.

Proposed radius addition:

| Token | Value | Replaces |
| --- | --- | --- |
| `pill` | 30 | every rounded CTA, plus the `999` spellings |

### 2. Then the colour sweep

Independent of the above and safe to start first: replace the status-colour
duplicates with `success`/`danger`, `#000000` with `navy`, and decide what
`#007AFF` should be — it is currently the only blue in an app whose brand is
navy and gold.

### 3. Only then, the `L` object migration

Most `L` objects are already aliases (`navy: colors.navy, gold: colors.gold`),
so unwinding them is mechanical and low-risk. Do it last, when the tokens can
actually absorb the screens.

---

## Open decisions — needed before any work starts

1. **`10` / `14` / `6` spacing.** Roughly 1,250 uses sit off the 4pt grid. Add
   them as tokens and accept the grid is really 2pt, or migrate them to the
   nearest grid value and accept the visual shift. This cannot be decided by
   measurement; it is a design call.

2. **The canonical small-caps heading.** Four variants are in use (13/800/0.6,
   13/900/0.8, 13/800/0.8, 11/900/0.8). One has to win.

Guessing at either is how `typography.ts` ended up carrying a comment
explaining why it could not be fixed.

---

## Scope note

Everything above is the **mobile** theme. The web app has its own system
(Tailwind semantic classes — `bg-card`, `text-primary`, `font-display`) and is
not governed by these tokens. The review page shipped 2026-09-01 uses the web
system, deliberately, and is outside this audit.
