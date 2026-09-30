import React from 'react';
import { ActivityIndicator, Pressable, Text, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
 * Sizes: default is the in-card `action` role (13/800, 16pt icon) so two fit
 * side by side; `size="large"` is `actionLarge` (16/800, 18pt icon) for a
 * full-width button. The label may shrink 15% before truncating, for larger
 * system text sizes.
 *
 * Light haptic on touch-down like the other CTAs. Not built on PressableCTA:
 * its 18% pulse is sized for small icon buttons and jumps on a wide button, so
 * this uses a slight press-down instead.
 */
export function SoftButton({
  label, icon, onPress, disabled, loading, style, accessibilityLabel, size = 'default',
}: {
  label: string;
  /** Shows a spinner in place of the icon and blocks presses. */
  loading?: boolean;
  size?: 'default' | 'large';
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  /** Outer box: width / flex / margins. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const large = size === 'large';
  return (
    <Pressable
      onPressIn={() => { if (!disabled && !loading) haptics.light(); }}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [s.box, pressed && s.pressed, disabled && s.disabled, style]}
    >
      <LinearGradient colors={[...gradients.ctaSoft]} style={[s.fill, large && s.fillLarge]}>
        <View style={s.row}>
          {loading
            ? <ActivityIndicator size="small" color={colors.navy} />
            : icon && <Ionicons name={icon} size={large ? 18 : 16} color={colors.goldDeep} />}
          <Text
            style={[s.label, large && s.labelLarge]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {label}
          </Text>
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
  fill: { paddingHorizontal: 12, paddingVertical: 12 },
  fillLarge: { paddingHorizontal: 16, paddingVertical: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { color: colors.navy, fontSize: type.action.size, fontWeight: '800', flexShrink: 1 },
  labelLarge: { fontSize: type.actionLarge.size },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});

export default SoftButton;
