import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

export type ProfileCompletionRingProps = {
  percent: number;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

// Wraps an avatar in a circular gauge — the arc fills clockwise from the top
// to show how complete the profile is, over a faint full-circle track.
export function ProfileCompletionRing({
  percent,
  size = 64,
  strokeWidth = 3,
  style,
  children,
}: ProfileCompletionRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const color = clamped >= 100 ? colors.success : colors.gold;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}
