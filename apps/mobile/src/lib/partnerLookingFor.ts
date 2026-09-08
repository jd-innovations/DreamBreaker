// Shared game-type vocabulary for partner_preferences.game_types, used by
// both match/preferences.tsx and edit-profile.tsx. Both screens must read
// and write the exact same list -- otherwise saving from one can silently
// drop a value only the other screen knows how to represent (e.g. before
// this file existed, edit-profile.tsx had no Singles toggles at all, so a
// save from there would have wiped any Singles preference set on the
// Preferences screen).
export const GAME_TYPES = [
  "Men's Singles",
  "Women's Singles",
  "Men's Doubles",
  "Women's Doubles",
  'Mixed Doubles',
  'Community Play',
  'Tournament Partner',
] as const;

export type GameType = (typeof GAME_TYPES)[number];
