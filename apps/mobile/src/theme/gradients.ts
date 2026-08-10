/**
 * DreamBreakerPB Design System v1 - canonical gradient ramps.
 */
export const gradients = {
  appLight: ['#FFFFFF', '#FFFDF9', '#F9F6EE'],
} as const;

export type GradientToken = keyof typeof gradients;