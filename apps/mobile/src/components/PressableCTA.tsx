import React, { useEffect, useRef } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';

/**
 * The shared tap treatment for event-menu CTAs: Share, Add to Calendar, and
 * Favorite/Bookmark.
 *
 * Extracted rather than copied. Before this, all three were hand-rolled
 * `TouchableOpacity`s across 16 screens with nothing but `activeOpacity`
 * dimming — no haptic, no press animation, and no single place to change
 * how any of it feels. `AddToCalendarButton` is the precedent: one owner for
 * a CTA's interaction behaviour, callers supply only intent.
 *
 * Two deliberate behaviours, decided before this was built:
 *
 * 1. The haptic fires on `onPressIn`, not `onPress` — the point is to feel
 *    the tap land under your finger, not to be told a second later that
 *    something happened. Async result feedback (a save succeeded, a share
 *    failed) is a separate concern and stays with the caller; see
 *    AddToCalendarButton, which still fires its own success/error haptics
 *    after its await, on top of the press haptic this provides.
 *
 * 2. `pulseOn` distinguishes a toggle from a one-shot action. Omit it and
 *    every press pulses (Share: there is no "on" state to celebrate). Pass
 *    it and the pulse fires only on the false -> true edge — liking bounces,
 *    un-liking does not, the way the gesture reads everywhere else people
 *    already use it. The haptic still fires on every press either way,
 *    because the tap itself always happened.
 */

export type PressableCTAProps = {
  onPress: () => void;
  /**
   * `light` for anything a finger commits to — favorite, bookmark, share,
   * calendar. `selection` only for picker-style ticks.
   *
   * Favorite/bookmark started on `selection`, following the taxonomy's
   * "selection-state change" reading. On device it could not be felt:
   * `selection` is UISelectionFeedbackGenerator, the faintest effect iOS has,
   * built for scroll-wheel detents rather than for an action that writes to
   * the server. All nine toggle call sites moved to `light` on 2026-09-21.
   * See lib/haptics.ts and HAPTICS_PHASE3.md.
   */
  hapticType?: 'selection' | 'light';
  /**
   * Toggle mode. When provided, the pulse runs only as this goes false ->
   * true. When omitted, every press pulses.
   */
  pulseOn?: boolean;
  disabled?: boolean;
  /** The pressable's own box: size, background, radius, content alignment. */
  style?: StyleProp<ViewStyle>;
  /**
   * The OUTER animated wrapper's box — use this for anything positioning the
   * CTA within its parent: `marginLeft: 'auto'`, `alignSelf`, `flex`.
   *
   * The distinction is not cosmetic. `style` goes on the inner Pressable, but
   * the parent's flex child is the wrapper, so layout styles passed as `style`
   * are silently inert. That cost a right-aligned bookmark its alignment on
   * Nearby's list card before this prop existed.
   */
  containerStyle?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityLabel?: string;
  children: React.ReactNode;
};

// Springs rather than a timing curve: a pulse that overshoots and settles
// reads as physical, which is the whole point of pairing it with a haptic.
const PULSE_UP = { damping: 12, stiffness: 420 } as const;
const PULSE_BACK = { damping: 14, stiffness: 320 } as const;
const PULSE_SCALE = 1.18;

export function PressableCTA({
  onPress,
  hapticType = 'light',
  pulseOn,
  disabled = false,
  style,
  containerStyle,
  hitSlop = 8,
  accessibilityLabel,
  children,
}: PressableCTAProps) {
  const scale = useSharedValue(1);
  const isToggle = pulseOn !== undefined;

  // Tracks the previous `pulseOn` so the effect below can tell an actual
  // false -> true edge from a re-render that merely passed the same value
  // again. Seeded with the initial value on purpose: a card that mounts
  // already-favorited must not pulse on arrival.
  const prevPulseOn = useRef(pulseOn);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function pulse() {
    scale.value = withSequence(
      withSpring(PULSE_SCALE, PULSE_UP),
      withSpring(1, PULSE_BACK),
    );
  }

  useEffect(() => {
    if (!isToggle) return;
    const wasOn = prevPulseOn.current;
    prevPulseOn.current = pulseOn;
    // Only the off -> on edge. Un-favoriting is still a real state change and
    // still gets its haptic on press; it just doesn't get celebrated.
    if (pulseOn && !wasOn) pulse();
    // `pulse` is stable for the life of the component (it only touches a
    // shared value, which Reanimated keeps identity-stable across renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseOn, isToggle]);

  function handlePressIn() {
    if (disabled) return;
    if (hapticType === 'selection') haptics.selection();
    else haptics.light();
    // One-shot actions pulse here, at the moment of the tap, in step with the
    // haptic. Toggles wait for their state to actually flip — the caller owns
    // that, and it may be rejected or fail, in which case nothing should have
    // bounced.
    if (!isToggle) pulse();
  }

  return (
    <Animated.View style={[containerStyle, animatedStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPress={onPress}
        disabled={disabled}
        style={style}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
