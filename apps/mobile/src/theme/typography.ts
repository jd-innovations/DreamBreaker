import { TextStyle } from 'react-native';

/**
 * DreamBreakerPB Design System v1 — Canonical typography.
 *
 * Use these presets for all text. Do not hand-roll fontSize/fontWeight combos.
 */
export const typography = {
  pageTitle:    { fontSize: 17, fontWeight: '900' } as TextStyle,
  sectionTitle: { fontSize: 17, fontWeight: '900' } as TextStyle,
  cardTitle:    { fontSize: 16, fontWeight: '700' } as TextStyle,
  body:         { fontSize: 15, fontWeight: '400' } as TextStyle,
  metadata:     { fontSize: 12, fontWeight: '400' } as TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;

/**
 * Display font (Bebas Neue) for tournament/event names — used for the big
 * poster-style headline text on hero banners and list/card titles.
 *
 * Bebas Neue's cap-height runs tall relative to its fontSize, so a lineHeight
 * equal to (or smaller than) fontSize clips the tops/bottoms of letters.
 * Always build display text styles through `displayText()` rather than
 * hand-rolling fontFamily/lineHeight, so that ratio stays safe everywhere.
 */
export const displayFontFamily = 'BebasNeue_400Regular';

export function displayText(fontSize: number, extra?: TextStyle): TextStyle {
  return {
    fontFamily: displayFontFamily,
    fontSize,
    lineHeight: Math.round(fontSize * 1.08),
    ...extra,
  };
}
