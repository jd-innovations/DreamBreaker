import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, TextInput, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { browseLessons, travelAreaLabel, type BrowseLesson, type LessonSort } from '@/lib/coach/offers';
import { LoadingState, EmptyState, ErrorState } from '@/components';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent, effectiveOfferPrice } from '@/lib/coach/constants';
import { useMembership } from '@/hooks/useMembership';
import { useProfile } from '@/hooks/useProfile';
import { useCurrentLocation } from '@/lib/location';
import { haptics } from '@/lib/haptics';
import { DEFAULT_LESSON_COVER } from '@/lib/coach/defaultLessonCover';

// Lesson Marketplace browse — location first (owner, 2026-10-04). Lessons are
// local, so the list opens on "near me": the phone's position, else the
// profile's (city-level) position, else Anywhere. Reads browse_coach_offers,
// the same search web uses (20261004120000): radius, nearest sort, distance,
// type, text search, sold-out hidden, test coaches on internal builds only.
// A lesson is at a facility, travels to you within the coach's range, or both;
// a travel lesson matches when YOU are inside the coach's range.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page,
};

const RADII: { miles: number | null; label: string }[] = [
  { miles: 10, label: '10 mi' },
  { miles: 25, label: '25 mi' },
  { miles: 50, label: '50 mi' },
  { miles: null, label: 'Anywhere' },
];

const SORTS: { value: LessonSort; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'price_low', label: 'Price' },
  { value: 'newest', label: 'Newest' },
];

/**
 * The card's price, from this buyer's point of view.
 *
 * A member sees the member price as THE price, with the public one struck
 * through, so the benefit is visible while browsing rather than a surprise at
 * checkout. Everyone else sees what membership would save them on this
 * specific offer, which is a far better upsell than a generic pitch.
 */
function PriceRow({ item, isMember }: { item: BrowseLesson; isMember: boolean }) {
  const price = effectiveOfferPrice(item, isMember);
  return (
    <>
      <View style={s.priceRow}>
        <Text style={s.priceStrike}>{formatPriceCents(item.regular_price_cents)}</Text>
        <Text style={s.priceNow}>{formatPriceCents(price.cents)}</Text>
        <Text style={s.pctOff}>{discountPercent(item.regular_price_cents, price.cents)}% off</Text>
      </View>
      {!price.isMemberPrice && item.premium_price_cents != null && (
        <Text style={s.memberHint}>Members pay {formatPriceCents(item.premium_price_cents)}</Text>
      )}
    </>
  );
}

function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: string }) {
  return (
    <TouchableOpacity
      style={[s.chip, on && s.chipOn]}
      onPress={() => { if (!on) { haptics.selection(); onPress(); } }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {icon && <Ionicons name={icon as never} size={13} color={on ? L.bg : L.navy} />}
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function LessonMarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { isMember } = useMembership();
  const { profile } = useProfile();
  const device = useCurrentLocation();

  // Where "near me" is: the phone, else the profile's stored (2-decimal,
  // ~1 km) position, else nowhere — never the hard-coded fallback city.
  const near = useMemo(() => {
    if (!device.loading && !device.isFallback) return { lat: device.lat, lng: device.lng, source: 'device' as const };
    if (profile?.location_lat != null && profile?.location_lng != null) {
      return { lat: profile.location_lat, lng: profile.location_lng, source: 'profile' as const };
    }
    return null;
  }, [device.loading, device.isFallback, device.lat, device.lng, profile?.location_lat, profile?.location_lng]);

  const [radius, setRadius] = useState<number | null>(25);
  const [offerType, setOfferType] = useState<string | null>(null);
  const [sort, setSort] = useState<LessonSort>('nearest');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  const [offers, setOffers] = useState<BrowseLesson[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed fetch must not read as an empty catalogue (item 6.3).
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Type-ahead without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const effectiveRadius = near ? radius : null;
  const effectiveSort: LessonSort = !near && sort === 'nearest' ? 'newest' : sort;

  useFocusEffect(useCallback(() => {
    // Wait for the phone's answer once, so the first list isn't the profile's.
    if (device.loading && !near) return;
    let active = true;
    setLoading(true);
    setError(false);
    browseLessons({ search, offerType, near, radiusMiles: effectiveRadius, sort: effectiveSort })
      .then((data) => { if (active) setOffers(data); })
      .catch((err) => {
        console.error('[lessons] failed to load coach offers', err);
        if (active) setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, offerType, near, effectiveRadius, effectiveSort, device.loading, reloadKey]));

  const typeLabel = (t: string) => OFFER_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

  const locationNote = !near
    ? 'Turn on location or set your city in your profile to see lessons near you.'
    : near.source === 'profile' ? 'Using the location on your profile.' : null;

  return (
    <View style={s.root}>
      {/* Safe-area inset on the HEADER, not the root, so the white header
          colour runs to the top of the screen. Pattern from wallet.tsx. */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Lesson Marketplace</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filters */}
      <View style={s.filters}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={L.textSub} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search coach, facility or lesson"
            placeholderTextColor={L.textSub}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search lessons"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={L.textSub} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {RADII.map((r) => (
            <Chip
              key={r.label}
              label={r.miles == null ? r.label : `Within ${r.label}`}
              icon={r.miles == null ? 'globe-outline' : 'navigate-outline'}
              on={(near ? radius : null) === r.miles}
              onPress={() => setRadius(r.miles)}
            />
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          <Chip label="All types" on={offerType === null} onPress={() => setOfferType(null)} />
          {OFFER_TYPE_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={offerType === o.value} onPress={() => setOfferType(o.value)} />
          ))}
        </ScrollView>

        <View style={s.sortRow}>
          <Text style={s.sortLabel}>Sort</Text>
          {SORTS.filter((o) => near || o.value !== 'nearest').map((o) => (
            <Chip key={o.value} label={o.label} on={effectiveSort === o.value} onPress={() => setSort(o.value)} />
          ))}
        </View>
        {!!locationNote && <Text style={s.locationNote}>{locationNote}</Text>}
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message="We couldn't load lesson offers."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : offers.length === 0 ? (
        effectiveRadius != null ? (
          <EmptyState
            icon="school-outline"
            title={`No lessons within ${effectiveRadius} mi`}
            message="Try a wider area or another lesson type."
            action={{ label: 'Show lessons anywhere', onPress: () => setRadius(null) }}
          />
        ) : (
          <EmptyState
            icon="school-outline"
            title="No lesson offers match"
            message="Coaches post sessions and clinics here — check back soon."
          />
        )
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item }) => {
            const travel = travelAreaLabel(item);
            const miles = item.distance_miles != null ? `${item.distance_miles} mi` : null;
            return (
              <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => router.push(`/lessons/${item.id}` as never)}>
                <View style={s.cardRow}>
                  <Image
                    source={item.photo_url ? { uri: item.photo_url } : DEFAULT_LESSON_COVER}
                    style={s.thumb}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.cardSub}>
                      {typeLabel(item.offer_type)}{item.coach_name ? ` · ${item.coach_name}` : ''}
                    </Text>
                    {!!item.facility_name && (
                      <Text style={s.cardLocation} numberOfLines={1}>
                        {miles && !travel ? `${miles} · ` : ''}{item.facility_name} · {item.city}, {item.state}
                      </Text>
                    )}
                    {!!travel && (
                      <Text style={s.cardTravel} numberOfLines={1}>
                        {miles && !item.facility_name ? `${miles} · ` : ''}{travel}
                      </Text>
                    )}
                    <PriceRow item={item} isMember={isMember} />
                  </View>
                  {item.premium_only && (
                    <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>PREMIUM</Text></View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
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
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  filters: {
    backgroundColor: L.bg, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: shape.panel, backgroundColor: L.page,
  },
  searchInput: { flex: 1, color: L.text, fontSize: text.body.size, padding: 0 },
  chipRow: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: shape.pill,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  chipOn: { backgroundColor: L.navy, borderColor: L.navy },
  chipText: { color: L.navy, fontSize: text.caption.size, fontWeight: '700' },
  chipTextOn: { color: L.bg },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  sortLabel: { color: L.textSub, fontSize: text.caption.size, fontWeight: '700', marginRight: 2 },
  locationNote: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', paddingHorizontal: 16 },

  card: { backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border, padding: 12 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: shape.cta },
  cardTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  cardSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  memberHint: {
    color: L.gold, fontSize: text.caption.size, fontWeight: '700', marginTop: 2,
  },
  cardLocation: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  cardTravel: { color: L.navy, fontSize: text.caption.size, fontWeight: '600', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  priceStrike: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textDecorationLine: 'line-through' },
  priceNow: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  pctOff: { color: colors.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },

  premiumBadge: { backgroundColor: L.navy, borderRadius: shape.badge, paddingHorizontal: 6, paddingVertical: 3 },
  premiumBadgeText: { color: L.bg, fontSize: 9, fontWeight: '800' },
});
