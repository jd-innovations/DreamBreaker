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
import { formatCents } from '@shared/money';

/**
 * A receipt for one payment.
 *
 * Redesigned 2026-09-17 to read like an itemized store receipt for the one
 * purpose type that actually has line items to itemize (court reservations —
 * see ReceiptLineItem's own comment in lib/supabase/payments.ts for why).
 * Every other purpose type (tournament entries, lessons, team entries) only
 * ever stored one lump amount server-side, so their receipt is the same
 * "amount + refunds" card this screen has always shown — restyled to match,
 * not rebuilt, since there is nothing further to itemize without inventing
 * numbers the product never charged separately.
 *
 * Deliberately NOT shown, because the data does not exist anywhere in this
 * product: a club logo (facilities has no logo/cover-photo field), a tax
 * line (nothing charges or tracks sales tax today), or a member number
 * (profiles has no such field). Card brand/last4 IS shown when present —
 * captured from Stripe at payment_intent.succeeded as of the same migration
 * that added this redesign; a payment that succeeded before that will show
 * no card line rather than a guess.
 *
 * Still not a PDF: expo-print is not installed, so Share.share() (Mail,
 * Files, Notes, anything else the OS offers) remains the "I need a copy"
 * mechanism.
 */

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
  reservation_join_fee: 'Court reservation',
};

function cardLabel(brand: string, last4: string): string {
  return `${brand.charAt(0).toUpperCase()}${brand.slice(1)} •••• ${last4}`;
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={[s.lineLabel, strong && s.lineLabelStrong]}>{label}</Text>
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
    ];
    if (receipt.lineItem) {
      lines.push(
        receipt.lineItem.whenLabel,
        `Subtotal: ${formatCents(receipt.lineItem.subtotalCents, { currency: receipt.currency })}`,
        `Convenience Fee: ${formatCents(receipt.lineItem.serviceFeeCents, { currency: receipt.currency })}`,
        `Total: ${formatCents(receipt.lineItem.totalCents, { currency: receipt.currency })}`,
      );
    } else {
      lines.push(`Amount: ${formatCents(receipt.amountCents, { currency: receipt.currency })}`);
    }
    for (const r of receipt.refunds) {
      lines.push(`Refunded ${formatCents(r.amountCents, { currency: receipt.currency })} on ${formatWhen(r.at)}`);
    }
    if (receipt.refundedCents > 0) {
      lines.push(`Net: ${formatCents(receipt.amountCents - receipt.refundedCents, { currency: receipt.currency })}`);
    }
    if (receipt.cardBrand && receipt.cardLast4) {
      lines.push('', cardLabel(receipt.cardBrand, receipt.cardLast4));
    }
    if (receipt.payerName) {
      lines.push(`Paid online by ${receipt.payerName}`);
    }
    if (receipt.reference) {
      lines.push('', `Reference: ${receipt.reference}`);
    }
    Share.share({ message: lines.filter((l) => l !== '').join('\n') })
      .catch(() => Alert.alert('Could not share', 'Please try again.'));
  }

  const net = receipt ? receipt.amountCents - receipt.refundedCents : 0;

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      {/* Safe-area inset on the HEADER, not the root, so the white header
          colour runs to the top of the screen. Pattern from wallet.tsx. */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
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
          {/* ── Business header ── */}
          <View style={s.businessBlock}>
            <Ionicons name="receipt-outline" size={28} color={colors.gold} />
            {!!receipt.subtitle && <Text style={s.businessName}>{receipt.subtitle}</Text>}
            <Text style={s.title}>{PURPOSE_LABEL[receipt.purposeType] ?? 'Purchase'}</Text>
          </View>

          <View style={s.rule} />

          {/* ── Itemized card (reservations only) ── */}
          {receipt.lineItem ? (
            <View style={s.card}>
              <Text style={s.itemTitle}>{receipt.subtitle ?? PURPOSE_LABEL[receipt.purposeType] ?? 'Purchase'}</Text>
              {!!receipt.lineItem.whenLabel && <Text style={s.itemWhen}>{receipt.lineItem.whenLabel}</Text>}

              <View style={s.ruleDashed} />

              <Line label="Subtotal" value={formatCents(receipt.lineItem.subtotalCents, { currency: receipt.currency })} />
              <Line label="Convenience Fee" value={formatCents(receipt.lineItem.serviceFeeCents, { currency: receipt.currency })} />

              {receipt.refunds.map((r) => (
                <Line
                  key={r.id}
                  label={`Refunded ${formatWhen(r.at)}`}
                  value={`-${formatCents(r.amountCents, { currency: receipt.currency })}`}
                />
              ))}
              {receipt.refunds.length === 0 && receipt.refundedCents > 0 && (
                <Line label="Refunded" value={`-${formatCents(receipt.refundedCents, { currency: receipt.currency })}`} />
              )}

              <View style={s.rule} />
              <Line
                label={receipt.refundedCents > 0 ? 'Net' : 'Total'}
                value={formatCents(receipt.refundedCents > 0 ? net : receipt.lineItem.totalCents, { currency: receipt.currency })}
                strong
              />
            </View>
          ) : (
            /* ── Simple card — every other purpose type; nothing to itemize ── */
            <View style={s.card}>
              {!!receipt.subtitle && <Text style={s.itemTitle}>{receipt.subtitle}</Text>}
              <Line label="Amount" value={formatCents(receipt.amountCents, { currency: receipt.currency })} />

              {receipt.refunds.map((r) => (
                <Line
                  key={r.id}
                  label={`Refunded ${formatWhen(r.at)}`}
                  value={`-${formatCents(r.amountCents, { currency: receipt.currency })}`}
                />
              ))}
              {receipt.refunds.length === 0 && receipt.refundedCents > 0 && (
                <Line label="Refunded" value={`-${formatCents(receipt.refundedCents, { currency: receipt.currency })}`} />
              )}

              {receipt.refundedCents > 0 && (
                <>
                  <View style={s.rule} />
                  <Line label="Net" value={formatCents(net, { currency: receipt.currency })} strong />
                </>
              )}
            </View>
          )}

          {/* ── Payment method + who paid + when ── */}
          <View style={s.metaBlock}>
            {receipt.cardBrand && receipt.cardLast4 && (
              <View style={s.metaRow}>
                <Ionicons name="card-outline" size={14} color={colors.textSub} />
                <Text style={s.metaText}>{cardLabel(receipt.cardBrand, receipt.cardLast4)}</Text>
              </View>
            )}
            <Text style={s.metaMuted}>{formatWhen(receipt.paidAt)}</Text>
            {!!receipt.payerName && <Text style={s.metaMuted}>Paid online by {receipt.payerName}</Text>}
          </View>

          {!!receipt.reference && (
            <View style={s.refBlock}>
              <Text style={s.refLabel}>Reference</Text>
              {/* Selectable because the one time anyone needs this, they are
                  pasting it into a support message. */}
              <Text style={s.refValue} selectable>{receipt.reference}</Text>
            </View>
          )}

          {!receipt.cardBrand && (
            <Text style={s.footnote}>
              Card details are not available for this payment.
            </Text>
          )}
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

  businessBlock: { alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  businessName: { color: colors.navy, fontSize: text.titleSm.size, fontWeight: '900', textAlign: 'center' },
  title: { color: colors.textSub, fontSize: text.body.size, fontWeight: '600' },

  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  ruleDashed: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderBottomColor: colors.border,
    marginVertical: spacing.sm,
  },

  card: {
    backgroundColor: colors.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
  },
  itemTitle: { color: colors.navy, fontSize: text.body.size, fontWeight: '800' },
  itemWhen: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },

  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  lineLabel: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', flexShrink: 1 },
  lineLabelStrong: { color: colors.navy, fontWeight: '900' },
  lineValue: { color: colors.text, fontSize: text.body.size, fontWeight: '600' },
  lineValueStrong: { color: colors.navy, fontWeight: '900' },

  metaBlock: { marginTop: spacing.lg, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '600' },
  metaMuted: { color: colors.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  refBlock: { marginTop: spacing.lg },
  refLabel: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '700' },
  refValue: { color: colors.text, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },

  footnote: {
    color: colors.textMuted, fontSize: text.caption.size, fontWeight: '500',
    marginTop: spacing.xl, lineHeight: 18,
  },
});
