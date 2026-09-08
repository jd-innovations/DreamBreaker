# Design Tokens

Source of truth: [`apps/mobile/src/theme/`](apps/mobile/src/theme/) (DreamBreakerPB Design System v1).
Import via the barrel: `import { colors, typography, spacing, radius, iconCircle } from '@/theme';`
No screen should declare its own local color/spacing/radius object — use these tokens.

## Colors

| Token | Value | Usage |
|---|---|---|
| `navy` | `#0A1228` | Brand primary |
| `gold` | `#C9A84C` | Brand accent |
| `bg` | `#FFFFFF` | Surface |
| `page` | `#F3F6FC` | Page background |
| `border` | `#E0E8F5` | Dividers / outlines |
| `text` | `#0A1228` | Text primary |
| `textSub` | `#8A9DC0` | Text secondary / metadata |
| `textMuted` | `#8A9DC0` | Alias of `textSub` (kept for migration) |
| `success` | `#22C55E` | Status: positive |
| `danger` | `#EF4444` | Status: negative |
| `goldLight` | `#FDF6E7` | Gold tint (light fill) |
| `goldBg` | `rgba(201,168,76,0.12)` | Gold tint (background wash) |
| `goldBorder` | `rgba(201,168,76,0.35)` | Gold tint (border) |
| `successBg` | `#F0FDF4` | Success tint |
| `dangerBg` | `#FEF2F2` | Danger tint |
| `white` | `#FFFFFF` | Fixed white |

## Typography

| Token | Size / Weight |
|---|---|
| `pageTitle` | 17 / 900 |
| `sectionTitle` | 17 / 900 |
| `cardTitle` | 16 / 700 |
| `body` | 15 / 400 |
| `metadata` | 12 / 400 |

## Spacing

4pt base scale.

| Token | Value (px) |
|---|---|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 20 |
| `xxl` | 24 |
| `xxxl` | 32 |
| `screenH` | 16 (horizontal screen padding) |
| `screenV` | 12 (vertical header padding) |

## Radius

| Token | Value (px) | Usage |
|---|---|---|
| `sm` | 10 | |
| `md` | 12 | |
| `button` | 14 | Primary / secondary buttons |
| `card` | 16 | Standard card |
| `chip` | 20 | Pills / status chips |

## Icon circle

| Token | Value (px) |
|---|---|
| `iconCircle.standard` | 40 |
| `iconCircle.small` | 34 |

## Semantic icons

Ionicons names reserved for a specific meaning. Use the reserved icon for its
concept everywhere; don't substitute a look-alike.

| Concept | Icon | Notes |
|---|---|---|
| Rating / skill level | `speedometer-outline` | **Any** rating paired with an icon uses this — event skill range (`skillLabel(min, max)`), player DUPR/Self rating (partner finder), skill level on cards + detail. Never use a star or trophy for a rating. Chosen because it doesn't collide with any other icon. `bar-chart-outline` was found squatting on this concept in 8 files (2026-08) — fixed, don't reintroduce it for skill/rating. |
| Tournaments | `trophy-outline` | App-wide Tournaments marker (nav, map pins, event logos). **Do not** use for rating/skill — reserved here. |
| Format / pickleball mark | `AppIcon name="pickleball"` (`PickleballIcon`) | Custom SVG ball glyph — the real pickleball mark, not an Ionicons stand-in. See "Custom SVG icons" below for a sizing gotcha specific to this asset. |

## Custom SVG icons

`PickleballIcon` (`apps/mobile/src/components/PickleballIcon.tsx`) is the only
non-Ionicons icon in the app, routed through `AppIcon` alongside Ionicons
glyph names. Its source `viewBox` originally shipped as `0 0 493 448`, but the
actual ball artwork only occupied roughly the middle 50-65% of that box —
Ionicons fill their box edge-to-edge, so at an identical `size` prop the ball
rendered visibly smaller than every neighboring Ionicon (caught 2026-08 on
the community event detail screen's "Format" row). Fixed by cropping the
`viewBox` to the artwork's true bounding box (`69 16 339 339`) so it fills
its box the same way Ionicons do, and dropping the old non-square
`size * ASPECT` height in favor of a plain `size × size` render.

If another custom SVG icon is ever added to `AppIcon`, check its rendered
size against a same-`size` Ionicon before shipping — a viewBox with baked-in
margin will silently look undersized next to every other icon in the app.
