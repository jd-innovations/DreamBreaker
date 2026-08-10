import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

export function WalletEmptyState() {
  return (
    <View style={s.root}>
      <View style={s.iconWrap}>
        <Ionicons name="wallet-outline" size={44} color={colors.textSub} />
      </View>
      <Text style={s.title}>Nothing in your wallet yet</Text>
      <Text style={s.sub}>
        Credits, memberships, and offers you earn or unlock will show up here.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.page,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { color: colors.navy, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  sub: { color: colors.textSub, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
