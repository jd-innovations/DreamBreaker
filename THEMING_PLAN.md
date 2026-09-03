# Theming Plan — light / dark / system

Status: **draft. Nothing decided.** Six decisions at the bottom are yours; the
role table below is a proposal derived from measurement, not an invention.

Companion to [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md) (the v1 system, still the
source of truth) and [`DESIGN_TOKENS_2.md`](DESIGN_TOKENS_2.md) (the token-scale
audit of 2026-09-01). Scope is **mobile only** — `apps/mobile`. The web app has
its own system and is out of scope.

---

## The premise

`DESIGN_TOKENS_2.md` triaged the token work by how visible it was, and
deprioritised the "invisible" half — whether a screen writes `spacing.md` or the
literal `12` produces identical pixels.

**Adding dark mode inverts that triage.** Every hardcoded colour becomes a
visible bug the moment the theme flips. The consistency project and the theming
project are therefore the same project, and doing them separately means doing
the screens twice.

This document supersedes the sequencing in `DESIGN_TOKENS_2.md`. Its
measurements still stand; its ordering does not.

---

## What exists today (measured 2026-09-02, `apps/mobile/src`)

| Fact | Count |
| --- | ---: |
| `.tsx` files | 233 |
| Files declaring `StyleSheet.create` at module scope | 216 |
| Files declaring a local `const L = {…}` | 113 |
| Raw 6-digit hex literals | 744 across 120 files |
| Hardcoded `StatusBar style=` | 175 (155 dark, 20 light) |
| Files consuming `useColorScheme` | **0** |

### The blocker is structural, not cosmetic

216 of 233 files build their styles at **module scope**, so those objects are
frozen at import time. No re-render can update them. The same is true of the 113
`const L` objects. This — not the palette — is what makes theming a migration
rather than a swap.

### Three conflicts already live

1. **[`app.config.js`](apps/mobile/app.config.js) sets `userInterfaceStyle: 'dark'`**
   while the UI is light. The OS is being told the wrong thing today.
2. **[`src/constants/Colors.ts`](apps/mobile/src/constants/Colors.ts) is a
   complete dark palette** (`C`: bg `#07091A`, text `#F0F4FF`) left over from
   when the app was dark. Only `_layout.tsx` still imports it. It is a third
   colour system sitting in the tree — and, usefully, a record of dark values
   someone already chose.
3. **Onboarding runs its own sub-theme.** `#F8F5EF` warm cream (12 uses) with
   `#E7DED0` borders, against the rest of the app's cool `#F3F6FC`. Visible
   today, independent of dark mode.

---

## The five rules

1. **No raw hex in a screen.** Enforced by lint (Phase 4). This is what stops
   regression.
2. **Colours are referenced by semantic role, not by value name.** `navy`,
   `gold`, `page` name *values*; "navy" as a background is meaningless in dark
   mode. Roles name *jobs*.
3. **Colour-bearing styles are created at render time** via `useThemedStyles`.
   Layout, spacing and radius styles stay at module scope — this carve-out is
   what keeps the migration bounded to the ~120 colour-carrying files instead of
   all 216.
4. **System chrome derives from the theme** — StatusBar, nav bar, map style. No
   hardcoded `StatusBar style=`.
5. **A new colour ships with both light and dark values, or it does not ship.**

---

## Proposed role vocabulary

Provenance: **v1** = current `theme/colors.ts`; **C** = the old dark palette in
`constants/Colors.ts`; **measured** = taken from raw literal counts;
**proposed** = my suggestion, no prior art in the repo.

### Surfaces

| Role | Light | Dark | Provenance |
| --- | --- | --- | --- |
| `background` | `#F3F6FC` | `#07091A` | v1 `page` / C `bg` |
| `surface` | `#FFFFFF` | `#0F1628` | v1 `bg` / C `bgCard` |
| `surfaceElevated` | `#F0F4FA` | `#131D35` | measured / C `bgCardAlt` |

### Lines

| Role | Light | Dark | Provenance |
| --- | --- | --- | --- |
| `border` | `#E0E8F5` | `#1C2B4A` | v1 / C |
| `borderSubtle` | `#F0F4FA` | `#152039` | measured / C |

### Text

| Role | Light | Dark | Provenance |
| --- | --- | --- | --- |
| `textPrimary` | `#0A1228` | `#F0F4FF` | v1 `text` / C `text` |
| `textSecondary` | `#8A9DC0` | `#7A92C4` | v1 `textSub` / C `textSub` |
| `textMuted` | `#9AAABF` | `#3D506E` | measured / C `textMuted` |
| `textInverse` | `#FFFFFF` | `#0A1228` | proposed |

v1's `textMuted` is currently an alias of `textSub`. The measured literals
(`#9AAABF`, `#7C8494`, `#7F8AA3`) show a real third tier the token set never had.

### Action

| Role | Light | Dark | Provenance |
| --- | --- | --- | --- |
| `primary` | `#0A1228` | `#EAC96A` | v1 `navy` / decision 1 |
| `onPrimary` | `#FFFFFF` | `#0A1228` | decision 1 |
| `accent` | `#C9A84C` | `#EAC96A` | v1 `gold` / C `goldBright` |
| `onAccent` | `#0A1228` | `#0A1228` | proposed |
| `accentBg` | `rgba(201,168,76,0.12)` | `rgba(201,168,76,0.18)` | v1 / C `goldBgStrong` |
| `accentBorder` | `rgba(201,168,76,0.35)` | `rgba(201,168,76,0.35)` | v1 |

`accent`'s dark value is not invented — the old dark theme already brightened
gold to `#EAC96A`, because `#C9A84C` loses contrast on a dark ground.

### Status

| Role | Light | Dark | Provenance |
| --- | --- | --- | --- |
| `success` | `#22C55E` | `#34D399` | v1 / C |
| `successBg` | `#F0FDF4` | `rgba(52,211,153,0.12)` | v1 / C |
| `danger` | `#EF4444` | `#EF4444` | v1 / C (identical) |
| `dangerBg` | `#FEF2F2` | `rgba(239,68,68,0.12)` | v1 / C |
| `warning` | `#CA8A04` | `#F59E0B` | measured / C |
| `warningBg` | `#FEF9E7` | `rgba(245,158,11,0.12)` | proposed / C |

**v1 has no warning role at all.** `#CA8A04` appears 6 times; the old dark theme
had one. This is a genuine gap the measurement found.

### Overlays

| Role | Light | Dark | Provenance |
| --- | --- | --- | --- |
| `overlay` | `rgba(10,18,40,0.45)` | `rgba(7,9,26,0.85)` | measured / C `overlay` |
| `scrimMedia` | `rgba(0,0,0,0.45)` | `rgba(0,0,0,0.45)` | measured (does not flip) |

---

## What deliberately does NOT theme

Two categories need an explicit escape hatch. Without one, people will
reintroduce raw hex to get around the lint rule.

**1. Fixed surfaces.** The player credential card
(`components/stats/PlayerCredentialCard.tsx`) is intentionally dark in a light
app — it is a credential, not a page. Its `colors.player*` family (11 tokens)
keeps fixed values in both themes. Any future component with a deliberate fixed
appearance joins this category by name.

**2. The identity palette.** `AVATAR_COLORS` in `(tabs)/chat.tsx` — `#4A8C6F`,
`#3A6B9A`, `#1A3A5C`, `#B07A5A`, `#2A7A4B`, `#C9A84C` — is categorical data
colour, assigned per user, not a semantic role. It moves to a named
`avatarPalette` export. It may still need a dark variant for contrast
(decision 5).

---

## Open decisions

These cannot be settled by measurement. Guessing at them is how `typography.ts`
ended up carrying a comment explaining why it could not be fixed.

1. ~~**`primary` in dark mode.**~~ **DECIDED 2026-09-02: gold CTA.** In dark,
   `primary` = `#EAC96A` and `onPrimary` = `#0A1228`. Navy `#0A1228` was
   rejected because it is nearly invisible on a `#07091A` ground (~1.6:1);
   a light surface button (`#F0F4FF`) was rejected as reading unbranded.

   **Consequence to carry into Phase 2:** gold now does double duty as both
   `accent` and `primary` in dark. Anywhere a gold-tinted highlight
   (`accentBg` / `accentBorder`) sits near a gold CTA, the two will compete —
   the Home quick-action tiles and the tournament card are the likely first
   offenders. The fix is a Phase 2 finding, not a new blocking decision:
   either accent highlights lose their gold in dark, or the CTA gets a
   distinguishing weight. Do not resolve it on paper; look at the screen.

2. **The blues.** `#007AFF` (35 uses, iOS system blue) and `#2563EB` (21 uses,
   Tailwind blue-600) are the two most common off-palette colours, in an app
   whose brand is navy and gold. Do they become `primary`, a sanctioned `info`
   role, or get eliminated? Raised in `DESIGN_TOKENS_2.md`, still open.

3. **Onboarding's warm sub-theme.** `#F8F5EF` / `#E7DED0` across ~12 onboarding
   screens. Either it is a sanctioned alternate surface family with dark values
   of its own, or onboarding folds into `background`/`surface`. Visible today,
   worth settling regardless of dark mode.

4. **The fourth text tier.** `#39415A` appears only in onboarding body copy.
   Fold into `textSecondary`, or is it a real role?

5. **Avatar palette in dark.** Do the six identity colours keep fixed values, or
   get a brightened dark set? Fixed is simpler; brightened reads better.

6. **Theme preference storage.** `light` / `dark` / `system`, persisted per
   device or per account? The app already has `localPrefs` (per-device,
   per-account — see `useQuickActionsOrder`), which is the obvious home.

Decision 1 is settled, so **Phase 1 is unblocked**. Decisions 2-5 block Phase 3
but not Phase 2. Decision 6 is needed during Phase 1.

---

## Phases

**Phase 0 — decide.** Answer the six above. No code.

**Phase 1 — infrastructure.** `ThemeProvider`, `useTheme`, `useThemedStyles`;
preference persisted; `app.config.js` → `userInterfaceStyle: 'automatic'`;
delete `constants/Colors.ts` once its values are absorbed into the dark ramp.
Touches no screen.

**Phase 2 — prove it on one screen, end to end.** Both themes, verified by eye,
before a second screen is touched. If the pattern is wrong, the cost is one
screen rather than fifty. Suggested subject: a mid-complexity screen with cards,
chips and a CTA.

**Phase 3 — migrate flow by flow.** Each flow verified visually in both themes.
Migrating a screen to roles *is* the consistency fix for that screen: the
duplicate greens, the stray blues and the two CTA shapes all have to resolve to a
named role to survive. There is no separate consistency pass.

**Phase 4 — lock it.** Lint rule banning raw hex in `src/app` and
`src/components`. Then rebuild `design-lab.tsx` as a live two-theme reference —
it has not been touched since 2026-08-20 and 306 commits have landed since, so it
is currently a snapshot of the app's first ten days, not a spec.

---

## Verification

Per screen, in both themes: no unreadable text, no invisible borders, no surface
that matches the page ground, CTAs still legible, StatusBar contrast correct.
Grep-based checks only in Phase 4, and only to catch regressions — never as the
acceptance test for a screen.
