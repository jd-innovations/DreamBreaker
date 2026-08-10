/**
 * DreamBreakerPB Design System v1 — Spacing scale.
 *
 * 4pt base scale. Use these instead of magic numbers for padding/margin/gap.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,

  // Common screen gutters
  screenH: 16,   // horizontal screen padding
  screenV: 12,   // vertical header padding
} as const;

export type SpacingToken = keyof typeof spacing;
