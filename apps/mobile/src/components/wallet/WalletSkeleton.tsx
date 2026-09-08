import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

function SkeletonCard() {
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.avatar} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[s.bar, { width: '60%' }]} />
          <View style={[s.bar, { width: '40%', height: 8 }]} />
        </View>
      </View>
      <View style={[s.bar, { width: '90%', marginTop: 12 }]} />
    </View>
  );
}

export function WalletSkeleton() {
  return (
    <View>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.card, padding: 14, marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.page },
  bar: { height: 12, borderRadius: 6, backgroundColor: colors.page },
});
