// ⚠️ TEMPORARY MIRROR of packages/shared/src/play-profile.ts.
//
// That file is canonical. This copy exists only because mobile is not in the
// workspace yet: B1 was split so web could adopt packages/shared immediately
// while the mobile half waits for a green EAS build after the 2026-09-01 quota
// reset (see packages/shared/README.md for why).
//
// DELETE THIS FILE when mobile joins the workspace, and import from
// @dreambreaker/shared instead. Until then, any change here must be made there
// too — the keys are database values constrained by CHECK constraints on
// `profiles`, so a divergence is a rejected write, not a cosmetic difference.
//
// The legacy mapper is deliberately NOT mirrored: it exists for the migration
// and for rendering pre-migration rows, both of which happen on the server or
// on web.

export const PLAY_STYLE_KEYS = [
  'aggressive_baseliner',
  'soft_game',
  'dink_master',
  'banger',
  'counter_puncher',
  'all_court',
  'third_shot_specialist',
  'net_player',
] as const;

export type PlayStyleKey = (typeof PLAY_STYLE_KEYS)[number];

export const PLAY_STYLE_LABELS: Record<PlayStyleKey, string> = {
  aggressive_baseliner: 'Aggressive baseliner',
  soft_game: 'Soft game',
  dink_master: 'Dink master',
  banger: 'Banger',
  counter_puncher: 'Counter-puncher',
  all_court: 'All-court',
  third_shot_specialist: 'Third-shot specialist',
  net_player: 'Net player',
};

export const PREFERRED_FORMAT_KEYS = [
  'singles',
  'mixed_doubles',
  'mens_doubles',
  'womens_doubles',
  'ladder',
  'round_robin',
  'tournament_play',
] as const;

export type PreferredFormatKey = (typeof PREFERRED_FORMAT_KEYS)[number];

export const PREFERRED_FORMAT_LABELS: Record<PreferredFormatKey, string> = {
  singles: 'Singles',
  mixed_doubles: 'Mixed doubles',
  mens_doubles: "Men's doubles",
  womens_doubles: "Women's doubles",
  ladder: 'Ladder',
  round_robin: 'Round robin',
  tournament_play: 'Tournament play',
};

export const PLAY_INTENSITY_KEYS = ['competitive', 'recreational', 'social'] as const;

export type PlayIntensityKey = (typeof PLAY_INTENSITY_KEYS)[number];

export const PLAY_INTENSITY_LABELS: Record<PlayIntensityKey, string> = {
  competitive: 'Competitive',
  recreational: 'Recreational',
  social: 'Social',
};

export function playStyleLabel(key: string): string {
  return PLAY_STYLE_LABELS[key as PlayStyleKey] ?? key;
}

export function preferredFormatLabel(key: string): string {
  return PREFERRED_FORMAT_LABELS[key as PreferredFormatKey] ?? key;
}

export function playIntensityLabel(key: string): string {
  return PLAY_INTENSITY_LABELS[key as PlayIntensityKey] ?? key;
}

/** Renders a stored key list for display. Empty and null both yield null so
 *  callers can fall through to their own placeholder. */
export function playStyleSummary(keys: string[] | null | undefined): string | null {
  if (!keys || keys.length === 0) return null;
  return keys.map(playStyleLabel).join(', ');
}
