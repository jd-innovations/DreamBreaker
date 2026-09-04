import React from 'react';
import { Pressable, View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { AppIcon, type AppIconName } from './AppIcon';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type GlassQuickActionProps = {
  icon: AppIconName;
  label: string;
  tintColor: string;
  onPress?: () => void;
  /** Circle diameter. Defaults to 76 per the Liquid Glass spec; pass the
   * current app's existing icon size to preserve an established layout. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Premium "Liquid Glass" quick-action button: frosted BlurView + tinted wash
 * + gloss highlight + border, all clipped to a circle, with a soft shadow on
 * an unclipped wrapper (shadows don't render through overflow:hidden).
 */
export function GlassQuickAction({ icon, label, tintColor, onPress, size = 76, style }: GlassQuickActionProps) {
  const scale = useSharedValue(1);
  const blur = useSharedValue(38);
  const shadowOpacity = useSharedValue(0.16);

  const pressableStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: shadowOpacity.value,
  }));

  const blurProps = useAnimatedProps(() => ({
    intensity: blur.value,
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.96, { duration: 90 });
    blur.value = withTiming(58, { duration: 120 });
    shadowOpacity.value = withTiming(0.24, { duration: 120 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 220 });
    blur.value = withTiming(38, { duration: 200 });
    shadowOpacity.value = withTiming(0.16, { duration: 200 });
  };

  const radius = size / 2;

  return (
    <View style={[styles.wrap, { width: Math.max(size, 68) }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ width: size, height: size, alignSelf: 'center' }}
      >
        <Animated.View style={[styles.shadowLayer, { width: size, height: size, borderRadius: radius }, shadowStyle, pressableStyle]}>
          <View style={[styles.clip, { width: size, height: size, borderRadius: radius }]}>
            <AnimatedBlurView animatedProps={blurProps} tint="light" style={StyleSheet.absoluteFill} />

            {/* Tinted glass wash */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: hexToRgba(tintColor, 0.14) },
              ]}
            />

            {/* Upper-left gloss highlight */}
            <LinearGradient
              colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
              start={{ x: 0.12, y: 0.05 }}
              end={{ x: 0.75, y: 0.65 }}
              style={StyleSheet.absoluteFill}
            />

            {/* Inner shadow suggestion: a soft dark ring fading inward from the edge */}
            <LinearGradient
              colors={['rgba(10,18,40,0.10)', 'rgba(10,18,40,0)']}
              start={{ x: 0.85, y: 0.9 }}
              end={{ x: 0.4, y: 0.4 }}
              style={StyleSheet.absoluteFill}
            />

            {/* Thin colored border */}
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: radius, borderWidth: 1.25, borderColor: hexToRgba(tintColor, 0.32) },
              ]}
            />

            <View style={styles.iconLayer}>
              <AppIcon name={icon} size={28} color={colors.navy} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  shadowLayer: {
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 6 },
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
  label: {
    fontSize: text.microLabel.size,
    fontWeight: '700',
    color: colors.navy,
    textAlign: 'center',
    lineHeight: 14,
  },
});
