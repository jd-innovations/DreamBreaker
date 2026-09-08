/**
 * Geometry of the floating tab bar in app/(tabs)/_layout.tsx.
 *
 * Screens that draw their own floating chrome (map buttons, bottom sheets,
 * overlays) need to clear it. Keep these in sync with the `s.bar` style there —
 * that layout imports the same constants, so changing a value here moves both.
 */
export const TAB_BAR_HEIGHT = 66;

/** Minimum gap below the bar when the device has little or no bottom inset. */
export const TAB_BAR_MIN_GAP = 14;

/**
 * Distance from the bottom of the screen to just above the tab bar.
 * Pass `insets.bottom` from `useSafeAreaInsets()`.
 */
export function tabBarClearance(insetBottom: number): number {
  return Math.max(insetBottom, TAB_BAR_MIN_GAP) + TAB_BAR_HEIGHT + 8;
}
