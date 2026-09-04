import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, displayText } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useProfile } from '@/hooks/useProfile';
import { applyToBeDirector } from '@/lib/services/profile';
import { notifyProfileUpdated } from '@/lib/profileEvents';
import { useSupportContext } from '@/lib/support/supportContext';

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
};

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: 'trophy-outline',      title: 'Run real tournaments',    sub: 'Create divisions, manage registration, and run brackets end to end.' },
  { icon: 'people-outline',      title: 'Manage your roster',      sub: 'Check players in, track payments, and message registrants directly.' },
  { icon: 'stats-chart-outline', title: 'See it all in one place', sub: 'Live registration health, division fill rates, and results reporting.' },
];

export default function ApplyDirectorScreen() {
  const insets = useSafeAreaInsets();
  const { profile, loading } = useProfile();
  const [submitting, setSubmitting] = useState(false);

  useSupportContext({ feature: 'director' });

  async function handleApply() {
    setSubmitting(true);
    try {
      await applyToBeDirector();
      notifyProfileUpdated();
      Alert.alert(
        'Application Submitted',
        'Your director application is pending review. We’ll notify you once it’s approved.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Could Not Apply', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  const status = profile?.director_status ?? null;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Become a Director</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        <View style={s.heroIcon}>
          <Ionicons name="shield-checkmark-outline" size={36} color={L.gold} />
        </View>
        <Text style={s.title}>Tournament Director Access</Text>
        <Text style={s.subtitle}>
          Directors can create and run their own pickleball tournaments on Pickleball App.
          Applications are reviewed by our team before you get access.
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

        {status === 'pending' ? (
          <View style={s.statusCard}>
            <Ionicons name="time-outline" size={18} color={L.gold} />
            <Text style={s.statusText}>Your application is pending review.</Text>
          </View>
        ) : status === 'suspended' ? (
          <View style={[s.statusCard, { backgroundColor: colors.dangerBg, borderColor: 'rgba(239,68,68,0.30)' }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={[s.statusText, { color: colors.danger }]}>
              Director access was suspended. Contact support to be reinstated.
            </Text>
          </View>
        ) : status === 'approved' ? (
          <View style={[s.statusCard, { backgroundColor: L.successBg, borderColor: 'rgba(34,197,94,0.30)' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={L.success} />
            <Text style={[s.statusText, { color: L.success }]}>You&rsquo;re an approved director.</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.applyBtn, submitting && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleApply}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color={L.bg} />
              : <Text style={s.applyBtnText}>Apply to Be a Director</Text>}
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  scroll: { paddingHorizontal: 20, paddingTop: 24, alignItems: 'center' },

  heroIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: L.goldBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { ...displayText(22, { color: L.navy }), textAlign: 'center', marginBottom: 8 },
  subtitle: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', lineHeight: 21, textAlign: 'center', marginBottom: 24 },

  benefits: {
    width: '100%', backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.card, marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  benefitIcon: {
    width: 36, height: 36, borderRadius: shape.cta, backgroundColor: L.goldLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  benefitTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 2 },
  benefitSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 17 },

  applyBtn: {
    width: '100%', backgroundColor: L.navy, borderRadius: shape.cta,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  applyBtnText: { color: L.bg, fontSize: text.actionLarge.size, fontWeight: '800' },

  statusCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: shape.card, padding: 14,
  },
  statusText: { color: L.gold, fontSize: text.caption.size, fontWeight: '500', flex: 1 },
});
