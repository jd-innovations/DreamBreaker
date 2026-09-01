import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState, ErrorState } from '@/components';
import { router, useFocusEffect } from 'expo-router';
import { colors, radius } from '@/theme';
import { useSession } from '@/hooks/useSession';
import {
  fetchCoachOffers, pauseCoachOffer, resumeCoachOffer, duplicateCoachOffer,
  type CoachOfferWithImages,
} from '@/lib/coach/offers';
import { draftCoachOfferId } from '@/lib/coach/offerPhotos';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent } from '@/lib/coach/constants';
import { coachOfferErrorMessage } from '@/lib/coach/offerErrors';

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page,
  success: colors.success, successBg: colors.successBg, danger: colors.danger,
};

const STATUS_LABEL: Record<CoachOfferWithImages['status'], string> = {
  draft: 'Draft', active: 'Active', paused: 'Paused', archived: 'Archived',
};

const STATUS_COLOR: Record<CoachOfferWithImages['status'], string> = {
  draft: L.textSub, active: L.success, paused: L.gold, archived: L.textSub,
};

export default function CoachOffersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [offers, setOffers] = useState<CoachOfferWithImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Was `.catch(() => {})`: a failed load left the list empty, so a coach with
  // live offers was told they had none (item 6.3).
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!user?.id) return;
    setLoading(true);
    setError(false);
    fetchCoachOffers(user.id)
      .then(setOffers)
      .catch((err) => {
        console.error('[coach/offers] failed to load offers', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handlePauseResume(offer: CoachOfferWithImages) {
    setBusyId(offer.id);
    try {
      if (offer.status === 'active') await pauseCoachOffer(offer.id);
      else await resumeCoachOffer(offer.id);
      load();
    } catch (err) {
      Alert.alert('Could Not Update', coachOfferErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(offer: CoachOfferWithImages) {
    setBusyId(offer.id);
    try {
      await duplicateCoachOffer(offer.id, draftCoachOfferId());
      load();
    } catch (err) {
      Alert.alert('Could Not Duplicate', coachOfferErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const typeLabel = (t: CoachOfferWithImages['offer_type']) => OFFER_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Offers</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/coach/offers/create' as never)}>
          <Ionicons name="add" size={24} color={L.navy} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="We couldn't load your offers." onRetry={load} />
      ) : offers.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="pricetag-outline" size={40} color={L.textSub} />
          <Text style={s.emptyTitle}>No offers yet</Text>
          <TouchableOpacity style={s.createBtn} onPress={() => router.push('/coach/offers/create' as never)}>
            <Text style={s.createBtnText}>Create Your First Offer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/coach/offers/${item.id}/edit` as never)}
            >
              <View style={s.cardRow}>
                {item.images[0] ? (
                  <Image source={{ uri: item.images[0].url }} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, s.thumbPlaceholder]}>
                    <Ionicons name="image-outline" size={20} color={L.textSub} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.cardSub}>{typeLabel(item.offer_type)}</Text>
                  <View style={s.priceRow}>
                    <Text style={s.priceStrike}>{formatPriceCents(item.regular_price_cents)}</Text>
                    <Text style={s.priceNow}>{formatPriceCents(item.discounted_price_cents)}</Text>
                    <Text style={s.pctOff}>{discountPercent(item.regular_price_cents, item.discounted_price_cents)}% off</Text>
                  </View>
                </View>
                <View style={[s.statusPill, { borderColor: STATUS_COLOR[item.status] }]}>
                  <Text style={[s.statusText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
                </View>
              </View>

              {busyId === item.id ? (
                <ActivityIndicator size="small" color={L.gold} style={{ marginTop: 10 }} />
              ) : (
                <View style={s.actionsRow}>
                  {(item.status === 'active' || item.status === 'paused') && (
                    <TouchableOpacity style={s.actionBtn} onPress={() => handlePauseResume(item)}>
                      <Text style={s.actionText}>{item.status === 'active' ? 'Pause' : 'Resume'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleDuplicate(item)}>
                    <Text style={s.actionText}>Duplicate</Text>
                  </TouchableOpacity>
                </View>
              )}
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
  addBtn:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { color: L.textSub, fontSize: 14, fontWeight: '600' },
  createBtn: { backgroundColor: L.navy, borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 20, marginTop: 8 },
  createBtnText: { color: L.bg, fontSize: 14, fontWeight: '800' },

  card: { backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border, padding: 12 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: L.page, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: L.navy, fontSize: 14, fontWeight: '700' },
  cardSub: { color: L.textSub, fontSize: 12, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  priceStrike: { color: L.textSub, fontSize: 12, textDecorationLine: 'line-through' },
  priceNow: { color: L.navy, fontSize: 13, fontWeight: '800' },
  pctOff: { color: colors.gold, fontSize: 11, fontWeight: '700' },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border, paddingTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.button, borderWidth: 1, borderColor: L.border, alignItems: 'center' },
  actionText: { color: L.navy, fontSize: 12, fontWeight: '700' },
});
