/**
 * DreamBreakerPB Design System v1 — Canonical colors.
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
