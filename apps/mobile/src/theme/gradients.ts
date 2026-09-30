/**
 * Pickleball App Design System v1 - canonical gradient ramps.
 */
export const gradients = {
  appLight: ['#FFFFFF', '#FFFDF9', '#F9F6EE'],
  /** Soft button fill, top to bottom (SoftButton). Added 2026-09-30. */
  ctaSoft: ['#FFFFFF', '#F3F5F9'],
} as const;

export type GradientToken = keyof typeof gradients;