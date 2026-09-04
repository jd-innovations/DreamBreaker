import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

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
  title: { color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900', textAlign: 'center' },
  sub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 21, textAlign: 'center' },
});
