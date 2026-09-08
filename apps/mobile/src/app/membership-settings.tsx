import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// Theme-backed alias â€” brand values resolve from @/theme.
// purple/teal are plan-tier accent colors (no brand equivalent) â€” documented exception.
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
  purpleBg:   'rgba(108,63,197,0.10)',
  purpleBorder:'rgba(108,63,197,0.25)',
  teal:       '#0B9E8A',
  tealBg:     'rgba(11,158,138,0.10)',
  tealBorder: 'rgba(11,158,138,0.25)',
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

// â”€â”€â”€ Benefit row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BenefitRow({
  icon, label, sub, last,
}: {
  icon: string; label: string; sub: string; last?: boolean;
}) {
  return (
    <>
      <View style={s.benefitRow}>
        <View style={s.benefitIcon}>
          <Ionicons name={icon as never} size={20} color={L.gold} />
        </View>
        <View style={s.benefitText}>
          <Text style={s.benefitLabel}>{label}</Text>
          <Text style={s.benefitSub}>{sub}</Text>
        </View>
      </View>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Billing nav row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BillingRow({
  icon, label, sub, last,
}: {
  icon: string; label: string; sub: string; last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity style={s.billingRow} activeOpacity={0.7}>
        <View style={s.billingIcon}>
          <Ionicons name={icon as never} size={18} color={L.gold} />
        </View>
        <View style={s.billingText}>
          <Text style={s.billingLabel}>{label}</Text>
          <Text style={s.billingSub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
      </TouchableOpacity>
      {!last && <Div />}
    </>
  );
}

// â”€â”€â”€ Plan card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Plan = 'free' | 'plus' | 'director';

function PlanCard({
  plan, selected, onSelect,
}: {
  plan: Plan; selected: boolean; onSelect: () => void;
}) {
  if (plan === 'free') {
    return (
      <TouchableOpacity
        style={[s.planCard, selected && s.planCardSelected]}
        onPress={onSelect}
        activeOpacity={0.8}
      >
        <View style={s.planIconWrap}>
          <View style={[s.planIconCircle, { backgroundColor: L.goldBg, borderColor: L.goldBorder }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={L.gold} />
          </View>
        </View>
        <View style={s.planInfo}>
          <Text style={s.planName}>FREE</Text>
          <Text style={s.planDesc}>Core features for all players.</Text>
        </View>
        {selected && (
          <View style={s.currentPlanBadge}>
            <Text style={s.currentPlanText}>CURRENT PLAN</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (plan === 'plus') {
    return (
      <TouchableOpacity style={s.planCard} onPress={onSelect} activeOpacity={0.8}>
        <View style={s.planIconWrap}>
          <View style={[s.planIconCircle, { backgroundColor: L.purpleBg, borderColor: L.purpleBorder }]}>
            <Ionicons name="shield-half-outline" size={22} color={L.purple} />
          </View>
        </View>
        <View style={s.planInfo}>
          <Text style={s.planName}>PLUS</Text>
          <Text style={s.planDesc}>Everything you need to elevate{'\n'}your pickleball experience.</Text>
        </View>
        <View style={s.planRight}>
          <View style={s.priceRow}>
            <Text style={[s.priceAmount, { color: L.purple }]}>$19.00</Text>
            <Text style={[s.pricePer, { color: L.purple }]}>/year</Text>
          </View>
          <View style={[s.popularBadge, { backgroundColor: L.purple }]}>
            <Text style={s.popularText}>MOST POPULAR</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    );
  }

  // director
  return (
    <TouchableOpacity style={s.planCard} onPress={onSelect} activeOpacity={0.8}>
      <View style={s.planIconWrap}>
        <View style={[s.planIconCircle, { backgroundColor: L.tealBg, borderColor: L.tealBorder }]}>
          <Ionicons name="shield-outline" size={22} color={L.teal} />
        </View>
      </View>
      <View style={s.planInfo}>
        <Text style={s.planName}>DIRECTOR PRO</Text>
        <Text style={s.planDesc}>Built for tournament directors{'\n'}and organizers.</Text>
      </View>
      <View style={s.priceRow}>
        <Text style={[s.priceAmount, { color: L.teal }]}>$14.99</Text>
        <Text style={[s.pricePer, { color: L.teal }]}>/month</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={L.textMuted} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function MembershipSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('free');

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* â”€â”€ Header â”€â”€ */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Membership</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <Text style={s.intro}>Manage your plan and billing.</Text>

        {/* â”€â”€ Current Membership Card â”€â”€ */}
        <Group>
          {/* Plan summary */}
          <View style={s.currentCard}>
            <View style={s.currentIconWrap}>
              <View style={s.currentIconCircle}>
                <Ionicons name="shield-checkmark-outline" size={28} color={L.gold} />
              </View>
            </View>
            <View style={s.currentInfo}>
              <Text style={s.currentLabel}>CURRENT PLAN</Text>
              <Text style={s.currentName}>Free Member</Text>
              <Text style={s.currentDesc}>
                Enjoy the core experience{'\n'}with essential features.
              </Text>
            </View>
            <View style={s.freeBadge}>
              <Text style={s.freeBadgeText}>FREE</Text>
            </View>
          </View>

          {/* Upgrade row */}
          <View style={s.upgradeDivider} />
          <TouchableOpacity style={s.upgradeRow} activeOpacity={0.7}>
            <Ionicons name="sparkles-outline" size={20} color={L.gold} />
            <View style={s.upgradeText}>
              <Text style={s.upgradeLabel}>Upgrade to Plus</Text>
              <Text style={s.upgradeSub}>Unlock premium features and benefits.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.textMuted} />
          </TouchableOpacity>
        </Group>

        {/* â”€â”€ Why Upgrade â”€â”€ */}
        <SectionHeader label="WHY UPGRADE?" />
        <Group>
          <BenefitRow
            icon="notifications-outline"
            label="Priority tournament alerts"
            sub="Get notified first about tournaments that matter."
          />
          <BenefitRow
            icon="trending-up-outline"
            label="Marketplace listing boosts"
            sub="Increase visibility and sell faster."
          />
          <BenefitRow
            icon="people-outline"
            label="Advanced partner matching"
            sub="Better matches with more filters and insights."
          />
          <BenefitRow
            icon="flash-outline"
            label="Early access to new features"
            sub="Be the first to try new tools and updates."
            last
          />
        </Group>

        {/* â”€â”€ Choose Your Plan â”€â”€ */}
        <SectionHeader label="CHOOSE YOUR PLAN" />
        <View style={s.plansContainer}>
          <PlanCard plan="free"     selected={selectedPlan === 'free'}     onSelect={() => setSelectedPlan('free')} />
          <View style={s.planDivider} />
          <PlanCard plan="plus"     selected={selectedPlan === 'plus'}     onSelect={() => setSelectedPlan('plus')} />
          <View style={s.planDivider} />
          <PlanCard plan="director" selected={selectedPlan === 'director'} onSelect={() => setSelectedPlan('director')} />
        </View>

        {/* â”€â”€ Billing â”€â”€ */}
        <SectionHeader label="BILLING" />
        <Group>
          <BillingRow
            icon="document-text-outline"
            label="Billing History"
            sub="View your past purchases and invoices."
          />
          <BillingRow
            icon="card-outline"
            label="Payment Methods"
            sub="Manage your saved payment methods."
          />
          <BillingRow
            icon="refresh-circle-outline"
            label="Restore Purchases"
            sub="Restore a previous purchase on this device."
            last
          />
        </Group>

        {/* â”€â”€ Footer â”€â”€ */}
        <View style={s.footer}>
          <Ionicons name="lock-closed-outline" size={14} color={L.textMuted} />
          <View>
            <Text style={s.footerLine}>Your membership is secure and private.</Text>
            <Text style={s.footerLine}>Cancel anytime. Changes take effect at the end of your billing period.</Text>
          </View>
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
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText: { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  scroll: { padding: 20 },

  intro: {
    color: L.textMuted, fontSize: text.body.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 20, marginBottom: 4,
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

  div: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 68 },

  // â”€â”€ Current membership card â”€â”€
  currentCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 18, gap: 14,
  },
  currentIconWrap: { flexShrink: 0 },
  currentIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: L.goldBg, borderWidth: 1.5, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  currentInfo: { flex: 1 },
  currentLabel: { color: L.textMuted, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, marginBottom: 4 },
  currentName: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900', marginBottom: 4 },
  currentDesc: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18 },
  freeBadge: {
    backgroundColor: L.goldBg, borderRadius: shape.pill, borderWidth: 1, borderColor: L.goldBorder,
    paddingHorizontal: 12, paddingVertical: 5, flexShrink: 0, alignSelf: 'flex-start',
  },
  freeBadgeText: { color: L.gold, fontSize: text.chipValue.size, fontWeight: '800', letterSpacing: 0.5 },

  upgradeDivider: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },
  upgradeRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  upgradeText: { flex: 1 },
  upgradeLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 2 },
  upgradeSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  // â”€â”€ Why Upgrade â”€â”€
  benefitRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14, gap: 14,
  },
  benefitIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  benefitText: { flex: 1 },
  benefitLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 3 },
  benefitSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18 },

  // â”€â”€ Plan cards â”€â”€
  plansContainer: {
    borderRadius: shape.panel, borderWidth: 1, borderColor: L.border,
    backgroundColor: L.bg, overflow: 'hidden',
  },
  planDivider: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12, backgroundColor: L.bg,
  },
  planCardSelected: {
    backgroundColor: 'rgba(201,168,76,0.04)',
    borderWidth: 1.5, borderColor: L.gold,
    margin: -1,
  },
  planIconWrap: { flexShrink: 0 },
  planIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  planInfo: { flex: 1 },
  planName: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 3 },
  planDesc: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', lineHeight: 17 },
  planRight: { alignItems: 'flex-end', gap: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  priceAmount: { fontSize: text.titleSm.size, fontWeight: '800' },
  pricePer: { fontSize: text.caption.size, fontWeight: '500' },
  popularBadge: { borderRadius: shape.pill, paddingHorizontal: 10, paddingVertical: 4 },
  popularText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  currentPlanBadge: {
    backgroundColor: L.goldBg, borderRadius: shape.pill, borderWidth: 1, borderColor: L.goldBorder,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  currentPlanText: { color: L.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  // â”€â”€ Billing â”€â”€
  billingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  billingIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: L.goldBorder,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  billingText: { flex: 1 },
  billingLabel: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 2 },
  billingSub: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  // â”€â”€ Footer â”€â”€
  footer: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 8, marginTop: 28, paddingHorizontal: 8,
  },
  footerLine: {
    color: L.textMuted, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 20,
  },
});
