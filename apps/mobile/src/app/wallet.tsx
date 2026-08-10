import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
import { WalletSection, WalletEmptyState, WalletSkeleton } from '@/components';
import { useWallet } from '@/hooks/useWallet';
import { groupWalletItems } from '@/lib/walletItemStatus';
import { useSupportContext } from '@/lib/support/supportContext';

const L = {
  bg:       colors.bg,
  page:     colors.page,
  navy:     colors.navy,
  textSub:  colors.textSub,
  border:   colors.border,
  danger:   colors.danger,
  dangerBg: colors.dangerBg,
};

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { items, loading, refreshing, error, refresh } = useWallet();

  useSupportContext({ feature: 'wallet' });

  const sections = groupWalletItems(items);
  const isEmpty = !loading && !error && items.length === 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack('/(tabs)/profile')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        {!!error && (
          <View style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={L.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {loading && items.length === 0 ? (
          <WalletSkeleton />
        ) : isEmpty ? (
          <WalletEmptyState />
        ) : (
          sections.map(({ section, items: sectionItems }) => (
            <WalletSection key={section} section={section} items={sectionItems} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.dangerBg, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  errorText: { color: L.danger, fontSize: 13, fontWeight: '600', flex: 1 },
});
