import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, radius } from '@/theme';
import { fetchCoachOfferBrowseDetail, type CoachOfferBrowseCard } from '@/lib/coach/offers';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent } from '@/lib/coach/constants';

// Read-only offer detail. No purchase/checkout button — Phase 3+ builds
// that. This screen exists to visually review the Phase 2 catalog.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page, goldBg: colors.goldBg,
};

export default function LessonOfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<CoachOfferBrowseCard | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    fetchCoachOfferBrowseDetail(id).then((o) => { if (active) setOffer(o); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]));

  if (loading || !offer) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={L.gold} />
      </View>
    );
  }

  const typeLabel = OFFER_TYPE_OPTIONS.find((o) => o.value === offer.offer_type)?.label ?? offer.offer_type;
  const pct = discountPercent(offer.regular_price_cents, offer.discounted_price_cents);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{typeLabel}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {offer.images[0] ? (
          <Image source={{ uri: offer.images[0].url }} style={s.hero} />
        ) : (
          <View style={[s.hero, s.heroPlaceholder]}>
            <Ionicons name="school-outline" size={40} color={L.textSub} />
          </View>
        )}

        {offer.premium_only && (
          <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>PREMIUM MEMBERS ONLY</Text></View>
        )}

        <Text style={s.title}>{offer.title}</Text>

        {offer.coach && (
          <View style={s.coachRow}>
            {offer.coach.avatar_url ? (
              <Image source={{ uri: offer.coach.avatar_url }} style={s.coachAvatar} />
            ) : (
              <View style={[s.coachAvatar, s.coachAvatarPlaceholder]}>
                <Ionicons name="person" size={16} color={L.textSub} />
              </View>
            )}
            <Text style={s.coachName}>{offer.coach.full_name}</Text>
          </View>
        )}

        <View style={s.priceCard}>
          <View style={s.priceRow}>
            <Text style={s.priceStrike}>{formatPriceCents(offer.regular_price_cents)}</Text>
            <Text style={s.priceNow}>{formatPriceCents(offer.discounted_price_cents)}</Text>
            <Text style={s.pctOff}>{pct}% off</Text>
          </View>
          {offer.premium_price_cents != null && (
            <Text style={s.premiumPriceHint}>Premium members: {formatPriceCents(offer.premium_price_cents)}</Text>
          )}
        </View>

        {offer.description && <Text style={s.description}>{offer.description}</Text>}

        <View style={s.detailsCard}>
          {offer.skill_level_label && <DetailRow label="Skill Level" value={offer.skill_level_label} />}
          {offer.duration_minutes && <DetailRow label="Duration" value={`${offer.duration_minutes} min`} />}
          {offer.max_participants && <DetailRow label="Max Participants" value={String(offer.max_participants)} />}
          {offer.lessons_included && <DetailRow label="Lessons Included" value={String(offer.lessons_included)} />}
          {offer.quantity_available != null && <DetailRow label="Availability" value={`${offer.quantity_remaining} of ${offer.quantity_available} left`} />}
          {offer.purchase_limit_per_customer && <DetailRow label="Purchase Limit" value={`${offer.purchase_limit_per_customer} per customer`} />}
          {offer.facility && <DetailRow label="Location" value={`${offer.facility.name} — ${offer.facility.city}, ${offer.facility.state}`} last />}
        </View>

        {offer.terms && (
          <>
            <Text style={s.sectionLabel}>Terms</Text>
            <Text style={s.terms}>{offer.terms}</Text>
          </>
        )}

        <View style={s.noticeCard}>
          <Ionicons name="information-circle-outline" size={16} color={L.gold} />
          <Text style={s.noticeText}>
            Purchasing isn't available yet — Coach Marketplace checkout is a later build phase.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[dr.row, last && dr.rowLast]}>
      <Text style={dr.label}>{label}</Text>
      <Text style={dr.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { color: colors.textSub, fontSize: 12, fontWeight: '600', width: 120, paddingTop: 1 },
  value: { color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 15, fontWeight: '800', flex: 1, textAlign: 'center' },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  hero: { width: '100%', height: 180, borderRadius: radius.card, marginBottom: 12 },
  heroPlaceholder: { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },

  premiumBadge: { alignSelf: 'flex-start', backgroundColor: L.navy, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  premiumBadgeText: { color: L.bg, fontSize: 10, fontWeight: '800' },

  title: { color: L.navy, fontSize: 20, fontWeight: '800', marginBottom: 8 },

  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  coachAvatar: { width: 28, height: 28, borderRadius: 14 },
  coachAvatarPlaceholder: { backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center' },
  coachName: { color: L.text, fontSize: 13, fontWeight: '600' },

  priceCard: { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: radius.card, padding: 14, marginBottom: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceStrike: { color: L.textSub, fontSize: 14, textDecorationLine: 'line-through' },
  priceNow: { color: L.navy, fontSize: 20, fontWeight: '800' },
  pctOff: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  premiumPriceHint: { color: L.textSub, fontSize: 12, marginTop: 6 },

  description: { color: L.text, fontSize: 14, lineHeight: 21, marginBottom: 16 },

  detailsCard: { backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, borderRadius: radius.card, marginBottom: 16 },

  sectionLabel: { color: L.navy, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  terms: { color: L.textSub, fontSize: 13, lineHeight: 19, marginBottom: 16 },

  noticeCard: {
    flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: L.goldBg,
    borderRadius: radius.card, padding: 12,
  },
  noticeText: { flex: 1, color: L.text, fontSize: 12, lineHeight: 17 },
});
