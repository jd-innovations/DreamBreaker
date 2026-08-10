import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius } from '@/theme';
import { fetchActiveCoachOffersBrowse, type CoachOfferBrowseCard } from '@/lib/coach/offers';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent } from '@/lib/coach/constants';

// Minimal player-facing browse surface for Coach Marketplace offers.
// Deliberately NOT the real discovery/search experience (Phase 10 UI,
// spec §12-14 "Offers For You" / Wallet integration) — this is just enough
// to visually review the Phase 2 catalog. No purchase/checkout anywhere
// here; that's Phase 3+.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page,
};

export default function LessonMarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const [offers, setOffers] = useState<CoachOfferBrowseCard[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    fetchActiveCoachOffersBrowse()
      .then((data) => { if (active) setOffers(data); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  const typeLabel = (t: CoachOfferBrowseCard['offer_type']) => OFFER_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Lesson Marketplace</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={L.gold} /></View>
      ) : offers.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="school-outline" size={40} color={L.textSub} />
          <Text style={s.emptyTitle}>No lesson offers yet</Text>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => router.push(`/lessons/${item.id}` as never)}>
              <View style={s.cardRow}>
                {item.images[0] ? (
                  <Image source={{ uri: item.images[0].url }} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, s.thumbPlaceholder]}>
                    <Ionicons name="school-outline" size={20} color={L.textSub} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.cardSub}>
                    {typeLabel(item.offer_type)}{item.coach?.full_name ? ` · ${item.coach.full_name}` : ''}
                  </Text>
                  {item.facility && (
                    <Text style={s.cardLocation} numberOfLines={1}>
                      {item.facility.name} · {item.facility.city}, {item.facility.state}
                    </Text>
                  )}
                  <View style={s.priceRow}>
                    <Text style={s.priceStrike}>{formatPriceCents(item.regular_price_cents)}</Text>
                    <Text style={s.priceNow}>{formatPriceCents(item.discounted_price_cents)}</Text>
                    <Text style={s.pctOff}>{discountPercent(item.regular_price_cents, item.discounted_price_cents)}% off</Text>
                  </View>
                </View>
                {item.premium_only && (
                  <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>PREMIUM</Text></View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
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
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { color: L.textSub, fontSize: 14, fontWeight: '600' },

  card: { backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border, padding: 12 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: L.page, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: L.navy, fontSize: 14, fontWeight: '700' },
  cardSub: { color: L.textSub, fontSize: 12, marginTop: 2 },
  cardLocation: { color: L.textSub, fontSize: 11, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  priceStrike: { color: L.textSub, fontSize: 12, textDecorationLine: 'line-through' },
  priceNow: { color: L.navy, fontSize: 13, fontWeight: '800' },
  pctOff: { color: colors.gold, fontSize: 11, fontWeight: '700' },

  premiumBadge: { backgroundColor: L.navy, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  premiumBadgeText: { color: L.bg, fontSize: 9, fontWeight: '800' },
});
