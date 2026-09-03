/**
 * Pickleball App Design System v1 — theme barrel.
 *
 * Fixed palette (does not flip between themes):
 *   import { colors, typography, spacing, radius, iconCircle } from '@/theme';
 *
 * Theme-aware colour roles (light / dark / system) — see THEMING_PLAN.md:
 *   import { useThemedStyles, useTheme, type ThemeRoles } from '@/theme';
 */
export { colors } from './colors';
export { typography, displayText, displayFontFamily } from './typography';
export { spacing } from './spacing';
export { radius, iconCircle } from './radius';
export { gradients } from './gradients';

export { lightRoles, darkRoles, themes } from './roles';
export {
  ThemeProvider,
  useTheme,
  useThemeRoles,
  useThemedStyles,
  THEME_MIGRATION_COMPLETE,
} from './ThemeProvider';

export type { ColorToken } from './colors';
export type { TypographyToken } from './typography';
export type { SpacingToken } from './spacing';
export type { RadiusToken } from './radius';
export type { GradientToken } from './gradients';
export type { ThemeName, ThemeRole, ThemeRoles } from './roles';
export type { ThemeSetting } from './ThemeProvider';
