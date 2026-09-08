import { TextStyle } from 'react-native';

/**
 * Pickleball App Design System v1 — Canonical typography.
 *
 * Use these presets for all text. Do not hand-roll fontSize/fontWeight combos.
 */
export const typography = {
  pageTitle:    { fontSize: 17, fontWeight: '900' } as TextStyle,
  // NOTE (2026-08-23): this token no longer describes the app. Only
  // design-lab.tsx consumes it; every shipping screen hand-rolls a much
  // smaller all-caps section heading instead. Surveyed:
  //
  //   13 / 800 / ls 0.6 / uppercase  booking (choose-time, game-status,
  //                                  players, review), add-registration
  //   13 / 900 / ls 0.8 / uppercase  tournament/[id], community/[id]
  //   13 / 800 / ls 0.8 / uppercase  facility/[id]
  //   11 / 900 / ls 0.8              register, select-division, wallet/[id]
  //   17 / 900                       design-lab only (this token)
  //
  // The de facto standard is a small uppercase label — roughly 11-13pt,
  // weight 800-900, letterSpacing 0.6-0.8 — not a 17pt title. Community and
  // tournament detail were deliberately aligned to 13/900/0.8 so the two
  // screens read the same; see the comment on sectionTitle in community/[id].
  //
  // Left unchanged rather than corrected, because editing it would silently
  // restyle design-lab and because picking the one true value across four
  // competing variants is a design call, not a cleanup. Resolving this means
  // choosing a canonical small-caps preset and migrating screens onto it.
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
