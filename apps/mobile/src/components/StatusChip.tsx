import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/theme';

export type StatusVariant = 'gold' | 'green' | 'gray' | 'navy' | 'red';

const VARIANTS: Record<StatusVariant, { bg: string; border: string; fg: string }> = {
  gold:  { bg: colors.goldBg,    border: colors.goldBorder,        fg: colors.gold    },
  green: { bg: colors.successBg, border: 'rgba(34,197,94,0.35)',   fg: colors.success },
  gray:  { bg: '#EEF2F9',        border: colors.border,            fg: colors.textSub },
  navy:  { bg: colors.navy,      border: colors.navy,              fg: colors.white   },
  red:   { bg: colors.dangerBg,  border: 'rgba(239,68,68,0.35)',   fg: colors.danger  },
};

/**
 * StatusChip — pill used for invite/event/player statuses.
 * Variants: gold | green | gray | navy.
 */
export function StatusChip({
  label, variant = 'gray', icon, style,
}: {
  label: string;
  variant?: StatusVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const v = VARIANTS[variant];
  return (
    <View style={[s.chip, { backgroundColor: v.bg, borderColor: v.border }, style]}>
      {icon && <Ionicons name={icon} size={13} color={v.fg} />}
      <Text style={[s.text, { color: v.fg }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: radius.chip,
    paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700' },
});

export default StatusChip;
