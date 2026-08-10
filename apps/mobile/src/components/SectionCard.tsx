import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, typography } from '@/theme';

/**
 * SectionCard — canonical bordered card (radius 16) with an optional
 * section title rendered above it. Used in Community Play, Player Profile,
 * Marketplace, Tournament Detail.
 */
export function SectionCard({
  title, children, style, padded = false,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /** add internal padding (off by default so list rows can sit flush) */
  padded?: boolean;
}) {
  return (
    <View>
      {title && <Text style={s.title}>{title}</Text>}
      <View style={[s.card, padded && s.padded, style]}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  title: { ...typography.sectionTitle, color: colors.navy, marginBottom: 12, marginTop: 4 },
  card: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.card, overflow: 'hidden',
  },
  padded: { padding: 14 },
});

export default SectionCard;
