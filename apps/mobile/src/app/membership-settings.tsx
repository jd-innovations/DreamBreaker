import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme';
import { useMembership } from '@/hooks/useMembership';
import { useSession } from '@/hooks/useSession';
import { fetchMembership, isMembershipActive } from '@/lib/supabase/membership';
import { TERMS_URL, PRIVACY_URL } from '@/lib/legal';
import {
  getMembershipOffer, purchaseMembership, restorePurchases,
  type MembershipOffer,
} from '@/lib/purchases';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// Theme-backed alias — brand values resolve from @/theme.
// purple/teal are plan-tier accent colors (no brand equivalent) — documented exception.
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

function Div() {
  return <View style={s.div} />;
}

// ─── Benefit row ──────────────────────────────────────────────────────────────

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

// ─── Billing nav row ──────────────────────────────────────────────────────────

function BillingRow({
  icon, label, sub, last, onPress,
}: {
  icon: string; label: string; sub: string; last?: boolean; onPress: () => void;
}) {
  return (
    <>
      <TouchableOpacity style={s.billingRow} activeOpacity={0.7} onPress={onPress}>
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

// ─── Plan card ────────────────────────────────────────────────────────────────

// ─── Main screen ──────────────────────────────────────────────────────────────

/**
 * How long to wait for the membership row after Apple says yes.
 *
 * The row is written by the RevenueCat webhook, not by the app, so there is a
 * real gap between "Apple charged the card" and "we know about it". Showing
 * "Free Member" in that window to someone who just paid is the worst moment in
 * the whole flow to be wrong, so the screen holds an explicit activating state
 * instead of rendering stale truth.
 *
 * Bounded on purpose. If the webhook is down, the purchase is still valid and
 * will reconcile when it recovers -- the copy says so rather than pretending
 * something failed.
 */
const ACTIVATION_POLL_MS = 1500;
const ACTIVATION_ATTEMPTS = 8;

type Phase = 'idle' | 'buying' | 'restoring' | 'activating';

export default function MembershipSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { membership, isMember, reload } = useMembership();
  const { session } = useSession();
  const [offer, setOffer] = useState<MembershipOffer | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  // No offer means nothing is purchasable right now -- no SDK key, no store
  // config, or web. The screen keeps its "coming soon" shape in that case
  // rather than showing a button that cannot complete.
  useEffect(() => {
    let cancelled = false;
    getMembershipOffer().then(o => { if (!cancelled) setOffer(o); });
    return () => { cancelled = true; };
  }, []);

  const awaitMembership = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return false;
    for (let i = 0; i < ACTIVATION_ATTEMPTS; i++) {
      await new Promise(r => setTimeout(r, ACTIVATION_POLL_MS));
      const m = await fetchMembership(uid);
      if (isMembershipActive(m)) { await reload(); return true; }
    }
    return false;
  }, [session?.user?.id, reload]);

  async function handleBuy() {
    setPhase('buying');
    const outcome = await purchaseMembership();

    // Backing out of Apple's sheet is not an error and must never be reported
    // as one.
    if (outcome.status === 'cancelled') { setPhase('idle'); return; }

    if (outcome.status === 'purchased') {
      setPhase('activating');
      const ok = await awaitMembership();
      setPhase('idle');
      if (!ok) {
        Alert.alert(
          'Payment received',
          'Apple confirmed your purchase. Your membership will appear here shortly.',
        );
      }
      return;
    }

    setPhase('idle');
    if (outcome.status === 'unavailable') {
      Alert.alert('Not on sale yet', 'Membership is not available for purchase yet.');
    } else if (outcome.status === 'error') {
      Alert.alert('Purchase failed', outcome.message);
    }
  }

  async function handleRestore() {
    setPhase('restoring');
    const outcome = await restorePurchases();

    if (outcome.status === 'restored') {
      setPhase('activating');
      await awaitMembership();
      setPhase('idle');
      Alert.alert('Membership restored', 'Your Plus membership is active again.');
      return;
    }

    setPhase('idle');
    if (outcome.status === 'nothing_to_restore') {
      // App Review presses this on a fresh account. A calm answer, not an error.
      Alert.alert('Nothing to restore', 'No previous membership was found for this Apple ID.');
    } else if (outcome.status === 'unavailable') {
      Alert.alert('Not available', 'Purchases cannot be restored on this device.');
    } else if (outcome.status === 'error') {
      Alert.alert('Could not restore', outcome.message);
    }
  }

  const busy = phase !== 'idle';
  const canBuy = !!offer;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
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

        {/* ── Current Membership Card ── */}
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
              <Text style={s.currentName}>{isMember ? 'Plus Member' : 'Free Member'}</Text>
              <Text style={s.currentDesc}>
                {isMember
                  ? (membership?.expiresAt
                    ? `Renews ${new Date(membership.expiresAt).toLocaleDateString()}`
                    : 'No expiry')
                  : 'Enjoy the core experience with essential features.'}
              </Text>
            </View>
            <View style={s.freeBadge}>
              <Text style={s.freeBadgeText}>{isMember ? 'PLUS' : 'FREE'}</Text>
            </View>
          </View>

          {/* Not a tappable row until there is something to tap. Purchase is
              Phase 5 and needs StoreKit: a membership unlocks in-app
              functionality for a recurring fee, which guideline 3.1.1 reserves
              for In-App Purchase. A row that looked tappable and did nothing is
              exactly what got this screen gated in the first place. */}
          {!isMember && (
            <>
              <View style={s.upgradeDivider} />
              {canBuy ? (
                <View style={s.buyWrap}>
                  <TouchableOpacity
                    style={[s.buyBtn, busy && s.buyBtnBusy]}
                    onPress={handleBuy}
                    disabled={busy}
                    activeOpacity={0.85}
                  >
                    {phase === 'buying' || phase === 'activating' ? (
                      <ActivityIndicator color={L.navy} />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={18} color={L.navy} />
                        {/* The store's own localized string, never a number we
                            format. The storefront decides currency, symbol
                            placement and decimals. */}
                        <Text style={s.buyBtnText}>Join Plus — {offer!.priceString}/year</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {phase === 'activating' && (
                    <Text style={s.activating}>Setting up your membership…</Text>
                  )}

                  {/* Required by App Review: price, period, the auto-renewing
                      nature, how to cancel, and links to Terms and Privacy on
                      the purchase screen itself. */}
                  <Text style={s.disclosure}>
                    {offer!.priceString} per year. Your subscription renews automatically
                    unless it is cancelled at least 24 hours before the end of the
                    period. Payment is charged to your Apple ID, and you can manage or
                    cancel it in your Apple ID settings.
                  </Text>
                  <View style={s.legalRow}>
                    <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)} activeOpacity={0.7}>
                      <Text style={s.legalLink}>Terms of Service</Text>
                    </TouchableOpacity>
                    <Text style={s.legalDot}>·</Text>
                    <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)} activeOpacity={0.7}>
                      <Text style={s.legalLink}>Privacy Policy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // No offering reachable -- no SDK key, nothing configured in the
                // store, or web. Says nothing about a price it cannot quote.
                <View style={s.upgradeRow}>
                  <Ionicons name="sparkles-outline" size={20} color={L.gold} />
                  <View style={s.upgradeText}>
                    <Text style={s.upgradeLabel}>Plus is coming soon</Text>
                    <Text style={s.upgradeSub}>Here is what it includes.</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </Group>

        {/* ── Why Upgrade ── */}
        <SectionHeader label="WHY UPGRADE?" />
        <Group>
          {/* The four benefits actually being sold (MONETIZATION_PLAN.md).
              These replace four placeholders -- priority alerts, listing
              boosts, advanced matching, early access -- none of which exist.
              Two are live today for anyone holding a membership; the other two
              say they are coming rather than implying they are here. */}
          <BenefitRow
            icon="pricetag-outline"
            label="$25 Pickleball Grip Doctor credit"
            sub="A one-time voucher, once membership goes on sale."
          />
          <BenefitRow
            icon="school-outline"
            label="Member pricing on lessons"
            sub="Coaches can set a lower price just for members. Live now."
          />
          <BenefitRow
            icon="storefront-outline"
            label="List up to 10 paddles"
            sub="Instead of 2 on the free plan. Live now."
          />
          <BenefitRow
            icon="eye-off-outline"
            label="No ads"
            sub="Coming with the ad-supported experience."
            last
          />
        </Group>

        {/* ── Billing ── */}
        <SectionHeader label="BILLING" />
        <Group>
          {/* One row, one destination. This was three: Billing History and
              Payment Methods both navigated nowhere while the real versions of
              both already existed on payments-settings, and Restore Purchases
              is a StoreKit concept that means nothing until there is an IAP to
              restore (Phase 5). */}
          <BillingRow
            icon="card-outline"
            label="Payments & billing"
            sub="Saved cards, purchase history and refunds."
            onPress={() => router.push('/payments-settings' as never)}
          />
          {/* Guideline 3.1.1 asks for a restore mechanism and reviewers do press
              it. Shown whether or not the user looks like a member: someone who
              reinstalled is exactly the person who needs it, and to this screen
              they look like a free user. */}
          <BillingRow
            icon="refresh-outline"
            label={phase === 'restoring' ? 'Restoring…' : 'Restore purchases'}
            sub="Already subscribed on this Apple ID? Bring it back."
            onPress={() => { if (!busy) handleRestore(); }}
            last
          />
        </Group>

        {/* ── Footer ── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // ── Current membership card ──
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

  // ── Purchase ──
  buyWrap: { padding: 16, gap: 10 },
  buyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.gold, borderRadius: shape.cta,
    // 52 clears the 44pt minimum touch target with room for the label.
    minHeight: 52, paddingHorizontal: 16,
  },
  buyBtnBusy: { opacity: 0.6 },
  buyBtnText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  activating: {
    color: L.textMuted, fontSize: text.caption.size, fontWeight: '600', textAlign: 'center',
  },
  disclosure: {
    color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', lineHeight: 17,
  },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  legalLink: {
    color: L.blue, fontSize: text.caption.size, fontWeight: '600',
    // Keeps the tap area at the 44pt minimum without moving the text.
    paddingVertical: 12,
  },
  legalDot: { color: L.textMuted, fontSize: text.caption.size },

  // ── Why Upgrade ──
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

  // ── Plan cards ──
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

  // ── Billing ──
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

  // ── Footer ──
  footer: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 8, marginTop: 28, paddingHorizontal: 8,
  },
  footerLine: {
    color: L.textMuted, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 20,
  },
});
