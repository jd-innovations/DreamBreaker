import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, StyleSheet, View,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

// Canonical gold (#C9A84C) at low alpha. Gold rather than white because a white
// band above ~0.10 alpha visibly washes out gold labels and muted text on a
// navy card; gold degrades more gracefully against the same background.
const BAND_EDGE = 'rgba(201,168,76,0)';
const BAND_CORE = 'rgba(201,168,76,0.16)';

// Width of the sweeping band. Wider reads as a slow gloss, narrower as a glint.
const BAND_WIDTH = 130;

type Props = {
  /** Sweep duration, ms. */
  durationMs?: number;
  /** Pause before the sweep starts, so it lands after the screen settles. */
  delayMs?: number;
  /** Band tilt. 0 sweeps straight down the card. */
  angle?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A single gold sweep across whatever it is layered over.
 *
 * Deliberately plays once per focus rather than looping. On an always-visible
 * surface like the home card, a perpetual sweep both costs battery for the
 * whole time the app is foregrounded and reads as a loading skeleton — people
 * assume the card is still fetching. One pass on arrival reads as polish.
 *
 * Renders nothing when Reduce Motion is on.
 *
 * The parent is responsible for clipping: this fills the parent and relies on
 * the parent's own `overflow: 'hidden'` + `borderRadius` to shape the sweep.
 * It is `pointerEvents="none"` throughout, so it never intercepts taps on the
 * interactive surface underneath.
 */
export function ShimmerOverlay({
  durationMs = 1100,
  delayMs = 350,
  angle = 20,
  style,
}: Props) {
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then(on => {
      if (!cancelled) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { cancelled = true; sub.remove(); };
  }, []);

  // Re-run on every focus, not just mount: a tab screen stays mounted, so a
  // mount-only effect would play once and never again for the session.
  useFocusEffect(
    useCallback(() => {
      if (!width || reduceMotion) return;
      progress.setValue(0);
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        delay: delayMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
      anim.start();
      return () => anim.stop();
    }, [width, reduceMotion, durationMs, delayMs, progress]),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(prev => (prev === w ? prev : w));
  };

  if (reduceMotion) return <View style={[StyleSheet.absoluteFill, style]} onLayout={onLayout} pointerEvents="none" />;

  const translateX = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [-BAND_WIDTH, width + BAND_WIDTH],
  });

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      onLayout={onLayout}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          s.band,
          { transform: [{ translateX }, { rotate: `${angle}deg` }] },
        ]}
      >
        <LinearGradient
          colors={[BAND_EDGE, BAND_CORE, BAND_EDGE]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  // Taller than the parent and offset upward so the rotated band still covers
  // the top and bottom edges instead of cutting corners off the sweep.
  band: {
    position: 'absolute',
    top: '-50%',
    height: '200%',
    width: BAND_WIDTH,
  },
});
