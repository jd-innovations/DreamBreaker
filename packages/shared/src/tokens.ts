// Design tokens — the canonical values for both platforms.
//
// Workstream B3 of WEB_MOBILE_ALIGNMENT_PLAN.md, first half. This step is
// deliberately INVISIBLE: every value here is exactly what shipped before it
// existed, so the generated CSS is byte-identical to the file it replaces. The
// brand change (decision D2, gold on navy) is a separate commit that edits only
// this data — so it can be looked at, and reverted, on its own.
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
  background: { h: 210, s: 17, l: 98 },
  foreground: { h: 240, s: 6, l: 10 },
  card: { h: 0, s: 0, l: 100 },
  cardForeground: { h: 240, s: 6, l: 10 },
  popover: { h: 0, s: 0, l: 100 },
  popoverForeground: { h: 240, s: 6, l: 10 },
  primary: { h: 84, s: 81, l: 56 },
  primaryForeground: { h: 0, s: 0, l: 4 },
  secondary: { h: 240, s: 5, l: 90 },
  secondaryForeground: { h: 240, s: 6, l: 10 },
  muted: { h: 240, s: 5, l: 96 },
  mutedForeground: { h: 240, s: 4, l: 46 },
  accent: { h: 84, s: 81, l: 56 },
  accentForeground: { h: 0, s: 0, l: 4 },
  destructive: { h: 0, s: 84, l: 60 },
  destructiveForeground: { h: 0, s: 0, l: 98 },
  border: { h: 240, s: 6, l: 90 },
  input: { h: 240, s: 6, l: 90 },
  ring: { h: 84, s: 81, l: 56 },
};

export const dark: ColorScheme = {
  background: { h: 240, s: 6, l: 4 },
  foreground: { h: 0, s: 0, l: 100 },
  card: { h: 240, s: 4, l: 11 },
  cardForeground: { h: 0, s: 0, l: 100 },
  popover: { h: 240, s: 4, l: 11 },
  popoverForeground: { h: 0, s: 0, l: 100 },
  primary: { h: 78, s: 100, l: 62 },
  primaryForeground: { h: 0, s: 0, l: 4 },
  secondary: { h: 240, s: 4, l: 16 },
  secondaryForeground: { h: 0, s: 0, l: 100 },
  muted: { h: 240, s: 4, l: 16 },
  mutedForeground: { h: 240, s: 5, l: 65 },
  accent: { h: 78, s: 100, l: 62 },
  accentForeground: { h: 0, s: 0, l: 4 },
  destructive: { h: 0, s: 72, l: 51 },
  destructiveForeground: { h: 0, s: 0, l: 98 },
  border: { h: 240, s: 4, l: 16 },
  input: { h: 240, s: 4, l: 16 },
  ring: { h: 78, s: 100, l: 62 },
};

export const colorSchemes = { light, dark } as const;
export type ColorSchemeName = keyof typeof colorSchemes;

// ─── Scale tokens ────────────────────────────────────────────────────────────
//
// Taken from mobile, which had real scales already. Web currently derives its
// radii from a single --radius; those derivations are preserved exactly.

export const radius = {
  base: "0.75rem",
  sm: "calc(0.75rem - 4px)",
  md: "calc(0.75rem - 2px)",
  lg: "0.75rem",
} as const;

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
