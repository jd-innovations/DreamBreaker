import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, useTheme } from '@/theme';

// The one floating round button: frosted glass, no outline, icon only.
// Used by the Help launcher (support/FloatingSupportButton) and Events ->
// Create, so the two can't drift apart again. Position is the caller's job:
// wrap it in an absolutely positioned View.

const SIZE_FULL = 52;
const SIZE_MINIMIZED = 40;

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  minimized?: boolean;
};

export function FloatingCircleButton({ icon, onPress, accessibilityLabel, accessibilityHint, minimized }: Props) {
  const { roles, scheme } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduceMotion(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function handlePressIn() {
    scale.value = reduceMotion ? 0.96 : withTiming(0.96, { duration: 90 });
  }
  function handlePressOut() {
    scale.value = reduceMotion ? 1 : withSpring(1, { damping: 14, stiffness: 220 });
  }

  const size = minimized ? SIZE_MINIMIZED : SIZE_FULL;
  const iconSize = minimized ? 20 : 24;
  const radius = size / 2;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Animated.View style={[styles.shadowLayer, { width: size, height: size, borderRadius: radius }, animatedStyle]}>
        <View style={[styles.clip, { width: size, height: size, borderRadius: radius }]}>
          <BlurView tint={scheme === 'dark' ? 'dark' : 'light'} intensity={44} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,18,40,0.14)' }]} />
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0.15, y: 0.05 }}
            end={{ x: 0.8, y: 0.7 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.iconLayer}>
            <Ionicons name={icon} size={iconSize} color={roles.textPrimary} />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadowLayer: {
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  clip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
