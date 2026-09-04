import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
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
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* The safe-area inset lives on the HEADER, not the root, so the white
          header colour runs to the top of the screen. With it on the root the
          status-bar strip took the root's page grey and the header appeared to
          float below a grey band. */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
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
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.dangerBg, borderRadius: shape.panel, padding: 12, marginBottom: 16,
  },
  errorText: { color: L.danger, fontSize: text.caption.size, fontWeight: '500', flex: 1 },
});
