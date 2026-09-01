import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, displayText } from '@/theme';
import { useProfile } from '@/hooks/useProfile';
import { activateCoachMode } from '@/lib/supabase/coach';
import { notifyProfileUpdated } from '@/lib/profileEvents';

// Coach Marketplace V1, Phase 1 — Coach Mode activation hub. Offers/
// Dashboard/Redeem/Payouts nav (spec §39) land in later phases; this screen
// only covers activation + Connect-readiness status.

const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldLight:  colors.goldLight,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  border:     colors.border,
  success:    colors.success,
  successBg:  colors.successBg,
  danger:     colors.danger,
  dangerBg:   colors.dangerBg,
};

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: 'pricetag-outline',    title: 'Sell lesson offers',      sub: 'Private, semi-private, clinics, camps, and multi-lesson packages.' },
  { icon: 'qr-code-outline',     title: 'Redeem with a QR scan',    sub: 'Players show a voucher; you scan or enter a manual code.' },
  { icon: 'cash-outline',        title: 'Get paid weekly',          sub: 'Redeemed lessons settle, then pay out to your bank via Stripe.' },
];

export default function CoachModeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, loading } = useProfile();
  const [activating, setActivating] = useState(false);

  async function handleActivate() {
    if (!profile?.id) return;
    setActivating(true);
    const ok = await activateCoachMode(profile.id);
    setActivating(false);
    if (!ok) {
      Alert.alert('Could Not Activate', 'Something went wrong. Please try again.');
      return;
    }
    notifyProfileUpdated();
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const coachStatus = profile?.coach_status ?? 'inactive';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Coach Mode</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        <View style={s.heroIcon}>
          <Ionicons name="school-outline" size={36} color={L.gold} />
        </View>
        <Text style={s.title}>Coach Marketplace</Text>
        <Text style={s.subtitle}>
          Sell discounted lesson offers through Pickleball App and get paid weekly through Stripe.
        </Text>

        <View style={s.benefits}>
          {BENEFITS.map((b, i) => (
            <View key={b.title} style={[s.benefitRow, i === BENEFITS.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={s.benefitIcon}>
                <Ionicons name={b.icon} size={20} color={L.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.benefitTitle}>{b.title}</Text>
                <Text style={s.benefitSub}>{b.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {(coachStatus === 'active' || coachStatus === 'test_ready' || coachStatus === 'onboarding') && (
          <TouchableOpacity
            style={s.offersLink}
            activeOpacity={0.85}
            onPress={() => router.push('/coach/offers' as never)}
          >
            <Ionicons name="pricetag-outline" size={18} color={L.navy} />
            <Text style={s.offersLinkText}>My Offers</Text>
            <Ionicons name="chevron-forward" size={16} color={L.textSub} />
          </TouchableOpacity>
        )}

        {coachStatus === 'onboarding' ? (
          <View style={s.statusCard}>
            <Ionicons name="time-outline" size={18} color={L.gold} />
            <Text style={s.statusText}>
              Coach Mode is active. Set up payouts to start publishing offers.
            </Text>
            <TouchableOpacity onPress={() => router.push('/payout-settings' as never)} activeOpacity={0.75}>
              <Text style={s.statusLink}>Set up</Text>
            </TouchableOpacity>
          </View>
        ) : coachStatus === 'restricted' ? (
          <View style={[s.statusCard, { backgroundColor: L.dangerBg, borderColor: 'rgba(239,68,68,0.30)' }]}>
            <Ionicons name="alert-circle-outline" size={18} color={L.danger} />
            <Text style={[s.statusText, { color: L.danger }]}>
              Your payout account needs attention.
            </Text>
            <TouchableOpacity onPress={() => router.push('/payout-settings' as never)} activeOpacity={0.75}>
              <Text style={[s.statusLink, { color: L.danger }]}>Fix</Text>
            </TouchableOpacity>
          </View>
        ) : coachStatus === 'active' ? (
          <View style={[s.statusCard, { backgroundColor: L.successBg, borderColor: 'rgba(34,197,94,0.30)' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={L.success} />
            <Text style={[s.statusText, { color: L.success }]}>You&rsquo;re a verified, payout-ready coach.</Text>
          </View>
        ) : coachStatus === 'test_ready' ? (
          <View style={[s.statusCard, { backgroundColor: L.goldLight, borderColor: L.goldBorder }]}>
            <Ionicons name="flask-outline" size={18} color={L.gold} />
            <Text style={s.statusText}>
              Development test account — not a real, payout-capable coach. For internal testing only.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.applyBtn, activating && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleActivate}
            disabled={activating}
          >
            {activating
              ? <ActivityIndicator size="small" color={L.bg} />
              : <Text style={s.applyBtnText}>Activate Coach Mode</Text>}
          </TouchableOpacity>
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
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  scroll: { paddingHorizontal: 20, paddingTop: 24, alignItems: 'center' },

  heroIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title:    { ...displayText(22, { color: L.navy }), textAlign: 'center', marginBottom: 8 },
  subtitle: { color: L.textSub, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 24 },

  benefits: {
    width: '100%', backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  benefitIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: L.goldLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  benefitTitle: { color: L.navy, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  benefitSub:   { color: L.textSub, fontSize: 12, lineHeight: 17 },

  applyBtn: {
    width: '100%', backgroundColor: L.navy, borderRadius: radius.button,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  applyBtnText: { color: L.bg, fontSize: 15, fontWeight: '800' },

  statusCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: radius.card, padding: 14,
  },
  statusLink: { color: L.gold, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  statusText: { color: L.gold, fontSize: 13, fontWeight: '700', flex: 1 },

  offersLink: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 14, marginBottom: 16,
  },
  offersLinkText: { flex: 1, color: L.navy, fontSize: 14, fontWeight: '700' },
});
