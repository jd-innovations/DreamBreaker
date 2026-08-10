import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { WalletActivityEntry } from '@/lib/walletTypes';

const EVENT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  created:              'add-circle-outline',
  issued:               'add-circle-outline',
  activated:            'checkmark-circle-outline',
  viewed:               'eye-outline',
  opened:               'eye-outline',
  redemption_started:   'time-outline',
  partially_redeemed:   'pricetag-outline',
  redeemed:             'pricetag-outline',
  expired:              'alert-circle-outline',
  revoked:              'close-circle-outline',
  external_link_opened: 'open-outline',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function WalletActivityRow({ entry, last }: { entry: WalletActivityEntry; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <View style={s.iconWrap}>
        <Ionicons name={EVENT_ICON[entry.eventType] ?? 'ellipse-outline'} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{entry.title}</Text>
        {!!entry.description && <Text style={s.description}>{entry.description}</Text>}
        <Text style={s.date}>{formatDate(entry.createdAt)}</Text>
      </View>
      {entry.amount != null && (
        <Text style={s.amount}>
          {entry.currencyCode === 'USD' ? '$' : `${entry.currencyCode ?? ''} `}{entry.amount.toFixed(2)}
        </Text>
      )}
    </View>
  );
}

export function WalletActivityEmpty() {
  return <Text style={s.empty}>No activity yet.</Text>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconWrap: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.goldBg,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  title: { color: colors.navy, fontSize: 13, fontWeight: '700' },
  description: { color: colors.textSub, fontSize: 12, marginTop: 2 },
  date: { color: colors.textSub, fontSize: 11, marginTop: 4 },
  amount: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  empty: { color: colors.textSub, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
});
