import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { usePurchaseHistory } from '@/hooks/usePurchaseHistory';
import type { Purchase, PurchasePurposeType } from '@/lib/paymentTypes';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

/**
 * Every purchase, and the way into each receipt.
 *
 * "View All Purchases" on payments-settings carried a `TODO: no full-history
 * route exists yet` and opened nothing; that screen shows a capped preview.
 *
 * `?filter=refunded` backs the Refund History row. A filtered view rather than
 * a separate screen over the refunds table: every refund belongs to a payment,
 * and the payment already carries what came back. Two screens reading two
 * sources would eventually disagree.
 */

const PURPOSE_META: Record<PurchasePurposeType, { label: string; icon: string }> = {
  tournament_registration_entry: { label: 'Tournament entry', icon: 'trophy-outline' },
  tournament_registration_hold: { label: 'Tournament hold', icon: 'time-outline' },
  tournament_registration_balance: { label: 'Tournament balance', icon: 'trophy-outline' },
  tournament_team_entry: { label: 'Team entry', icon: 'people-outline' },
  coach_offer_purchase: { label: 'Lesson', icon: 'school-outline' },
  reservation_payment: { label: 'Court reservation', icon: 'calendar-outline' },
};

function formatCents(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
    .format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Row({ purchase }: { purchase: Purchase }) {
  const meta = PURPOSE_META[purchase.purposeType] ?? { label: 'Purchase', icon: 'card-outline' };
  const refunded = purchase.refundedCents > 0;

  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.7}
      onPress={() => router.push(`/payments/receipt/${purchase.id}` as never)}
    >
      <View style={s.iconWrap}>
        <Ionicons name={meta.icon as never} size={18} color={colors.gold} />
      </View>
      <View style={s.rowBody}>
        <Text style={s.rowLabel}>{meta.label}</Text>
        {!!purchase.subtitle && <Text style={s.rowSub} numberOfLines={1}>{purchase.subtitle}</Text>}
        <Text style={s.rowDate}>{formatDate(purchase.paidAt)}</Text>
      </View>
      <View style={s.amountCol}>
        <Text style={s.amount}>{formatCents(purchase.amountCents, purchase.currency)}</Text>
        {refunded && (
          <Text style={s.refundNote}>
            {purchase.status === 'refunded'
              ? 'Refunded'
              : `${formatCents(purchase.refundedCents, purchase.currency)} refunded`}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function PurchaseHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  // No limit: this is the full list the preview links to.
  const { purchases, loading, refreshing, error, refresh } = usePurchaseHistory();

  const refundedOnly = filter === 'refunded';
  const visible = useMemo(
    () => (refundedOnly ? purchases.filter((p) => p.refundedCents > 0) : purchases),
    [purchases, refundedOnly],
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{refundedOnly ? 'Refunds' : 'Purchases'}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.gold} size="large" /></View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={s.emptyText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <Row purchase={item} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name={refundedOnly ? 'cash-outline' : 'receipt-outline'} size={48} color={colors.textMuted} />
              {/* Two different empty states. "No refunds" is good news; "no
                  purchases" is just an empty account, and saying the wrong one
                  would read as something having gone missing. */}
              <Text style={s.emptyText}>
                {refundedOnly ? 'Nothing has been refunded.' : 'No purchases yet.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { width: 22, alignItems: 'flex-start' },
  headerTitle: { color: colors.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: { color: colors.textMuted, fontSize: text.body.size, fontWeight: '500' },

  list: { padding: spacing.lg },
  sep: { height: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.goldBg, alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { color: colors.text, fontSize: text.body.size, fontWeight: '700' },
  rowSub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },
  rowDate: { color: colors.textMuted, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  amountCol: { alignItems: 'flex-end' },
  amount: { color: colors.navy, fontSize: text.body.size, fontWeight: '800' },
  refundNote: { color: colors.textMuted, fontSize: text.caption.size, fontWeight: '600', marginTop: 2 },
});
