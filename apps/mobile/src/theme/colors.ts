/**
 * Pickleball App Design System v1 — Canonical colors.
 *
 * This is the single source of truth for color across the app.
 * No screen should declare its own local color object.
 */
export const colors = {
  // Brand
  navy: '#0A1228',
  gold: '#C9A84C',

  // Surfaces
  bg: '#FFFFFF',
  page: '#F3F6FC',

  // Player credential surfaces
  playerDarkBg: '#050A18',
  playerCardBg: '#0A1228',
  playerCardElevated: '#101A34',
  playerCardBorder: 'rgba(201,168,76,0.24)',
  playerBadgeShell: 'rgba(255,255,255,0.10)',
  playerBadgeShellBorder: 'rgba(255,255,255,0.22)',
  playerCredentialBg: '#F8F5EF',
  playerCredentialText: '#071126',
  playerCredentialMuted: '#6F7480',
  playerText: '#FFFFFF',
  playerTextSub: '#B9C4DA',

  // Lines
  border: '#E0E8F5',

  // Text
  text: '#0A1228',        // text primary
  textSub: '#8A9DC0',     // text secondary / metadata
  textMuted: '#8A9DC0',   // alias kept for migration; same as textSub

  // Status
  success: '#22C55E',
  danger: '#EF4444',

  // Gold tints (derived from canonical gold)
  goldLight: '#FDF6E7',
  goldBg: 'rgba(201,168,76,0.12)',
  goldBorder: 'rgba(201,168,76,0.35)',

  // Status tints
  successBg: '#F0FDF4',
  dangerBg: '#FEF2F2',

  // Fixed
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Identity hues for the Quick Actions.
 *
 * Colour on a quick action says WHAT IT IS, not whether it works — whether a
 * feature is in scope is `QuickAction.feature`'s job, checked against
 * BETA_SCOPE.md. These were fifteen loose hex values inside
 * `app/(tabs)/index.tsx`, one of which was `gold` copied as a literal.
 *
 * Two surfaces read them and render them differently, on purpose:
 *   - Home draws a 1.25px border at 32% alpha on a light page, so the tint is
 *     a hint and the icon stays navy.
 *   - The slide menu is dark navy, where a pastel at 32% would be invisible,
 *     so it takes the hue at full strength for both border and icon.
 *
 * Same hue, weight suited to the ground. What the menu must NOT do is adopt
 * Home's glass tile: that carries a BlurView per tile, and finding F2 of
 * PERFORMANCE_REGRESSION_AUDIT.md is thirteen of them already mounted on Home.
 * Thirteen more behind a pan-driven drawer is the regression that audit exists
 * to prevent.
 */
export const quickActionTints = {
  gold:     colors.gold,
  sky:      '#B8DFFF',
  mint:     '#D6F4E5',
  lavender: '#E8DDFB',
  peach:    '#FFE3B3',
  rose:     '#FFD3E2',
  teal:     '#BFEDE8',
  amber:    '#FFE1A8',
  indigo:   '#CBD6F7',
  lime:     '#DCF0C2',
} as const;

export type QuickActionTint = keyof typeof quickActionTints;
