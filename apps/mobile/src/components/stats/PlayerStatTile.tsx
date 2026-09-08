import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

export function PlayerStatTile({
  icon,
  label,
  value,
}: {
  icon: AppIconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.tile}>
      <AppIcon name={icon} size={22} color={colors.gold} />
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 86,
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(10,18,40,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  value: {
    color: colors.playerCredentialText,
    fontSize: text.actionLarge.size, fontWeight: '800',
    marginTop: spacing.xs,
  },
  label: {
    color: colors.playerCredentialMuted,
    marginTop: 1,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '800',
  },
});