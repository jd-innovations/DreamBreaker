import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

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
  title: { fontSize: text.sectionTitle.size, fontWeight: '900', color: colors.navy, marginBottom: 12, marginTop: 4 },
  card: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: shape.card, overflow: 'hidden',
  },
  padded: { padding: 14 },
});

export default SectionCard;
