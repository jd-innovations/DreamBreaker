import React from 'react';
import {
  Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/theme';

/**
 * PrimaryButton — navy background, white text, radius 14.
 * The single canonical primary call-to-action.
 */
export function PrimaryButton({
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
      activeOpacity={0.88}
    >
      {icon && <Ionicons name={icon} size={18} color={colors.white} />}
      <Text style={[s.text, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.navy, borderRadius: radius.button,
    paddingHorizontal: 24, paddingVertical: 15,
  },
  disabled: { opacity: 0.5 },
  text: { color: colors.white, fontSize: 16, fontWeight: '700' },
});

export default PrimaryButton;
