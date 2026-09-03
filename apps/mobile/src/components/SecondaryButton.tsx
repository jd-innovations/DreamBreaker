import React from 'react';
import {
  Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text as type } from '@shared/tokens';

/**
 * SecondaryButton — white background, gold border, navy text, radius 10 (shape.cta).
 * The single canonical secondary action.
 */
export function SecondaryButton({
  label, onPress, icon, disabled, style, textStyle,
}: {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}) {
  return (
    <TouchableOpacity
      style={[s.btn, disabled && s.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {icon && <Ionicons name={icon} size={18} color={colors.navy} />}
      <Text style={[s.text, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.gold,
    borderRadius: shape.cta, paddingHorizontal: 24, paddingVertical: 13.5,
  },
  disabled: { opacity: 0.5 },
  text: { color: colors.navy, fontSize: type.actionLarge.size, fontWeight: '800' },
});

export default SecondaryButton;
