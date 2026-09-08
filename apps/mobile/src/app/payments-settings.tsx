import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { usePurchaseHistory } from '@/hooks/usePurchaseHistory';
import type { Purchase, PurchasePurposeType } from '@/lib/paymentTypes';

// Theme-backed alias — brand values resolve from @/theme.
// purple/teal are payment-brand accent colors — documented exception.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  blue:       '#007AFF',
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
  purple:     '#6C3FC5',
  teal:       '#0B9E8A',
};

/** How many purchases the preview list shows before "View All". */
const PREVIEW_LIMIT = 3;

// ─── Purpose presentation ────────────────────────────────────────────────────
// purpose_type is free text in the database so new paid features don't need a
// migration; anything not listed here falls back to the generic entry below.

const PURPOSE_META: Record<PurchasePurposeType, { icon: string; bg: string; label: string }> = {
  tournament_registration_entry:   { icon: 'trophy',     bg: L.navy,   label: 'Tournament Registration' },
  tournament_registration_hold:    { icon: 'calendar',   bg: L.gold,   label: 'Hold My Spot Deposit' },
  tournament_registration_balance: { icon: 'trophy',     bg: L.navy,   label: 'Registration Balance' },
  tournament_team_entry:           { icon: 'people',     bg: L.navy,   label: 'Team Registration' },
  coach_offer_purchase:            { icon: 'bag',        bg: L.purple, label: 'Coach Marketplace' },
  reservation_payment:             { icon: 'tennisball', bg: L.teal,   label: 'Court Booking' },
};

const FALLBACK_META = { icon: 'card', bg: L.navy, label: 'Purchase' };

function metaFor(purposeType: PurchasePurposeType) {
  return PURPOSE_META[purposeType] ?? FALLBACK_META;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Div() {
  return <View style={s.div} />;
}

// ─── Visa logo ───────────────────────────────────────────────────────────────

function VisaLogo() {
  return (
    <View style={s.visaBox}>
      <Text style={s.visaText}>VISA</Text>
    </View>
  );
}

// ─── Colored icon circle (solid fill) ────────────────────────────────────────

function SolidCircle({
  name, bg,
}: {
  name: string; bg: string;
}) {
  return (
    <View style={[s.solidCircle, { backgroundColor: bg }]}>
      <Ionicons name={name as never} size={20} color="#FFFFFF" />
    </View>
  );
}

// ─── Outlined circle (for add row) ───────────────────────────────────────────

function OutlineCircle({ name }: { name: string }) {
  return (
    <View style={s.outlineCircle}>
      <Ionicons name={name as never} size={20} color={L.blue} />
    </View>
  );
}

// ─── Purchase row ────────────────────────────────────────────────────────────

function PurchaseRow({ purchase, last }: { purchase: Purchase; last?: boolean }) {
  const meta = metaFor(purchase.purposeType);
  const refunded = purchase.refundedCents > 0;

  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7}>
        <SolidCircle name={meta.icon} bg={meta.bg} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{meta.label}</Text>
          {purchase.subtitle ? <Text style={s.rowSub}>{purchase.subtitle}</Text> : null}
          <Text style={s.rowDate}>{formatDate(purchase.paidAt)}</Text>
        </View>
        <View style={s.amountCol}>
          <Text style={s.amount}>{formatCents(purchase.amountCents)}</Text>
          {/* Without this the row would show the original charge as if the
              money were still gone, which contradicts the user's statement. */}
          {refunded ? (
            <Text style={s.refundNote}>
              {purchase.status === 'refunded'
                ? 'Refunded'
                : `${formatCents(purchase.refundedCents)} refunded`}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// ─── Purchase history states ─────────────────────────────────────────────────

function StateRow({ children }: { children: React.ReactNode }) {
  return <View style={s.stateRow}>{children}</View>;
}

function PurchaseHistory({
  purchases, loading, error,
}: {
  purchases: Purchase[]; loading: boolean; error: string | null;
}) {
  if (loading) {
    return (
      <StateRow>
        <ActivityIndicator color={L.textMuted} />
      </StateRow>
    );
  }

  if (error) {
    return (
      <StateRow>
        <Text style={s.stateText}>{error}</Text>
      </StateRow>
    );
  }

  if (purchases.length === 0) {
    return (
      <StateRow>
        <Text style={s.stateText}>No purchases yet.</Text>
      </StateRow>
    );
  }

  return (
    <>
      {purchases.map((p, i) => (
        <PurchaseRow key={p.id} purchase={p} last={i === purchases.length - 1} />
      ))}
      <Div />
      {/* TODO: no full-history route exists yet — this opens nothing. */}
      <TouchableOpacity style={s.viewAllRow} activeOpacity={0.7}>
        <Text style={s.viewAllText}>View All Purchases</Text>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
      </TouchableOpacity>
    </>
  );
}

// ─── Nav row with solid circle ───────────────────────────────────────────────

function NavRow({
  iconName, iconBg, label, sub, last,
}: {
  iconName: string; iconBg: string;
  label: string; sub?: string; last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7}>
        <SolidCircle name={iconName} bg={iconBg} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function PaymentsSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { purchases, loading, refreshing, error, refresh } = usePurchaseHistory(PREVIEW_LIMIT);

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Payments</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <Text style={s.intro}>
          Manage your payment methods{'\n'}and view your purchase history.
        </Text>

        {/* ── Payment Methods ── */}
        {/* TODO: placeholder. No payment-methods table exists — saved cards
            need Stripe Customer/PaymentMethod support before this is real. */}
        <SectionHeader label="PAYMENT METHODS" />
        <Group>
          {/* Saved card */}
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <VisaLogo />
            <Text style={[s.rowLabel, { flex: 1 }]}>Visa •••• 4321</Text>
            <View style={s.defaultBadge}>
              <Text style={s.defaultText}>DEFAULT</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
          <Div />
          {/* Add method */}
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <OutlineCircle name="add" />
            <Text style={[s.rowLabel, { flex: 1 }]}>Add Payment Method</Text>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
          </TouchableOpacity>
        </Group>

        {/* Security note */}
        <View style={s.noteRow}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} style={{ marginTop: 1 }} />
          <Text style={s.noteText}>Your payment information is secure and encrypted.</Text>
        </View>

        {/* ── Purchase History ── */}
        <SectionHeader label="PURCHASE HISTORY" />
        <Group>
          <PurchaseHistory purchases={purchases} loading={loading} error={error} />
        </Group>

        {/* ── Refunds ── */}
        <SectionHeader label="REFUNDS" />
        <Group>
          <NavRow
            iconName="cash"
            iconBg={L.teal}
            label="Refund History"
            sub="View your past refunds"
            last
          />
        </Group>

        {/* ── Billing ── */}
        <SectionHeader label="BILLING" />
        <Group>
          <NavRow
            iconName="receipt"
            iconBg={L.gold}
            label="Download Receipts"
            sub="Get receipts for your purchases"
            last
          />
        </Group>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} style={{ marginTop: 2 }} />
          <Text style={s.footerText}>
            Questions about a charge? Contact support and we'll be happy to help.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  scroll: { padding: 20 },

  intro: {
    color: L.textMuted, fontSize: text.body.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 21, marginBottom: 4,
  },

  sectionHeader: {
    color: L.textMuted, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 24, paddingHorizontal: 4,
  },

  group: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  rowCenter: { flex: 1 },
  rowLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 2 },
  rowSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  rowDate: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },

  // Loading / empty / error placeholder inside a Group
  stateRow: {
    paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center',
  },
  stateText: {
    color: L.textMuted, fontSize: text.rowTitle.size, fontWeight: '700', textAlign: 'center', lineHeight: 20,
  },

  // Visa logo
  visaBox: {
    width: 52, height: 36, borderRadius: shape.badge,
    backgroundColor: '#1A1F71',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  visaText: {
    color: '#FFFFFF', fontSize: text.body.size, fontWeight: '500',
    letterSpacing: 1, fontStyle: 'italic',
  },

  // Default badge
  defaultBadge: {
    borderRadius: shape.pill, borderWidth: 1.5, borderColor: L.goldBorder,
    backgroundColor: L.goldBg, paddingHorizontal: 10, paddingVertical: 4,
  },
  defaultText: { color: L.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },

  // Solid circle icon
  solidCircle: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Outline circle for Add row
  outlineCircle: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 2, borderColor: L.blue,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Purchase amount
  amountCol: { alignItems: 'flex-end', marginRight: 2 },
  amount: { color: L.navy, fontSize: text.body.size, fontWeight: '500' },
  refundNote: { color: L.textMuted, fontSize: 11, fontWeight: '500', marginTop: 2 },

  // View all row
  viewAllRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 8,
  },
  viewAllText: { flex: 1, color: L.blue, fontSize: text.body.size, fontWeight: '500' },

  // Security / note
  noteRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, marginTop: 12, paddingHorizontal: 4,
  },
  noteText: {
    flex: 1, color: L.textMuted, fontSize: text.caption.size,
    fontWeight: '500', lineHeight: 18,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, marginTop: 28, paddingHorizontal: 4,
  },
  footerText: {
    flex: 1, color: L.textMuted, fontSize: text.caption.size,
    fontWeight: '500', lineHeight: 19,
  },
});
