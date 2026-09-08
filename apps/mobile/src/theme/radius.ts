/**
 * Pickleball App Design System v1 — Border radius + icon geometry.
 */
export const radius = {
  button: 14,   // primary + secondary buttons
  card: 16,     // standard card
  chip: 20,     // pills / status chips
  sm: 10,
  md: 12,
} as const;

/** Standard icon-circle sizes. */
export const iconCircle = {
  standard: 40,
  small: 34,
} as const;

export type RadiusToken = keyof typeof radius;
