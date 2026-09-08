import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';
import { getWalletSectionLabel, type WalletDashboardSection } from '@/lib/walletItemStatus';
import { WalletCard } from './WalletCard';
import type { WalletItem } from '@/lib/walletTypes';

export function WalletSection({ section, items }: { section: WalletDashboardSection; items: WalletItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={s.root}>
      <View style={s.headerRow}>
        <Text style={s.title}>{getWalletSectionLabel(section).toUpperCase()}</Text>
        <View style={s.badge}>
          <Text style={s.badgeText}>{items.length}</Text>
        </View>
      </View>
      {items.map(item => <WalletCard key={item.id} item={item} />)}
    </View>
  );
}

const s = StyleSheet.create({
  root: { marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { color: colors.navy, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
  badge: { backgroundColor: colors.goldBg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: colors.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },
});
