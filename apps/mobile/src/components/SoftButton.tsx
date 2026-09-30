import React from 'react';
import { Pressable, Text, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '@/theme';
import { haptics } from '@/lib/haptics';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text as type } from '@shared/tokens';

/**
 * SoftButton — a quiet utility action: white-to-light-grey fill, hairline grey
 * border, navy label, deep-gold icon, standard CTA radius (shape.cta).
 * First used for the location actions (Get Directions, View Facility),
 * owner's choice 2026-09-30.
 *
 * Light haptic on touch-down like the other CTAs. Not built on PressableCTA:
 * its 18% pulse is sized for small icon buttons and jumps on a wide button, so
 * this uses a slight press-down instead.
 */
export function SoftButton({
  label, icon, onPress, disabled, style, accessibilityLabel,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  /** Outer box: width / flex / margins. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPressIn={() => { if (!disabled) haptics.light(); }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [s.box, pressed && s.pressed, disabled && s.disabled, style]}
    >
      <LinearGradient colors={[...gradients.ctaSoft]} style={s.fill}>
        <View style={s.row}>
          {icon && <Ionicons name={icon} size={18} color={colors.goldDeep} />}
          <Text style={s.label} numberOfLines={1}>{label}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const s = StyleSheet.create({
  box: {
    borderRadius: shape.cta,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  fill: { paddingHorizontal: 16, paddingVertical: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { color: colors.navy, fontSize: type.actionLarge.size, fontWeight: '800', flexShrink: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});

export default SoftButton;
