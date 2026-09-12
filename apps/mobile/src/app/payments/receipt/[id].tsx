import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { fetchReceipt, type Receipt } from '@/lib/supabase/payments';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

/**
 * A receipt for one payment.
 *
 * This is what "Download Receipts" was reaching for. It is not a PDF:
 * expo-print is not installed, so a PDF would mean a native dependency and a
 * new build. Share.share() hands the same information to Mail, Files, Notes or
 * anything else the OS offers, which covers "I need a copy of this" without
 * one.
 *
 * It also gives the purchase rows on payments-settings somewhere to go. They
 * have always rendered a chevron and done nothing when tapped.
 */

function formatCents(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
    .format(cents / 100);
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const PURPOSE_LABEL: Record<string, string> = {
  tournament_registration_entry: 'Tournament entry',
  tournament_registration_hold: 'Tournament hold',
  tournament_registration_balance: 'Tournament balance',
  tournament_team_entry: 'Team entry',
  coach_offer_purchase: 'Lesson',
  reservation_payment: 'Court reservation',
};

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={[s.lineValue, strong && s.lineValueStrong]}>{value}</Text>
    </View>
  );
}

export default function ReceiptScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchReceipt(id)
      .then((r) => { if (!cancelled) { setReceipt(r); setFailed(r === null); } })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  function share() {
    if (!receipt) return;
    const lines = [
      'Pickleball App receipt',
      '',
      PURPOSE_LABEL[receipt.purposeType] ?? 'Purchase',
      receipt.subtitle ?? '',
      formatWhen(receipt.paidAt),
      '',
      `Amount: ${formatCents(receipt.amountCents, receipt.currency)}`,
    ];
    for (const r of receipt.refunds) {
      lines.push(`Refunded ${formatCents(r.amountCents, receipt.currency)} on ${formatWhen(r.at)}`);
    }
    if (receipt.refundedCents > 0) {
      lines.push(`Net: ${formatCents(receipt.amountCents - receipt.refundedCents, receipt.currency)}`);
    }
    if (receipt.reference) {
      lines.push('', `Reference: ${receipt.reference}`);
    }
    Share.share({ message: lines.filter((l) => l !== '').join('\n') })
      .catch(() => Alert.alert('Could not share', 'Please try again.'));
  }

  const net = receipt ? receipt.amountCents - receipt.refundedCents : 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Receipt</Text>
        {receipt ? (
          <TouchableOpacity onPress={share} hitSlop={10} accessibilityLabel="Share receipt">
            <Ionicons name="share-outline" size={22} color={colors.navy} />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.gold} size="large" /></View>
      ) : failed || !receipt ? (
        <View style={s.center}>
          <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
          <Text style={s.emptyText}>This receipt could not be loaded.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <Text style={s.title}>{PURPOSE_LABEL[receipt.purposeType] ?? 'Purchase'}</Text>
          {!!receipt.subtitle && <Text style={s.subtitle}>{receipt.subtitle}</Text>}
          <Text style={s.when}>{formatWhen(receipt.paidAt)}</Text>

          <View style={s.card}>
            <Line label="Amount" value={formatCents(receipt.amountCents, receipt.currency)} />

            {/* Each refund separately. The payment row carries only a summed
                refunded_amount_cents, and two partial refunds on one purchase
                are two events a person may need to reconcile. */}
            {receipt.refunds.map((r) => (
              <Line
                key={r.id}
                label={`Refunded ${formatWhen(r.at)}`}
                value={`-${formatCents(r.amountCents, receipt.currency)}`}
              />
            ))}

            {/* Falls back to the aggregate when the refunds themselves could
                not be read — better than showing a total that ignores money
                already returned. */}
            {receipt.refunds.length === 0 && receipt.refundedCents > 0 && (
              <Line label="Refunded" value={`-${formatCents(receipt.refundedCents, receipt.currency)}`} />
            )}

            {receipt.refundedCents > 0 && (
              <>
                <View style={s.rule} />
                <Line label="Net" value={formatCents(net, receipt.currency)} strong />
              </>
            )}
          </View>

          {!!receipt.reference && (
            <View style={s.refBlock}>
              <Text style={s.refLabel}>Reference</Text>
              {/* Selectable because the one time anyone needs this, they are
                  pasting it into a support message. */}
              <Text style={s.refValue} selectable>{receipt.reference}</Text>
            </View>
          )}

          <Text style={s.footnote}>
            Card details are not stored with a payment, so they are not shown here.
          </Text>
        </ScrollView>
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

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: text.body.size, fontWeight: '500' },

  scroll: { padding: spacing.lg },
  title: { color: colors.navy, fontSize: text.titleSm.size, fontWeight: '900' },
  subtitle: { color: colors.text, fontSize: text.body.size, fontWeight: '600', marginTop: 2 },
  when: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 4 },

  card: {
    backgroundColor: colors.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginTop: spacing.lg,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  lineLabel: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', flexShrink: 1 },
  lineValue: { color: colors.text, fontSize: text.body.size, fontWeight: '600' },
  lineValueStrong: { color: colors.navy, fontWeight: '900' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },

  refBlock: { marginTop: spacing.lg },
  refLabel: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '700' },
  refValue: { color: colors.text, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },

  footnote: {
    color: colors.textMuted, fontSize: text.caption.size, fontWeight: '500',
    marginTop: spacing.xl, lineHeight: 18,
  },
});
