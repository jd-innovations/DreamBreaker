/**
 * Semantic colour roles — the theme-aware layer of Design System v1.
 *
 * See THEMING_PLAN.md at the repo root for how these were derived and for the
 * decisions behind them. The short version:
 *
 * A role names a JOB, not a value. `colors.navy` says what a colour IS;
 * `roles.textPrimary` says what it is FOR. Only the second can flip between
 * themes — "navy" as a background is meaningless in dark mode.
 *
 * `colors` (theme/colors.ts) is NOT deprecated. It stays as the fixed palette:
 * the raw values these ramps are built from, plus the deliberately-fixed
 * surfaces (the `player*` credential family) that must not flip. New screen
 * code should reach for roles; fixed-by-design components keep using `colors`.
 *
 * Most dark values are not inventions. They come from `constants/Colors.ts`,
 * the app's own dark palette from before it went light, absorbed here when
 * that file was deleted.
 */

export type ThemeName = 'light' | 'dark';

export type ThemeRoles = {
  // Surfaces
  background: string;
  surface: string;
  surfaceElevated: string;

  // Lines
  border: string;
  borderSubtle: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Action
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  accentBg: string;
  accentBorder: string;

  // Status
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
  warning: string;
  warningBg: string;

  // Overlays
  overlay: string;
  scrimMedia: string;
  scrimMediaStrong: string;
};

export const lightRoles: ThemeRoles = {
  background: '#F3F6FC',
  surface: '#FFFFFF',
  surfaceElevated: '#F0F4FA',

  border: '#E0E8F5',
  borderSubtle: '#F0F4FA',

  textPrimary: '#0A1228',
  textSecondary: '#8A9DC0',
  textMuted: '#9AAABF',
  textInverse: '#FFFFFF',

  primary: '#0A1228',
  onPrimary: '#FFFFFF',
  accent: '#C9A84C',
  onAccent: '#0A1228',
  accentBg: 'rgba(201,168,76,0.12)',
  accentBorder: 'rgba(201,168,76,0.35)',

  success: '#22C55E',
  successBg: '#F0FDF4',
  danger: '#EF4444',
  dangerBg: '#FEF2F2',
  warning: '#CA8A04',
  warningBg: '#FEF9E7',

  overlay: 'rgba(10,18,40,0.45)',
  scrimMedia: 'rgba(0,0,0,0.45)',
  scrimMediaStrong: 'rgba(10,18,40,0.72)',
};

export const darkRoles: ThemeRoles = {
  background: '#07091A',
  surface: '#0F1628',
  surfaceElevated: '#131D35',

  border: '#1C2B4A',
  borderSubtle: '#152039',

  textPrimary: '#F0F4FF',
  textSecondary: '#7A92C4',
  textMuted: '#3D506E',
  textInverse: '#0A1228',

  // Decision 1 (2026-09-02): gold, not navy. Navy #0A1228 sits at ~1.6:1
  // against the #07091A ground — a primary CTA that reads as part of the page.
  primary: '#EAC96A',
  onPrimary: '#0A1228',
  // Gold brightens in dark for the same reason the old dark theme brightened
  // it: #C9A84C loses contrast against a dark ground.
  accent: '#EAC96A',
  onAccent: '#0A1228',
  accentBg: 'rgba(201,168,76,0.18)',
  accentBorder: 'rgba(201,168,76,0.35)',

  success: '#34D399',
  successBg: 'rgba(52,211,153,0.12)',
  danger: '#EF4444',
  dangerBg: 'rgba(239,68,68,0.12)',
  warning: '#F59E0B',
  warningBg: 'rgba(245,158,11,0.12)',

  overlay: 'rgba(7,9,26,0.85)',
  // Text over a photo needs a dark scrim in BOTH themes — the photo does not
  // get lighter when the app does. These roles deliberately do not flip.
  scrimMedia: 'rgba(0,0,0,0.45)',
  // Solid chip sitting ON media (a condition badge on a listing photo), as
  // opposed to a wash laid OVER it. Added during the Phase 2 marketplace pilot:
  // scrimMedia at 0.45 was too weak to carry small type on a bright photo.
  scrimMediaStrong: 'rgba(10,18,40,0.72)',
};

export const themes: Record<ThemeName, ThemeRoles> = {
  light: lightRoles,
  dark: darkRoles,
};

export type ThemeRole = keyof ThemeRoles;
