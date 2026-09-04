// Full-bleed tap-to-advance photo viewer — the "Stories/Tinder-style" progressive
// image experience the Marketplace spec calls for (tap right = next, tap left =
// previous, top progress-segment indicator, no thumbnail strip, no carousel) —
// plus pinch-to-zoom and double-tap-to-zoom on the current photo. Extracted
// from apps/mobile/src/app/(tabs)/marketplace.tsx's original inline swipe-deck
// implementation, generalized to take a plain photo URL list instead of being
// wired to one hardcoded mock listing.
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, runOnJS,
} from 'react-native-reanimated';

type Props = {
  photos: string[];
  index?: number;
  onIndexChange?: (index: number) => void;
  topInset?: number;
  children?: React.ReactNode; // overlay content (controls, badges, info sheet, etc.)
};

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 2.5;

export function ProgressiveImageViewer({ photos, index, onIndexChange, topInset = 0, children }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = index ?? internalIndex;

  const setIndex = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(photos.length - 1, next));
    if (onIndexChange) onIndexChange(clamped);
    else setInternalIndex(clamped);
  }, [photos.length, onIndexChange]);

  const photo = photos[activeIndex] ?? photos[0];

  // ── Zoom state (Reanimated, driven off the UI thread by gesture-handler) ──
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const clampTranslate = useCallback((tx: number, ty: number, s: number) => {
    'worklet';
    const maxX = (screenW * (s - 1)) / 2;
    const maxY = (screenH * (s - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty)),
    };
  }, [screenW, screenH]);

  // Switching photos always starts the new one unzoomed, regardless of how
  // the previous photo was left.
  useEffect(() => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = useCallback((x: number) => {
    setIndex(activeIndex + (x < screenW / 2 ? -1 : 1));
  }, [activeIndex, screenW, setIndex]);

  const toggleZoom = useCallback((x: number, y: number) => {
    if (savedScale.value > 1) {
      scale.value = withTiming(1);
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      return;
    }
    const dx = -(x - screenW / 2) * (DOUBLE_TAP_SCALE - 1);
    const dy = -(y - screenH / 2) * (DOUBLE_TAP_SCALE - 1);
    const clamped = clampTranslate(dx, dy, DOUBLE_TAP_SCALE);
    scale.value = withTiming(DOUBLE_TAP_SCALE);
    translateX.value = withTiming(clamped.x);
    translateY.value = withTiming(clamped.y);
    savedScale.value = DOUBLE_TAP_SCALE;
    savedTranslateX.value = clamped.x;
    savedTranslateY.value = clamped.y;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenW, screenH, clampTranslate]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      runOnJS(toggleZoom)(e.x, e.y);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(doubleTap)
    .onEnd((e) => {
      if (savedScale.value === 1) runOnJS(navigate)(e.x);
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      const settled = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value));
      const clamped = clampTranslate(translateX.value, translateY.value, settled);
      scale.value = withTiming(settled);
      translateX.value = withTiming(clamped.x);
      translateY.value = withTiming(clamped.y);
      savedScale.value = settled;
      savedTranslateX.value = clamped.x;
      savedTranslateY.value = clamped.y;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      const clamped = clampTranslate(
        savedTranslateX.value + e.translationX,
        savedTranslateY.value + e.translationY,
        savedScale.value,
      );
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(Gesture.Race(pinch, doubleTap, singleTap), pan);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={composed}>
        <Animated.View style={StyleSheet.absoluteFill}>
          {photo && (
            <Animated.Image source={{ uri: photo }} style={[StyleSheet.absoluteFill, imageStyle]} resizeMode="cover" />
          )}
        </Animated.View>
      </GestureDetector>

      <View style={[styles.progressRow, { top: topInset + 10 }]} pointerEvents="none">
        {photos.map((_, i) => (
          <View key={i} style={[styles.progressSeg, i === activeIndex && styles.progressActive]} />
        ))}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  progressRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 4, zIndex: 10 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  progressActive: { backgroundColor: '#C9A84C' },
});
