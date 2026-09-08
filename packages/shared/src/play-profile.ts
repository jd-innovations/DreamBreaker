// How a player describes their game — the three axes, as keys.
//
// See PLAY_STYLE_VOCABULARY.md for the finding and the decision. In short:
// `profiles.play_style` was one text column answering three different
// questions, written by four call sites that disagreed on both the vocabulary
// and the shape.
//
//   play_style        HOW you play          dinker, banger, counter-puncher
//   preferred_formats WHAT you play         singles, mixed doubles, ladder
//   play_intensity    HOW SERIOUSLY         competitive, recreational, social
//
// These are independent. A recreational player enters mixed doubles; a
// competitive one can be a dinker. Collapsing any two of them loses real
// information, which is what the single column was doing.
//
// Keys are stored, labels are rendered. Matchmaking cannot filter on free
// prose, and a copy edit to a label must never orphan stored rows.
//
// NO ICONS HERE. Icon names are platform-specific — Phosphor components on web,
// Ionicons strings on mobile — and this package must bundle for a Next server, a
// browser, and Hermes. Each app maps its own icons onto these keys.

// ─── How you play ────────────────────────────────────────────────────────────

export const PLAY_STYLE_KEYS = [
  "aggressive_baseliner",
  "soft_game",
  "dink_master",
  "banger",
  "counter_puncher",
  "all_court",
  "third_shot_specialist",
  "net_player",
] as const;

export type PlayStyleKey = (typeof PLAY_STYLE_KEYS)[number];

export const PLAY_STYLE_LABELS: Record<PlayStyleKey, string> = {
  aggressive_baseliner: "Aggressive baseliner",
  soft_game: "Soft game",
  dink_master: "Dink master",
  banger: "Banger",
  counter_puncher: "Counter-puncher",
  all_court: "All-court",
  third_shot_specialist: "Third-shot specialist",
  net_player: "Net player",
};

// ─── What you play ───────────────────────────────────────────────────────────

export const PREFERRED_FORMAT_KEYS = [
  "singles",
  "mixed_doubles",
  "mens_doubles",
  "womens_doubles",
  "ladder",
  "round_robin",
  "tournament_play",
] as const;

export type PreferredFormatKey = (typeof PREFERRED_FORMAT_KEYS)[number];

export const PREFERRED_FORMAT_LABELS: Record<PreferredFormatKey, string> = {
  singles: "Singles",
  mixed_doubles: "Mixed doubles",
  mens_doubles: "Men's doubles",
  womens_doubles: "Women's doubles",
  ladder: "Ladder",
  round_robin: "Round robin",
  tournament_play: "Tournament play",
};

// ─── How seriously ───────────────────────────────────────────────────────────
//
// Single-valued, unlike the other two: these are mutually exclusive in a way
// that styles and formats are not.

export const PLAY_INTENSITY_KEYS = ["competitive", "recreational", "social"] as const;

export type PlayIntensityKey = (typeof PLAY_INTENSITY_KEYS)[number];

export const PLAY_INTENSITY_LABELS: Record<PlayIntensityKey, string> = {
  competitive: "Competitive",
  recreational: "Recreational",
  social: "Social",
};

// ─── Legacy values ───────────────────────────────────────────────────────────
//
// Everything `profiles.play_style` held before the split, mapped onto the three
// axes. Twelve rows, ten distinct values, verified against production on
// 2026-08-27 — every one resolves without ambiguity.
//
// This exists for two jobs, and the second is the one that matters: it backs the
// migration, and it lets UI render pre-migration rows correctly in the meantime.
// Without it, an unmigrated profile shows a raw key or a blank chip.
//
// `Soft Game / Dinker` is worth noticing — a slash-pair holding TWO styles in a
// column that could only ever represent one. It is why play_style is an array.

export type LegacyPlayStyle = {
  playStyle: PlayStyleKey[];
  preferredFormats: PreferredFormatKey[];
  playIntensity: PlayIntensityKey | null;
};

const EMPTY: LegacyPlayStyle = { playStyle: [], preferredFormats: [], playIntensity: null };

const LEGACY_PLAY_STYLE: Record<string, LegacyPlayStyle> = {
  "soft game / dinker": { ...EMPTY, playStyle: ["soft_game", "dink_master"] },
  "soft game": { ...EMPTY, playStyle: ["soft_game"] },
  "soft-game specialist": { ...EMPTY, playStyle: ["soft_game"] },
  dinker: { ...EMPTY, playStyle: ["dink_master"] },
  "dink master": { ...EMPTY, playStyle: ["dink_master"] },
  "aggressive net player": { ...EMPTY, playStyle: ["net_player"] },
  banger: { ...EMPTY, playStyle: ["banger"] },
  "bangers + transition": { ...EMPTY, playStyle: ["banger"] },
  "aggressive baseliner": { ...EMPTY, playStyle: ["aggressive_baseliner"] },
  "third-shot specialist": { ...EMPTY, playStyle: ["third_shot_specialist"] },
  "counter-puncher": { ...EMPTY, playStyle: ["counter_puncher"] },
  "all-court": { ...EMPTY, playStyle: ["all_court"] },
  tournament_play: { ...EMPTY, preferredFormats: ["tournament_play"] },
  ladder: { ...EMPTY, preferredFormats: ["ladder"] },
  round_robin: { ...EMPTY, preferredFormats: ["round_robin"] },
  mixed_doubles: { ...EMPTY, preferredFormats: ["mixed_doubles"] },
  mens_doubles: { ...EMPTY, preferredFormats: ["mens_doubles"] },
  womens_doubles: { ...EMPTY, preferredFormats: ["womens_doubles"] },
  singles: { ...EMPTY, preferredFormats: ["singles"] },
  competitive: { ...EMPTY, playIntensity: "competitive" },
  recreational: { ...EMPTY, playIntensity: "recreational" },
  social: { ...EMPTY, playIntensity: "social" },
};

/**
 * Interprets a legacy `profiles.play_style` string.
 *
 * Handles the comma-joined form the web profile editor wrote, so
 * `"competitive, Soft-game specialist"` yields intensity `competitive` and
 * style `soft_game` rather than one unrecognised blob.
 *
 * Unrecognised segments are dropped rather than guessed at. A style nobody can
 * map is better shown as absent than as somebody else's style.
 */
export function fromLegacyPlayStyle(raw: string | null | undefined): LegacyPlayStyle {
  if (!raw) return { ...EMPTY };

  const out: LegacyPlayStyle = { playStyle: [], preferredFormats: [], playIntensity: null };

  for (const segment of raw.split(",")) {
    const hit = LEGACY_PLAY_STYLE[segment.trim().toLowerCase()];
    if (!hit) continue;
    for (const s of hit.playStyle) if (!out.playStyle.includes(s)) out.playStyle.push(s);
    for (const f of hit.preferredFormats) {
      if (!out.preferredFormats.includes(f)) out.preferredFormats.push(f);
    }
    if (hit.playIntensity && !out.playIntensity) out.playIntensity = hit.playIntensity;
  }

  return out;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export function playStyleLabel(key: string): string {
  return PLAY_STYLE_LABELS[key as PlayStyleKey] ?? key;
}

export function preferredFormatLabel(key: string): string {
  return PREFERRED_FORMAT_LABELS[key as PreferredFormatKey] ?? key;
}

export function playIntensityLabel(key: string): string {
  return PLAY_INTENSITY_LABELS[key as PlayIntensityKey] ?? key;
}

/**
 * A stored key list rendered for display.
 *
 * Returns null for both empty and missing, so callers can fall through to their
 * own placeholder rather than printing an empty string.
 */
export function playStyleSummary(keys: string[] | null | undefined): string | null {
  if (!keys || keys.length === 0) return null;
  return keys.map(playStyleLabel).join(", ");
}
