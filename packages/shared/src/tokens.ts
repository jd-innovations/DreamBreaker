// Design tokens — the canonical values for both platforms.
//
// Workstream B3 of WEB_MOBILE_ALIGNMENT_PLAN.md.
//
// B3a introduced this file holding the previous values exactly, so the generated
// CSS was byte-identical and the refactor was provably invisible. B3b is the
// brand change from decision D2 — gold on navy, matching the app — and it edits
// only the two scheme objects below. Everything downstream is generated, so the
// visual change is one revertible commit and nothing else moved with it.
//
// ── Why colours are HSL triplets ─────────────────────────────────────────────
//
// Web consumes these as CSS custom properties in the form Tailwind v4 expects:
// `--primary: 84 81% 56%`, used as `hsl(var(--primary))`. Keeping the canonical
// form identical to the consumed form means the generator is a formatter, not a
// converter — there is no colour maths between here and the browser, and so no
// rounding to disagree about.
//
// `toCss()` and `toHex()` exist for the platforms that need other forms. React
// Native has no CSS variables, so mobile reads resolved values.
//
// ── The trap this must not fall into ─────────────────────────────────────────
//
// Mobile's palette CANNOT be mechanically inverted for dark mode. `navy`
// (#0A1228) is the INK in the light theme and a SURFACE in the dark one — the
// same hex playing opposite roles. Inverting lightness produces navy text on a
// navy ground. Tokens are therefore named by ROLE (`background`, `foreground`)
// and each theme assigns roles independently.

export type Hsl = { h: number; s: number; l: number };

export type ColorRole =
  | "background"
  | "foreground"
  | "card"
  | "cardForeground"
  | "popover"
  | "popoverForeground"
  | "primary"
  | "primaryForeground"
  | "secondary"
  | "secondaryForeground"
  | "muted"
  | "mutedForeground"
  | "accent"
  | "accentForeground"
  | "destructive"
  | "destructiveForeground"
  | "border"
  | "input"
  | "ring";

/** The CSS custom-property name each role is emitted as. */
export const CSS_VAR_NAMES: Record<ColorRole, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
};

/** Emission order, matching the file this generates. */
export const COLOR_ROLE_ORDER: ColorRole[] = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "border",
  "input",
  "ring",
];

export type ColorScheme = Record<ColorRole, Hsl>;

export const light: ColorScheme = {
  // Navy ink on a faintly navy-tinted page — mobile's `page` (#F3F6FC).
  background: { h: 220, s: 60, l: 97 },
  foreground: { h: 224, s: 60, l: 10 },
  card: { h: 0, s: 0, l: 100 },
  cardForeground: { h: 224, s: 60, l: 10 },
  popover: { h: 0, s: 0, l: 100 },
  popoverForeground: { h: 224, s: 60, l: 10 },
  // A DEEPER gold than the app's #C9A84C, and deliberately so: `--primary` is
  // used for text as well as fills, and #C9A84C on white measures 2.29:1 —
  // well under the 4.5 floor. #8A6D1F reaches 4.90 as text and 4.90 under
  // white as a fill, so one token serves both without failing either.
  // The dark theme uses the brighter app gold, which passes there. Same role,
  // different value per ground — the reason these are named by role.
  primary: { h: 44, s: 63, l: 33 },
  primaryForeground: { h: 0, s: 0, l: 100 },
  secondary: { h: 220, s: 47, l: 92 },
  secondaryForeground: { h: 224, s: 60, l: 10 },
  muted: { h: 220, s: 50, l: 95 },
  mutedForeground: { h: 220, s: 22, l: 45 },
  // The app gold itself, for FILLS carrying navy text (8.13:1). Never for text
  // on the page ground.
  accent: { h: 44, s: 54, l: 54 },
  accentForeground: { h: 224, s: 60, l: 10 },
  destructive: { h: 0, s: 84, l: 60 },
  destructiveForeground: { h: 0, s: 0, l: 98 },
  border: { h: 218, s: 53, l: 92 },
  input: { h: 218, s: 53, l: 92 },
  ring: { h: 44, s: 63, l: 33 },
};

export const dark: ColorScheme = {
  // Mobile's player-credential surfaces, promoted to the app's dark theme:
  // #050A18 ground, #0A1228 surface, #101A34 raised. They were designed as a
  // set and are already internally consistent, which is why this adopts them
  // rather than inventing a second dark palette.
  //
  // Note #0A1228 is `foreground` in the light scheme above and `card` here —
  // the same hex in opposite roles. That is precisely why a mechanical
  // inversion of the light theme would produce navy text on a navy ground.
  background: { h: 224, s: 66, l: 6 },
  foreground: { h: 0, s: 0, l: 100 },
  card: { h: 224, s: 60, l: 10 },
  cardForeground: { h: 0, s: 0, l: 100 },
  popover: { h: 223, s: 53, l: 13 },
  popoverForeground: { h: 0, s: 0, l: 100 },
  // The app gold, unmodified. 8.13:1 as text on the card and 8.64:1 on the
  // ground, so it works as both text and fill here.
  primary: { h: 44, s: 54, l: 54 },
  primaryForeground: { h: 224, s: 60, l: 10 },
  secondary: { h: 223, s: 53, l: 13 },
  secondaryForeground: { h: 0, s: 0, l: 100 },
  muted: { h: 223, s: 53, l: 13 },
  // mobile's playerTextSub (#B9C4DA) — 10.59:1 on the card.
  mutedForeground: { h: 220, s: 31, l: 79 },
  accent: { h: 44, s: 54, l: 54 },
  accentForeground: { h: 224, s: 60, l: 10 },
  destructive: { h: 0, s: 72, l: 51 },
  destructiveForeground: { h: 0, s: 0, l: 98 },
  // A gold-tinted hairline, the opaque equivalent of mobile's
  // rgba(201,168,76,0.24) over navy.
  border: { h: 223, s: 34, l: 19 },
  input: { h: 223, s: 34, l: 19 },
  ring: { h: 44, s: 54, l: 54 },
};

export const colorSchemes = { light, dark } as const;
export type ColorSchemeName = keyof typeof colorSchemes;

// ─── Scale tokens ────────────────────────────────────────────────────────────
//
// Stored as plain PX NUMBERS. Web formats to rem at generation; React Native
// consumes them directly. This follows the same principle as the colours above
// — one canonical form, converted at the edge — except the direction is
// reversed: colours are stored web-shaped because CSS is the pickier consumer,
// while scales are stored number-shaped because React Native cannot parse
// `calc()` or `rem` at all.
//
// The values come from DESIGN_STANDARD.md, extracted from three screens chosen
// as the reference on 2026-09-03. They are not proposals; they are what those
// screens already render.
//
// The previous `radius.sm/md/lg` held CSS `calc()` strings that nothing read —
// web derives its own from `--radius` in globals.css, outside the generated
// block, and the generator only ever consumed `.base`.

export const radius = {
  badge: 6,
  /** Every CTA. Decision 2026-09-03: the reference uses 10, not button's 14 or the 30 that 19 screens hardcode. */
  cta: 10,
  panel: 12,
  card: 16,
  /** Chips, status badges, filter pills. */
  pill: 20,
  /** Web's `--radius` root, emitted as rem. Same 12px as `panel`. */
  base: 12,
} as const;

export const space = {
  gapTight: 8,
  gap: 12,
  /** Below a section header. The one value off the 4pt grid, and deliberate. */
  sectionBottom: 14,
  /** Screen gutter, and card padding — the reference uses one value for both. */
  gutter: 16,
  sectionTop: 24,
} as const;

/**
 * Named by job, not by size — `size` is px, `letterSpacing` px.
 *
 * Called `text`, not `type`: `import { type } from "@shared/tokens"` collides
 * with TypeScript's type-only import syntax and reads as a syntax error waiting
 * to happen.
 *
 * `fieldLabel` and `actionLarge` were added 2026-09-03 when the Book a Court
 * screen was migrated. The original nine roles came from browse/card screens,
 * which have no form controls and no full-width buttons — applying `action`
 * (13/800, measured from in-card CTAs) to a primary submit button would have
 * shrunk it by three points. Both new values are what that screen already used.
 */
export const text = {
  /**
   * The large left-aligned title on a tab root. Distinct from `sectionTitle`
   * (17/900), which is the small centred title a pushed screen puts beside its
   * back button — two different jobs that had drifted into seven values
   * between them across `(tabs)`.
   */
  pageTitle:    { size: 28, weight: 900 },
  /** Title over a hero image. Added 2026-09-03 (facility detail). */
  heroTitle:    { size: 26, weight: 800, lineHeight: 30 },
  statNumber:   { size: 26, weight: 900 },
  cardTitle:    { size: 22, weight: 800, lineHeight: 26 },
  /** The heading of a bottom sheet or modal. */
  modalTitle:   { size: 20, weight: 900 },
  /**
   * A stat value smaller than `statNumber` (26/900) — a profile stat, a rating.
   * Shares 20/900 with `modalTitle` and stays separate under rule 11: a
   * heading is not a number.
   */
  statValueSm:  { size: 20, weight: 900 },
  sectionTitle: { size: 17, weight: 900 },
  /** Full-width primary buttons, and controls sized like them. */
  actionLarge:  { size: 16, weight: 800 },
  /**
   * Small titles: a header inside a card, a bottom-sheet title, a venue name.
   *
   * 17, not 16. Decision 15 (2026-09-03): measuring all 2,350 literal type
   * values found 17/800 is the single most common title in the app — 45 uses
   * — while 16/800 has 16. This role was set to 16 from a three-screen sample
   * before that measurement existed. At 17 the largest cluster of titles in
   * the app migrates as a no-op.
   */
  titleSm:      { size: 17, weight: 800 },
  body:         { size: 15, weight: 500 },
  /** Primary label in a list row: a court name, an info row's first line. */
  rowTitle:     { size: 14, weight: 700 },
  /** The value a list row carries: a price. */
  rowValue:     { size: 14, weight: 800 },
  /** Form field labels: "Looking For", "Where?", "Date". */
  fieldLabel:   { size: 13, weight: 800 },
  /** In-card CTAs. */
  action:       { size: 13, weight: 800 },
  link:         { size: 13, weight: 700 },
  /** Labels on controls: tabs, filter chips, contact chips. */
  controlLabel: { size: 13, weight: 700 },
  /**
   * Uppercase screen section headings: "BOOK A COURT".
   *
   * Decision 2026-09-03. This is the ONE value here that does not come from the
   * reference screens — they use 11/700/ls1.2 muted ("QUICK ACTIONS"), and this
   * is the 13/800/ls0.8 navy treatment from facility detail, chosen
   * deliberately over the measured one. Consequence: when Home is migrated,
   * "QUICK ACTIONS" grows and turns navy.
   */
  sectionLabel: { size: 13, weight: 800, letterSpacing: 0.8, uppercase: true },
  /** A value carried inside a chip: a time, a count, an availability flag. */
  chipValue:    { size: 12, weight: 800 },
  caption:      { size: 12, weight: 500 },
  cardLabel:    { size: 11, weight: 800, letterSpacing: 0.8, uppercase: true },
  /**
   * The smallest label: under a quick-action icon, inside a fill bar, on a
   * status or skill chip. Plain — no tracking, not uppercase.
   *
   * Decision 17 (2026-09-04), and the first role added below the old 11pt
   * floor. Decision 10 said sub-11 sizes have no role "until one is proposed
   * with a measurement", so here is the measurement: 145 uses sit below 11,
   * and 90 of them are 10pt. Within those, 10/700 (27 uses) and 10/800 (30)
   * are doing different jobs — only 8 of the 10/700s carry letterSpacing
   * against 17 of the 10/800s. This role is the plain one.
   *
   * The tracked 10/800 variant is deliberately NOT a role yet; it would be a
   * smaller `cardLabel` and is left exempt. The floor is now 10: 9pt and
   * below still have no role.
   */
  microLabel:   { size: 10, weight: 700 },
} as const;

export type RadiusToken = keyof typeof radius;
export type SpaceToken = keyof typeof space;
export type TextToken = keyof typeof text;

export const fontStacks = {
  sans: "var(--font-manrope), system-ui, sans-serif",
  display: "var(--font-bebas-neue), sans-serif",
  mono: "var(--font-jetbrains-mono), monospace",
} as const;

// ─── Formatting ──────────────────────────────────────────────────────────────

/** `84 81% 56%` — the bare triplet Tailwind v4 wraps in hsl(). */
export function toCssTriplet(c: Hsl): string {
  return `${c.h} ${c.s}% ${c.l}%`;
}

/** `hsl(84 81% 56%)` — for anywhere that needs a complete colour. */
export function toCss(c: Hsl): string {
  return `hsl(${toCssTriplet(c)})`;
}

/**
 * `#B4E44E` — React Native has no CSS variables and no hsl() parsing in every
 * context, so mobile resolves to hex.
 */
export function toHex(c: Hsl): string {
  const s = c.s / 100;
  const l = c.l / 100;
  const k = (n: number) => (n + c.h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (n: number) =>
    Math.round(255 * f(n))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(0)}${hex(8)}${hex(4)}`.toUpperCase();
}
