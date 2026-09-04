import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconCircle } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

/**
 * SettingsRow — canonical row for settings & menu lists.
 * Standardizes the icon circle (40x40), label (15/500) and sub (12/textSub).
 * Used across Profile, Location, Communication, Notifications, Permissions, Payments.
 */
export function SettingsRow({
  icon, label, sub, value, onPress, showChevron = true, iconColor = colors.gold,
  iconBg = colors.goldBg, right, last,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  iconColor?: string;
  iconBg?: string;
  right?: React.ReactNode;
  last?: boolean;
}) {
  const Container: any = onPress ? TouchableOpacity : View;
  return (
    <Container
      style={[s.row, !last && s.rowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && (
        <View style={[s.iconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
      )}
      <View style={s.body}>
        <Text style={s.label}>{label}</Text>
        {sub && <Text style={s.sub}>{sub}</Text>}
      </View>
      {right}
      {value && <Text style={s.value}>{value}</Text>}
      {showChevron && onPress && (
        <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
      )}
    </Container>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconCircle: {
    width: iconCircle.standard, height: iconCircle.standard,
    borderRadius: iconCircle.standard / 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  body: { flex: 1 },
  label: { color: colors.navy, fontSize: text.body.size, fontWeight: '500' },
  sub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  value: { color: colors.textSub, fontSize: text.body.size, fontWeight: '500' },
});

export default SettingsRow;
