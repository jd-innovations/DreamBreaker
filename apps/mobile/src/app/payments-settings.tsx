import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';

// Theme-backed alias â€” brand values resolve from @/theme.
// purple/teal are payment-brand accent colors â€” documented exception.
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

// â”€â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Div() {
  return <View style={s.div} />;
}

// â”€â”€â”€ Visa logo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function VisaLogo() {
  return (
    <View style={s.visaBox}>
      <Text style={s.visaText}>VISA</Text>
    </View>
  );
}

// â”€â”€â”€ Colored icon circle (solid fill) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Outlined circle (for add row) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function OutlineCircle({ name }: { name: string }) {
  return (
    <View style={s.outlineCircle}>
      <Ionicons name={name as never} size={20} color={L.blue} />
    </View>
  );
}

// â”€â”€â”€ Purchase row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PurchaseRow({
  iconName, iconBg, label, sub, date, amount, last,
}: {
  iconName: string; iconBg: string;
  label: string; sub: string; date: string;
  amount: string; last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity style={s.row} activeOpacity={0.7}>
        <SolidCircle name={iconName} bg={iconBg} />
        <View style={s.rowCenter}>
          <Text style={s.rowLabel}>{label}</Text>
          <Text style={s.rowSub}>{sub}</Text>
          <Text style={s.rowDate}>{date}</Text>
        </View>
        <Text style={s.amount}>{amount}</Text>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Nav row with solid circle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function PaymentsSettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* â”€â”€ Header â”€â”€ */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Payments</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <Text style={s.intro}>
          Manage your payment methods{'\n'}and view your purchase history.
        </Text>

        {/* â”€â”€ Payment Methods â”€â”€ */}
        <SectionHeader label="PAYMENT METHODS" />
        <Group>
          {/* Saved card */}
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <VisaLogo />
            <Text style={[s.rowLabel, { flex: 1 }]}>Visa â€¢â€¢â€¢â€¢ 4321</Text>
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

        {/* â”€â”€ Purchase History â”€â”€ */}
        <SectionHeader label="PURCHASE HISTORY" />
        <Group>
          <PurchaseRow
            iconName="trophy"
            iconBg={L.navy}
            label="Tournament Registration"
            sub="Florida Open"
            date="Jun 7, 2026"
            amount="$75.00"
          />
          <PurchaseRow
            iconName="calendar"
            iconBg={L.gold}
            label="Hold My Spot Deposit"
            sub="Summer Slam"
            date="Jun 3, 2026"
            amount="$15.00"
          />
          <PurchaseRow
            iconName="bag"
            iconBg={L.purple}
            label="Marketplace Promotion"
            sub="Boost Listing"
            date="May 28, 2026"
            amount="$4.99"
            last
          />
          <Div />
          {/* View All */}
          <TouchableOpacity style={s.viewAllRow} activeOpacity={0.7}>
            <Text style={s.viewAllText}>View All Purchases</Text>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
          </TouchableOpacity>
        </Group>

        {/* â”€â”€ Refunds â”€â”€ */}
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

        {/* â”€â”€ Billing â”€â”€ */}
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

        {/* â”€â”€ Footer â”€â”€ */}
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

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  backBtn:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText:    { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '700' },

  scroll: { padding: 20 },

  intro: {
    color: L.textMuted, fontSize: 14, fontWeight: '400',
    textAlign: 'center', lineHeight: 21, marginBottom: 4,
  },

  sectionHeader: {
    color: L.textMuted, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 24, paddingHorizontal: 4,
  },

  group: {
    backgroundColor: L.bg, borderRadius: 12,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  rowCenter: { flex: 1 },
  rowLabel:  { color: L.navy, fontSize: 15, fontWeight: '500', marginBottom: 2 },
  rowSub:    { color: L.textSub, fontSize: 12, fontWeight: '400' },
  rowDate:   { color: L.textMuted, fontSize: 12, fontWeight: '400', marginTop: 1 },

  // Visa logo
  visaBox: {
    width: 52, height: 36, borderRadius: 6,
    backgroundColor: '#1A1F71',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  visaText: {
    color: '#FFFFFF', fontSize: 15, fontWeight: '900',
    letterSpacing: 1, fontStyle: 'italic',
  },

  // Default badge
  defaultBadge: {
    borderRadius: 20, borderWidth: 1.5, borderColor: L.goldBorder,
    backgroundColor: L.goldBg, paddingHorizontal: 10, paddingVertical: 4,
  },
  defaultText: { color: L.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

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
  amount: { color: L.navy, fontSize: 15, fontWeight: '700', marginRight: 2 },

  // View all row
  viewAllRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 8,
  },
  viewAllText: { flex: 1, color: L.blue, fontSize: 15, fontWeight: '600' },

  // Security / note
  noteRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, marginTop: 12, paddingHorizontal: 4,
  },
  noteText: {
    flex: 1, color: L.textMuted, fontSize: 13,
    fontWeight: '400', lineHeight: 18,
  },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, marginTop: 28, paddingHorizontal: 4,
  },
  footerText: {
    flex: 1, color: L.textMuted, fontSize: 13,
    fontWeight: '400', lineHeight: 19,
  },
});
